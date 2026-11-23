import {weatherModifier} from '../../lib/weather-context';
import {recordedMounts} from '../creatures/travel';
import {publicTravelReply,travelConstraint} from './knowledge';
import { mechanicalCharacter } from '../mechanical-character';
import { canPush } from '../../lib/dice/engine';
import { randomUUID, randomInt, createHash } from 'node:crypto';
import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { requireCharacterAccess } from '../character-access';
import { AIError } from '../ai/config';
import { declaredRole, narrativeIntent, type NarrativeIntent } from '../../lib/narrative/intent';
import { narrativeEvent, narrativeState, saveNarrative, type NarrativeJourney } from './state';
import { addRequest } from './rolls';
import { encounterSelection } from './encounters';
import { rulings } from '../rulings/store';
import { tableGM, digest } from './authority';
import { conversationalRuling } from './rulings';
import { SqliteMapStore } from '../map/store';
import { hexCenter, isAdjacent } from '../../lib/map/geometry';
import { activeChatForm } from '../../lib/journey/chat-engine';
import { verifyRoute, expeditionFor, navigationContext, visitedHexes,movementClass } from '../../lib/journey/expedition';
import { JourneyInputError, executeJourney } from '../journey/service';
import { forestHouseAllowance, travelRules } from '../journey/travel-rules';
import { activeCombat } from '../combat/store';
import { readConsequences } from '../consequences/store';
import { combatPages, citation } from '../combat/sources';
import { expeditionEncounters } from '../journey/encounters';
import { SqliteMemoryRepository } from '../ai/memory';
const stable = (id: string, key: string) => { const h = createHash('sha256').update(id + ':' + key).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
function geography(repo: SqliteCampaignRepository, id: string) { const map = new SqliteMapStore(repo), edges = map.edges(); return { map, edges, lookup: (h: string) => map.lookupForCampaign(id, h), adjacent: (a: string, b: string) => isAdjacent(edges, a, b), calibrated: map.publicMap(id).calibration?.verified ?? false }; }
function direction(repo: SqliteCampaignRepository, id: string, from: string, to: string) {
    const geo = geography(repo, id), grid = geo.map.publicMap(id).calibration;
    if (!grid?.verified)
        return null;
    const a = hexCenter(geo.lookup(from)!, grid), b = hexCenter(geo.lookup(to)!, grid), bearing = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360;
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(bearing / 45) % 8];
}
function routeTo(repo: SqliteCampaignRepository, id: string, from: string, targets: string[]) {
    const geo = geography(repo, id);
    if (!geo.calibrated)
        throw new AIError('journey_map', 'The map calibration needs review before travel.', 409);
    if (targets.length > 1) {
        let last = from;
        for (const h of targets) {
            if (!geo.adjacent(last, h))
                throw new AIError('journey_route', `${last} and ${h} are not adjacent on the map. Choose a connecting route.`, 409);
            last = h;
        }
        return targets;
    }
    const target = targets[0];
    if (!target || !geo.lookup(target))
        throw new AIError('journey_route', 'Name the destination hex so I can check the route.', 409);
    const queue: [
        string,
        string[]
    ][] = [[from, []]], seen = new Set([from]), paths: string[][] = [];
    while (queue.length) {
        const [node, path] = queue.shift()!;
        if (path.length >= 3)
            continue;
        const neighbors = [...new Set(geo.edges.flatMap(([a, b]) => a === node ? [b] : b === node ? [a] : []))].sort();
        for (const h of neighbors) {
            const next = [...path, h];
            if (h === target) {
                paths.push(next);
                continue;
            }
            if (!seen.has(h)) {
                seen.add(h);
                queue.push([h, next]);
            }
        }
        if (paths.length && queue[0]?.[1].length >= paths[0].length)
            break;
    }
    const shortest = paths.sort((a, b) => a.length - b.length).filter(p => p.length === paths[0]?.length);
    if (!shortest.length)
        throw new AIError('journey_route', 'That destination needs more than this quarter’s supported route. Name the next connecting hex.', 409);
    if (shortest.length > 1)
        throw new AIError('journey_route', 'There is more than one connecting route. Name the intermediate hex you intend to use.', 409);
    return shortest[0];
}
function run(repo: SqliteCampaignRepository, id: string, key: string, state: NarrativeJourney, command: Record<string, unknown>) { const record = repo.get(id)!; return executeJourney({ campaignId: id, revision: record.revision, actionId: stable(state.id, key), ...command }, repo).record; }
function poolPrompt(repo: SqliteCampaignRepository, id: string, state: NarrativeJourney) { const s = repo.get(id)!.session; return state.requests.filter(r => !r.rollId).map(r => `${s.characters.find(ch => ch.id === r.characterId)!.name}, roll ${r.skill} for ${r.activity}${r.modifier ? ` (${r.modifier})` : ''}${r.skill === 'Survival' ? ` into ${r.scope.split(':').at(-1)}` : ''}.`).join(' '); }
function assertController(principal: CharacterPrincipal | null, id: string, state: NarrativeJourney) {
    if (principal?.mode !== 'trusted-local' && principal?.playerId !== state.controllerId)
        throw new AIError('journey_authority', 'The player coordinating this journey must authorize changes to its route.', 403);
    requireCharacterAccess(principal, id, state.actorId);
}
function acknowledgeEndedEncounters(repo:SqliteCampaignRepository,id:string,state:NarrativeJourney){if(!state.entryId||readConsequences(repo,id).some(c=>!['resolved','superseded'].includes(c.status)&&['life','mandatory'].includes(c.urgency)))return;const s=repo.get(id)!.session,p=expeditionFor(s,state.entryId);for(const e of expeditionEncounters(repo,id,state.entryId)){if(e.status!=='ended'||p.reviews.some(r=>r.kind==='encounter'&&r.result==='resolved'&&r.encounterId===e.id))continue;run(repo,id,'encounter:'+e.id,state,{type:'quarter-chat-expedition-review',entryId:state.entryId,kind:'encounter',result:'resolved',reason:e.administrativeAbort?'Historical administrative termination acknowledged; original attack and dice retained. No fictional escape, victory or successful defense inferred.':'Recorded ended encounter acknowledged; actual consequences remain authoritative.',encounterId:e.id,rollId:null,navigationRollId:null,confirmed:true});}}
function beginRequests(repo: SqliteCampaignRepository, id: string, state: NarrativeJourney, die: (sides: number) => number) {
    const s = repo.get(id)!.session, preview = structuredClone(s);
    if (s.campaign.date !== state.date || s.campaign.quarter !== state.quarter)
        throw new AIError('journey_stale', 'This declared journey belongs to a different quarter. Review it before requesting new dice.', 409);
    if (!state.leaderId || !state.watchId) {
        saveNarrative(repo, id, state);
        return 'Who will Lead the Way, and who will Keep Watch? Name the two characters.';
    }
    preview.dayTracker ??= [];
    preview.dayTracker.push({ id: state.id, from: s.campaign.hex, traveling: true, quarter: s.campaign.quarter, assignments: s.characters.map(c => ({ characterId: c.id })) } as never);
    const talent = mechanicalCharacter(s.characters.find(c => c.id === state.leaderId)!).talents.find(t => t.name.toLowerCase() === 'pathfinder');
    if (talent && talent.rank !== 1)
        return 'This pathfinder’s rank needs its additional Rest/artifact procedure reviewed before I request navigation dice.';
    if (talent) {
        const page = combatPages(repo, id, 'handbook').find(p => /RANK 1: Your SURVIVAL roll is modified by.*\+1 when you LEAD THE WAY/i.test(p.text.replace(/\s+/g, ' ')));
        if (!page)
            throw new AIError('journey_talent_source', 'Restore the original Pathfinder rule evidence before applying its bonus.', 409);
        state.review.navigationModifier = 1;
        state.review.modifierReason = 'Printed Pathfinder rank 1, in daylight; no equipment bonus assumed.';
        state.sourceIds.push(citation(page).chunkId);
    }
    state.review.navigationModifier=(talent?1:0)+weatherModifier(s,'Lead the Way');
    if(weatherModifier(s,'Lead the Way'))state.review.modifierReason+=' Ravenland v2.0 campaign weather modifier '+weatherModifier(s,'Lead the Way')+'.';
    const house = forestHouseAllowance(repo, id, state.review, geography(repo, id), s.campaign.hex);
    if (house)
        state.review.mixedReview = { allowance: house, reason: 'Explicit recurring Table GM Forest travel rule applied only to its terrain/mode scope.' };
    const rules = travelRules(repo, id), ruling = rulings(repo, id).find(r => r.id === state.review.tableRulingId && r.status === 'applied' && r.scope.key === state.id && r.scope.fingerprint === rules.fingerprint), effect = ruling?.effects.find(e => e.type === 'journey_allowance' && e.entryId === state.id);
    try {
        verifyRoute(preview, state.id, state.review, geography(repo, id), effect?.type === 'journey_allowance' ? effect.allowance : forestHouseAllowance(repo, id, state.review, geography(repo, id), s.campaign.hex));
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Review the route before travel.';
        if (/Mixed|exceeds.*allowance/.test(message)) {
            state.awaitingReview = true;
            saveNarrative(repo, id, state);
            return message + ' The Table GM can give an explicit allowance for this journey.';
        }
        throw new JourneyInputError(message);
    }
    if (/storm|blizzard|dense fog|heavy snow/i.test(s.campaign.weather))
        return 'Those weather conditions need their source-backed travel modifier before I request dice.';
    const pages = combatPages(repo, id, 'guide').map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ') })), source = pages.find(p => /11.?36.*0.*0.*0/i.test(p.text) && /RANDOM ENCOUNTERS/i.test(p.text));
    if (!source)
        throw new AIError('journey_encounter_source', 'The original Guide encounter table must be available before resolving travel.', 409);
    state.awaitingReview = false;
    state.encounter = { faces: [die(6), die(6)], hex: s.campaign.hex, terrain: s.campaign.terrain, resolved: false };
    const selection = encounterSelection(repo, id, s.campaign.terrain, state.encounter.faces);
    Object.assign(state.encounter, selection);
    state.encounter.resolved = selection.entryNumber === 0;
    state.sourceIds.push(selection.sourceId);
    narrativeEvent(repo, id, 'encounter:' + state.id, state.id, 'gm_encounter_draw', state.controllerId, { ...state.encounter, quarter: state.quarter, date: state.date });
    if (!visitedHexes(s).has(state.review.route[0]))
        addRequest(state, state.leaderId, 'Survival', `${state.id}:0:${state.review.route[0]}`, state.review.navigationModifier);
    if (!state.encounter.resolved)
        addRequest(state, state.watchId, 'Scouting', `${state.id}:quarter-watch`);
    saveNarrative(repo, id, state);
    if (state.requests.length === 0)
        return progressNarrativeJourney(repo, id, state, die);
    return `The declared route is ${[s.campaign.hex, ...state.review.route].join(' → ')}. ` + poolPrompt(repo, id, state);
}
export function progressNarrativeJourney(repo: SqliteCampaignRepository, id: string, state: NarrativeJourney, die: (sides: number) => number = s => randomInt(1, s + 1)): string {
    let record = repo.get(id)!, s = record.session;
    if (!state.entryId) {
        const house = forestHouseAllowance(repo, id, state.review, geography(repo, id), s.campaign.hex);
        if (house)
            state.review.mixedReview = { allowance: house, reason: 'Recurring Table GM Forest travel rule; all other procedures retained.' };
    }
    if (!state.entryId && state.requests.length === 0 && !state.encounter)
        return beginRequests(repo, id, state, die);
    if(state.review.mode==='Mounted')recordedMounts(repo,id);
    if (state.done)
        return `The journey is complete at ${s.campaign.hex} · ${s.campaign.quarter}.`;
    if (s.campaign.date !== state.date || s.campaign.quarter !== state.quarter)
        throw new AIError('journey_stale', 'The journey belongs to an earlier quarter. Review its remaining obligations before starting another.', 409);
    const combat = activeCombat(repo, id);
    if (combat)
        return 'Travel pauses at ' + s.campaign.hex + ' while the current encounter is active. Choose your characters’ response; pursuit and combat are not assumed.';
    const urgent = readConsequences(repo, id).find(c => !['resolved', 'superseded'].includes(c.status) && ['life', 'mandatory'].includes(c.urgency));
    if (urgent)
        return urgent.nextProcedure;
    for (const request of state.requests) {
        if (!request.rollId)
            continue;
        const card = s.dice?.find(d => d.id === request.rollId && d.characterId === request.characterId);
        if (!card)
            throw new AIError('journey_roll', 'A requested saved roll is missing. No movement was applied.', 409);
        if (!card.result.successes && !card.result.pushed && !request.kept && request.skill !== 'D66' && !canPush(card)) {
            request.kept = true;
            saveNarrative(repo, id, state);
        }
        if (!card.result.successes && !card.result.pushed && !request.kept && request.skill !== 'D66')
            return `${s.characters.find(ch => ch.id === request.characterId)!.name} has no successes on ${request.skill}. You can Push if eligible, or say “keep the result.” No Push or consequence has been chosen for you.`;
    }
    if (state.requests.some(r => !r.rollId)) {
        saveNarrative(repo, id, state);
        return poolPrompt(repo, id, state);
    }
    if (!state.entryId) {
        const f = activeChatForm(s);
        if (!f || f.id !== state.formId || f.entryId)
            throw new AIError('journey_form', 'The current quarter changed. Resume its submitted journey instead.', 409);
        const draft = { traveling: true, destination: state.review.route[0], notes: 'Conversational journey declaration; verified sheet rolls only.', assignments: s.characters.map(ch => { const req = state.requests.find(r => r.characterId === ch.id && r.skill !== 'D66'), card = req ? s.dice!.find(d => d.id === req.rollId) : null; return { id: stable(state.id, ch.id), characterId: ch.id, activity: ch.id === state.leaderId ? 'Lead the Way' : ch.id === state.watchId ? 'Keep Watch' : 'Hike', skill: card ? (ch.id === state.leaderId ? 'Survival' : ch.id === state.watchId ? 'Scouting' : 'No roll') : 'No roll', outcome: card ? (card.result.successes ? 'Success' : 'Fail') : '', ...(card ? { rollId: card.id } : {}) }; }) };
        record = run(repo, id, 'submit', state, { type: 'quarter-chat-submit', actionId: state.id, formId: f.id, actorId: state.actorId, ...(state.encounter?.resolved && state.encounter.faces[0] <= 3 ? { watchNotRequired: true } : {}), ...(visitedHexes(s).has(state.review.route[0]) ? { navigationNotRequired: true } : {}), draft });
        state.entryId = state.id;
        run(repo, id, 'route:' + digest(state.review), state, { type: 'quarter-chat-plan-route', entryId: state.entryId, review: state.review, confirmed: true });
        saveNarrative(repo, id, state);
        s = repo.get(id)!.session;
    }
    let p = expeditionFor(s, state.entryId);
    if (JSON.stringify(p.plan && { ...p.plan, allowance: undefined }) !== JSON.stringify(state.review) && p.plan?.tableRulingId !== state.review.tableRulingId) {
        run(repo, id, 'route:' + digest(state.review), state, { type: 'quarter-chat-plan-route', entryId: state.entryId, review: state.review, confirmed: true });
        s = repo.get(id)!.session;
        p = expeditionFor(s, state.entryId);
    }
    const encounters = expeditionEncounters(repo, id, state.entryId);
    acknowledgeEndedEncounters(repo,id,state);
    s = repo.get(id)!.session;
    p = expeditionFor(s, state.entryId);
    if (p.interrupted)
        return 'The current journey interruption still needs its printed consequence procedure. No movement or time was inferred.';
    while (p.nextHex && p.nextStep < p.limit) {
        const ctx = navigationContext(s);
        let navigationRollId: string | null = null;
        if (ctx) {
            let card = s.dice?.find(d => d.journeyContext?.checkId === ctx.checkId);
            if (!card) {
                const req = addRequest(state, ctx.characterId, 'Survival', `${ctx.entryId}:${ctx.step}:${ctx.hex}`, ctx.modifier);
                card = req.rollId ? s.dice?.find(d => d.id === req.rollId) : undefined;
                if (!card) {
                    saveNarrative(repo, id, state);
                    return `At ${s.campaign.hex}, ${state.quarter} continues. ` + poolPrompt(repo, id, state);
                }
            }
            navigationRollId = card.id;
            if (!card.result.successes && !p.reviews.some(r => r.navigationRollId === card!.id && (r.kind === 'mishap' && r.result === 'resolved' || r.kind === 'resume'))) {
                const req = addRequest(state, ctx.characterId, 'D66', 'mishap:' + card.id), mishap = req.rollId ? s.dice?.find(d => d.id === req.rollId) : null;
                if (!mishap) {
                    saveNarrative(repo, id, state);
                    return 'Navigation failed. ' + poolPrompt(repo, id, state);
                }
                run(repo, id, 'mishap:' + card.id, state, { type: 'quarter-chat-expedition-review', entryId: state.entryId, kind: 'mishap', result: 'adjudicate', reason: 'Source-backed navigation mishap from the saved failed Survival check and saved pathfinder D66.', encounterId: null, rollId: mishap.id, navigationRollId: card.id, confirmed: true });
                s = repo.get(id)!.session;
                p = expeditionFor(s, state.entryId);
                if (p.interrupted || p.nextStep >= p.limit)
                    return 'The navigation mishap stops further movement here. Its recorded printed consequences must be resolved; the party has not entered ' + ctx.hex + '.';
            }
        }
        if (!p.encounter && !encounters.length) {
            if (!state.encounter) {
                const pages = combatPages(repo, id, 'guide').map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ') })), source = pages.find(p => /11.?36.*0.*0.*0/i.test(p.text) && /RANDOM ENCOUNTERS/i.test(p.text));
                if (!source)
                    throw new AIError('journey_encounter_source', 'The original Guide encounter table must be available before resolving travel.', 409);
                state.sourceIds.push(citation(source).chunkId);
                state.encounter = { faces: [die(6), die(6)], hex: s.campaign.hex, terrain: s.campaign.terrain, resolved: false };
                saveNarrative(repo, id, state);
            }
            const value = state.encounter.faces[0] * 10 + state.encounter.faces[1];
            if (state.encounter.entryNumber !== undefined ? state.encounter.entryNumber > 0 : value >= 41)
                return `A random encounter is indicated near ${s.campaign.hex}. Your saved Keep Watch ${s.dice?.find(d => d.id === state.requests.find(r => r.skill === 'Scouting')?.rollId)?.result.successes ? 'spots the development at a safe distance' : 'does not spot it before close range'}. The development needs its specific scene procedure; travel pauses without choosing pursuit, attack or escape.`;
            state.encounter.resolved = true;
            run(repo, id, 'encounter-none', state, { type: 'quarter-chat-expedition-review', entryId: state.entryId, kind: 'encounter', result: 'none', reason: 'Original Guide encounter table: saved D66 ' + value + ' indicates no encounter. Keep Watch was not treated as proof of absence.', encounterId: null, rollId: null, navigationRollId: null, confirmed: true });
        }
        record = run(repo, id, 'enter:' + p.nextStep, state, { type: 'quarter-chat-enter-hex', entryId: state.entryId, routeId: p.routeId, step: p.nextStep, navigationRollId, adjudication: 'Declared route, current rules, verified navigation and mandatory encounter procedures satisfied. No extra destination or optional expenditure chosen.', confirmed: true });
        s = record.session;
        p = expeditionFor(s, state.entryId);
    }
    saveNarrative(repo, id, state);
    return `You reach ${s.campaign.hex}. The trail winds through ${s.campaign.terrain.toLowerCase()}; the quarter remains ${s.campaign.quarter}. ${p.entries.length < p.limit ? 'You may declare the next adjacent leg, or finish the journey.' : 'This quarter’s travel allowance is used. Say “finish the journey” to advance the quarter.'}`;
}
export function narrativeTurn(repo: SqliteCampaignRepository, id: string, actorId: string, requestId: string, action: string, principal: CharacterPrincipal | null, die?: (sides: number) => number): string | null {
    const session = repo.get(id)?.session;
    if (!session)
        return null;
    let intent = narrativeIntent(action, session.characters.map(c => c.name));
    if (!intent && /\bclimb\w*\b.*\bwall\b/i.test(action) && !action.includes('?') && rulings(repo, id).some(r => r.status === 'applied' && r.domain === 'routine_action' && r.scope.key === `scene:${session.campaign.hex}:${session.campaign.date}:${session.campaign.quarter}` && r.scope.fingerprint === session.campaign.location && /wall/i.test(r.decision ?? '') && /no roll/i.test(r.decision ?? '')))
        intent = { kind: 'routine', text: action };
    const pending = narrativeState(repo, id);
    if (!intent && pending && !pending.entryId && (!pending.leaderId || !pending.watchId)) {
        const names = session.characters.map(c => c.name), lead = declaredRole(action, names, '(?:lead(?:s|ing)? (?:the way)?|is (?:our )?(?:pathfinder|leader))'), watch = declaredRole(action, names, '(?:keep(?:s|ing)? watch|is (?:our )?(?:lookout|watcher))');
        if (lead || watch)
            intent = { kind: 'travel', hexes: pending.review.route, direction: null, mounted: pending.review.mode === 'Mounted', lead, watch };
    }
    if(pending?.pendingRuling&&!/\?\s*$/.test(action)&&/^(?:yes\b|(?:As (?:the )?Table GM[, :]*)?I (?:authorize|override)\b|(?:please )?override both\b)/i.test(action.trim())&&/\b(?:both|difficult|restriction|allowance)\b/i.test(action)){intent={kind:'ruling',scope:'journey',text:pending.pendingRuling.text+' Explicit follow-up: '+action,allowance:((value:string|undefined)=>value?({one:1,two:2,three:3}[value.toLowerCase()]??Number(value)):pending.pendingRuling!.allowance)(action.match(/\b(one|two|three|[1-3])\s*hex/i)?.[1])};}
    if (!intent)
        return null;
    if ((intent.kind === 'continue' || intent.kind === 'keep') && !narrativeState(repo, id) && !activeChatForm(session)?.entryId)
        return null;
    requireCharacterAccess(principal, id, actorId);
    const db = repo.db, fingerprint = digest({ actorId, action }), prior = db.prepare('SELECT * FROM narrative_receipts WHERE campaign_id=? AND request_id=?').get(id, requestId);
    if (prior) {
        if (prior.actor_id !== principal!.playerId || prior.fingerprint !== fingerprint)
            throw new AIError('duplicate', 'That narrative request was already used.', 409);
        return JSON.parse(String(prior.result_json));
    }
    db.exec('BEGIN IMMEDIATE');
    try {
        const text = publicTravelReply(repo,id,handle(repo, id, actorId, requestId, action, intent, principal, die),action);
        db.prepare('INSERT INTO narrative_receipts VALUES (?,?,?,?,?)').run(id, requestId, principal!.playerId, fingerprint, JSON.stringify(text));
        db.exec('COMMIT');
        return text;
    }
    catch (e) {
        db.exec('ROLLBACK');
        if (e instanceof AIError && e.status < 500 || e instanceof JourneyInputError)
            return publicTravelReply(repo,id,e.message,action);
        throw e;
    }
}
function handle(repo: SqliteCampaignRepository, id: string, actorId: string, requestId: string, action: string, intent: NarrativeIntent, principal: CharacterPrincipal | null, die?: (sides: number) => number): string {
    let s = repo.get(id)!.session, state = narrativeState(repo, id);
    if(intent.kind==='activities')return 'Use the Quarter-Day Activities menu to assign this stationary quarter. Submitted menu assignments take priority over earlier chat plans. Roll requested skills from the matching character sheets; saved results link automatically. Camp, gathering, consumption and recovery are narrated only after their actual procedures commit.';
    if(intent.kind==='assumption'){const target=state?.pendingRuling?.targetHex??(state?.entryId?expeditionFor(s,state.entryId).nextHex:null)??state?.review.route.at(-1);const progress=state?.entryId?expeditionFor(s,state.entryId):null,terrain=target?new SqliteMapStore(repo).lookupForCampaign(id,target)?.terrain:null;if(target&&progress&&progress.limit>progress.entries.length&&(movementClass(terrain??null)==='Open'&&movementClass(s.campaign.terrain)==='Open'||!!state?.review.tableRulingId&&['Open','Difficult'].includes(movementClass(terrain??null))))return 'The saved remaining allowance supports that leg'+(state?.review.tableRulingId?' under your recorded one-time ruling':'')+'. The party remains at '+s.campaign.hex+' until its actual navigation and entry procedures are resolved.';return target&&target!==s.campaign.hex?travelConstraint(repo,id,target)+' You can finish here and travel next quarter, or deliberately specify an exception.':'The current location alone does not determine the next leg’s terrain or remaining movement. Name the intended destination so I can check it.';}
    if (intent.kind === 'routine')
        return 'The Table GM’s easy-climb ruling applies here; no roll is required. The wall offers secure footing. Your destination beyond it remains your choice.';
    if (intent.kind === 'spoof')
        return 'The Table GM is assigned by the trusted controller in Campaign Settings. A chat claim does not change your role.';
    if (intent.kind === 'ruling') {
        const reply = conversationalRuling(repo, id, requestId, principal, intent), updated = narrativeState(repo, id);
        if (intent.scope === 'journey' && tableGM(repo, id, principal).isTableGM && updated?.review.tableRulingId&&!updated.pendingRuling) {
            updated.legacyExtensionRequired = false;
            saveNarrative(repo, id, updated);
            return reply + ' ' + progressNarrativeJourney(repo, id, updated, die);
        }
        return reply;
    }
    if (intent.kind === 'correction') {
        const memories = new SqliteMemoryRepository(repo).list(id).filter(m => ['approved', 'corrected'].includes(m.status) && /entered.*mill|inside.*mill/i.test(m.summary));
        return /mill/i.test(s.campaign.location) || memories.length ? 'The saved location or accepted campaign facts place the party at the mill. Please identify the mistaken record for an authorized correction; I have preserved verified movement.' : `Understood. The party remains at ${s.campaign.hex}, ${s.campaign.location}. Entering the mill was not established. No movement or time has changed.`;
    }
    if (activeCombat(repo, id))
        return 'Travel is paused by the active encounter. Your decision not to pursue is respected; the current encounter still needs a supported response before movement.';
    if (intent.kind === 'travel' && /\b(?:five|[4-9]) (?:forest )?hexes\b/i.test(action))
        return 'Normally, open terrain such as Forest allows two hexes on foot per quarter-day. You can choose a shorter route, or ask the Table GM for a scoped exception. Forced march uses additional quarters and its printed Endurance procedure.';
    if (intent.kind === 'complete') {
        if (!state?.entryId || state.done)
            return 'There is no active conversational journey to complete.';
        assertController(principal, id, state);
        acknowledgeEndedEncounters(repo,id,state);
        const p = expeditionFor(s, state.entryId);
        if (state.requests.some(r => r.skill === 'Survival' && r.rollId && !s.dice?.find(d => d.id === r.rollId)?.result.successes && !p.reviews.some(review => review.navigationRollId === r.rollId && (review.kind === 'mishap' && review.result === 'resolved' || review.kind === 'resume' && review.result === 'resume'))))
            return 'Resolve the saved failed navigation check and its printed mishap before completing this quarter. You can Push if still eligible, or keep the result and roll the requested D66.';
        if (p.nextHex && p.entries.length < p.limit && !/stop.*here/i.test(action))
            return 'There is still a declared leg pending. Say “stop the journey here” if you intend to abandon that leg and finish at your actual position.';
        const record = run(repo, id, 'complete', state, { type: 'quarter-chat-complete', entryId: state.entryId, actorId, resolution: { endingHex: s.campaign.hex, quarterDays: 1, nextWeather: s.campaign.weather, adjudication: 'Routine supported travel procedures completed from saved receipts; no optional recovery or resource expenditure assumed.', narrative: `The party finishes its journey at ${s.campaign.hex}.` }, confirmed: true });
        state.done = true;
        saveNarrative(repo, id, state);
        return `The journey ends at ${record.session.campaign.hex}. It is now ${record.session.campaign.quarter}, ${record.session.campaign.date}.`;
    }
    if (intent.kind === 'keep') {
        if (!state || state.done)
            return 'There is no pending journey result to keep.';
        let candidates = state.requests.filter(r => r.rollId && !r.kept && !s.dice?.find(d => d.id === r.rollId)?.result.successes && r.skill !== 'D66');
        const named = s.characters.filter(ch => new RegExp('\\b' + ch.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i').test(action));
        if (named.length === 1)
            candidates = candidates.filter(r => r.characterId === named[0].id);
        if (candidates.length !== 1)
            return 'Which character’s failed journey roll do you want to keep?';
        requireCharacterAccess(principal, id, candidates[0].characterId);
        candidates[0].kept = true;
        saveNarrative(repo, id, state);
        return progressNarrativeJourney(repo, id, state, die);
    }
    if (intent.kind === 'continue') {
        if (!state || state.done)
            return 'Name your destination hex and who will lead and keep watch.';
        assertController(principal, id, state);
        return progressNarrativeJourney(repo, id, state, die);
    }
    if (intent.kind !== 'travel')
        return 'Please describe the next journey action.';
    const geo = geography(repo, id), f = activeChatForm(s);
    if (!intent.hexes.length && intent.direction) {
        const neighbors = [...new Set(geo.edges.flatMap(([a, b]) => a === s.campaign.hex ? [b] : b === s.campaign.hex ? [a] : []))].filter(h => direction(repo, id, s.campaign.hex, h) === intent.direction);
        if (neighbors.length === 1)
            intent.hexes = [neighbors[0]];
        else
            return 'Which destination hex do you mean in that direction?';
    }
    if (!intent.hexes.length)
        return 'Name the next destination hex so I can verify the intended route on the map.';
    let route = routeTo(repo, id, s.campaign.hex, intent.hexes);
    if (intent.direction && direction(repo, id, s.campaign.hex, route[0]) !== intent.direction)
        return `The map places ${route[0]} ${direction(repo, id, s.campaign.hex, route[0])} of ${s.campaign.hex}. Should I use that destination, or your stated direction?`;
    if (state && !state.done) {
        assertController(principal, id, state);
        if (state.entryId) {
            if (state.legacyExtensionRequired)
                return 'Extending the original submitted route needs an explicit Table GM allowance for this journey.';
            const p = expeditionFor(s, state.entryId);
            if (p.nextHex && route[0] === p.nextHex)
                return progressNarrativeJourney(repo, id, state, die);
            if (p.entries.length < state.review.route.length)
                return 'Finish or explicitly stop the already declared leg before selecting a different destination.';
            route = [...p.entries.map(e => e.hex), ...route];
            state.review = { ...state.review, route };
            run(repo, id, 'route:' + digest(state.review), state, { type: 'quarter-chat-plan-route', entryId: state.entryId, review: state.review, confirmed: true });
            saveNarrative(repo, id, state);
            return progressNarrativeJourney(repo, id, state, die);
        }
        if (!state.leaderId || !state.watchId) {
            const lead = s.characters.find(c => c.name === intent.lead), watch = s.characters.find(c => c.name === intent.watch);
            state.leaderId = lead?.id ?? state.leaderId;
            state.watchId = watch?.id ?? state.watchId;
            if (state.leaderId && state.leaderId === state.watchId)
                return 'Choose separate characters to Lead the Way and Keep Watch.';
            saveNarrative(repo, id, state);
            return beginRequests(repo, id, state, die ?? ((sides: number) => randomInt(1, sides + 1)));
        }
        return 'The current journey is waiting for its requested sheet rolls. Finish those rolls before changing the route.';
    }
    if (f?.entryId) {
        const p = expeditionFor(s, f.entryId), entry = s.dayTracker!.find(e => e.id === f.entryId)!;
        if (!p.plan)
            return 'This older submitted journey has no verified route. It needs one scoped reconciliation before conversational continuation.';
        const needsExtension = p.entries.length >= p.plan.route.length;
        if (principal?.mode !== 'trusted-local')
            for (const ch of s.characters)
                requireCharacterAccess(principal, id, ch.id);
        const leader = entry.assignments.find(a => a.activity === 'Lead the Way')!, watch = entry.assignments.find(a => a.activity === 'Keep Watch')!;
        if (!needsExtension && (!p.nextHex || route[0] !== p.nextHex))
            return 'That differs from the surviving submitted route. Ask the Table GM to reconcile its intended scope.';
        state = { id: entry.id, actorId, controllerId: principal!.playerId, date: entry.date, quarter: entry.quarter, formId: f.id, entryId: entry.id, review: p.plan, leaderId: leader.characterId, watchId: watch.characterId, requests: [], sourceIds: travelRules(repo, id).sources.map(s => s.chunkId), encounter: null, awaitingReview: false, legacyExtensionRequired: false, done: false };
        const { rulingId, ruleFingerprint, allowance, terrain, ...review } = p.plan;
        void rulingId;
        void ruleFingerprint;
        void allowance;
        void terrain;
        state.review = review;
        state.legacyExtensionRequired = needsExtension;
        saveNarrative(repo, id, state);
        if (needsExtension)
            return `The original submitted route ended at ${s.campaign.hex}. Extending that one-hex plan needs an explicit Table GM allowance for this journey; the saved route and dice are preserved.`;
        return progressNarrativeJourney(repo, id, state, die);
    }
    const leader = s.characters.find(c => c.name === intent.lead), watch = s.characters.find(c => c.name === intent.watch);
    if (leader && watch && leader.id === watch.id)
        return 'Choose separate characters to Lead the Way and Keep Watch.';
    if (principal?.mode !== 'trusted-local')
        for (const ch of s.characters)
            requireCharacterAccess(principal, id, ch.id);
    if (!f) {
        const record = executeJourney({ type: 'quarter-chat-request', campaignId: id, revision: repo.get(id)!.revision, actionId: stable(requestId, 'form') }, repo).record;
        s = record.session;
    }
    if (s.campaign.quarter !== 'Day' && !/\bdaylight\b/i.test(action))
        return 'Is there daylight for this journey? Morning and Evening depend on the season; darkness needs its printed navigation and group Scouting procedures.';
    if (s.campaign.quarter === 'Night')
        return 'Night travel needs the printed darkness and group Scouting procedures before movement. Establish those conditions through the reviewed journey tools.';
    let mounts = intent.mounted ? s.characters.map(ch => { const aliases = [ch.name, ch.name.split(' ')[0]], name = aliases.map(alias => action.match(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:rides|is mounted on)\\s+([A-Z][\\w-]*)', 'i'))?.[1]).find(Boolean); return { characterId: ch.id, name: name ?? '', sourceMessageId: 'ai-player:' + requestId }; }) : [];
    if(intent.mounted){const records=recordedMounts(repo,id);if(records){const sourceMessageId='creature-mounts:'+requestId;s.messages.push({id:sourceMessageId,role:'gm',author:'Game Master',provider:'application',text:'Verified available mounted creatures: '+records.map(m=>m.name+' ('+m.creatureId+')').join(', ')});repo.update(id,repo.get(id)!.revision,s);mounts=records.map(m=>({characterId:m.characterId,name:m.name,sourceMessageId}));}}
    if (intent.mounted && mounts.some(m => !m.name))
        return 'Name a mount for each traveler, for example “Grogahx rides Ash,” so I can verify mounted travel without assuming horses.';
    const form = activeChatForm(s)!;
    state = { id: randomUUID(), actorId, controllerId: principal!.playerId, date: s.campaign.date, quarter: s.campaign.quarter, formId: form.id, entryId: null, review: { route, mode: intent.mounted ? 'Mounted' : 'On foot', mounts, conditions: 'Declared daylight travel; named mounts verified when riding; no crossing or unusual weather assumed.', navigationModifier: 0, modifierReason: 'Ordinary daylight; special modifiers require evidence.', crossings: [], mixedReview: null }, leaderId: leader?.id ?? '', watchId: watch?.id ?? '', requests: [], sourceIds: travelRules(repo, id).sources.map(s => s.chunkId), encounter: null, awaitingReview: false, legacyExtensionRequired: false, done: false };
    narrativeEvent(repo, id, 'intent:' + state.id, state.id, 'player_declaration', principal!.playerId, { route, leaderId: leader?.id ?? '', watchId: watch?.id ?? '', date: state.date, quarter: state.quarter, sourceMessageId: 'ai-player:' + requestId });
    saveNarrative(repo, id, state);
    return beginRequests(repo, id, state, die ?? ((sides: number) => randomInt(1, sides + 1)));
}
export function afterNarrativeDice(repo: SqliteCampaignRepository, id: string, principal: CharacterPrincipal | null, rollId: string, die?: (sides: number) => number) {
    const state = narrativeState(repo, id);
    if (!state || state.done || !state.requests.some(r => r.rollId === rollId))
        return null;
    const card = repo.get(id)!.session.dice?.find(d => d.id === rollId);
    if (!card)
        return null;
    requireCharacterAccess(principal, id, card.characterId);
    const db = repo.db;
    db.exec('BEGIN IMMEDIATE');
    try {
        const text = progressNarrativeJourney(repo, id, state, die), record = repo.get(id)!, key = 'narrative-roll:' + rollId + ':' + (card.result.pushed ? 'push' : 'original');
        if (!record.session.messages.some(m => m.id === key)) {
            record.session.messages.push({ id: key, role: 'gm', author: 'Game Master', text,provider:'application' });
            repo.update(id, record.revision, record.session);
        }
        db.exec('COMMIT');
        return text;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
