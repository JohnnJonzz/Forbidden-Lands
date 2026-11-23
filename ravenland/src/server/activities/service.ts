import {occupiedCamp,usableCamp} from '../../lib/campsites';
import {syncCampResult} from '../continuity/camps';
import { nextDate, quarters } from '../../lib/journey/clock';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { requireCharacterAccess } from '../character-access';
import { tableGM } from '../narrative/authority';
import { makeRuling, rulings } from '../rulings/store';
import { sheetFor, applySheet } from '../../lib/character-sheet';
import { currentRoutine, dueNeeds, type RoutineActivity } from '../../lib/activities';
import { stateFor, ensureNeeds, rank, newRequest, fresh, addProvisions, dateDistance } from './state';
import { activityRules, terrainModifiers } from './rules';
import { applyCampMishap, huntingKillRequest, finish, resolveActivityRoll } from './resolution';
import { historicalEligibility, afterActivityDice, validateActivityPool } from './dice';
import { activeCombat } from '../combat/store';
import { executeJourney } from '../journey/service';
export const activityCommand = z.object({ campaignId: z.string().uuid(), revision: z.number().int().positive(), requestId: z.string().uuid(), actorId: z.string(), operation: z.enum(['configure', 'prepare', 'keep', 'bind', 'prey-keep', 'prey-reroll', 'cook', 'review', 'reveal-camp', 'interrupt', 'complete', 'consume', 'resource', 'share', 'share-item', 'stock', 'unmet', 'review-need', 'cancel-consumption', 'meal-review', 'watch-threat']), assignmentId: z.string().optional(), entryId: z.string().optional(), target: z.enum(['food', 'water']).optional(), sourceId: z.string().optional(), recipientId: z.string().optional(), itemId: z.string().uuid().optional(), quantity: z.number().int().min(1).max(100).optional(), prey: z.number().int().min(1).max(6).optional(), rollId: z.string().uuid().optional(), choice: z.string().max(500).optional(), fire: z.boolean().optional(), kitchen: z.boolean().optional(), checkpoint: z.enum(['Morning', 'Day', 'Evening', 'Night']).optional(), season: z.enum(['Spring', 'Summer', 'Autumn', 'Winter']).optional(), reason: z.string().trim().max(5000).optional(), confirmed: z.literal(true) }).strict();
export type ActivityCommand = z.infer<typeof activityCommand>;
export function executeActivity(repo: SqliteCampaignRepository, raw: unknown, principal: CharacterPrincipal | null) {
    const c = activityCommand.parse(raw);
    requireCharacterAccess(principal, c.campaignId, c.actorId);
    const { revision: expectedRevision, ...identity } = c;
    void expectedRevision;
    const db = repo.db, hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
        const record = repo.get(c.campaignId);
        if (!record)
            throw Error('Campaign not found.');
        const prior = db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(c.campaignId, c.requestId);
        if (prior) {
            if (prior.fingerprint !== hash)
                throw Error('Activity request reused with different choices.');
            db.exec('COMMIT');
            return { record, replayed: true };
        }
        if (record.revision !== c.revision)
            throw Error('The campaign changed. Refresh this activity before applying the choice.');
        const s = record.session, st = stateFor(s), gm = tableGM(repo, record.id, principal).isTableGM, entry = currentRoutine(s), a = entry?.activities.find(a => a.assignmentId === c.assignmentId);
        let text = '';
        const requireGM = () => {
            if (!gm)
                throw Error('The assigned Table GM must approve this setting or specific ruling.');
        };
        const own = (id: string) => {
            if (!s.characters.some(ch => ch.id === id))
                throw Error('Choose an actual campaign character.');
            if (principal?.mode === 'trusted-local' && principal.playerId === 'trusted-local' && principal.grants.some(g => g.campaignId === record.id))
                return;
            requireCharacterAccess(principal, record.id, id);
        };
        const auditPortion = (kind:'ordinary_consumption'|'ordinary_transfer', p:typeof st.provisions[number], recipientId:string, detail:string) => {
            (st.continuityEvents??=[]).push({id:c.requestId,kind,actorId:principal!.playerId,date:s.campaign.date,quarter:s.campaign.quarter,recordedAt:new Date().toISOString(),sourceEntryId:p.originEntryId??null,sourceAssignmentId:p.originAssignmentId??null,sourceItemId:p.itemId,sourceRollId:p.originRollId??null,sourceOwnerId:c.sourceId??c.actorId,awarded:0,deducted:kind==='ordinary_consumption'?1:0,allocations:kind==='ordinary_consumption'?[{characterId:recipientId,resource:c.target??'food',amount:1,date:s.campaign.date,provenance:'verified_portion'}]:[],reason:detail});
        };
        if (c.operation === 'configure') {
            requireGM();
            if (c.checkpoint) {
                st.settings.checkpoint = c.checkpoint;
                const passed = quarters.indexOf(c.checkpoint) < quarters.indexOf(s.campaign.quarter);
                st.settings.effectiveDate = passed ? nextDate(s.campaign.date) : s.campaign.date;
                st.settings.effectiveQuarter = passed ? c.checkpoint : s.campaign.quarter;
            }
            if (c.season && st.settings.season !== c.season) {
                st.settings.season = c.season;
                for (const a of entry?.activities ?? [])
                    if (a.activity === 'Forage' && a.request && !a.request.rollId) {
                        a.request = null;
                        a.status = 'Awaiting preparation or resource allocation';
                        a.summary = 'Season changed. Prepare this Forage again before rolling.';
                    }
            }
            ensureNeeds(s);
            text = 'Daily Food & Water settings saved for the current and future checkpoints; earlier dates were not charged.';
        }
        else if (c.operation === 'meal-review') {
            requireGM();
            const p = st.provisions.find(p => p.itemId === c.itemId), recipient = c.recipientId ?? c.actorId;
            if (!p?.hazard || !s.characters.some(ch => ch.id === recipient) || !c.reason || c.reason.length < 20)
                throw Error('Record the actual printed poison/disease procedure for this specific item and recipient.');
            const fingerprint = p.itemId + '|' + recipient + '|' + s.campaign.date;
            makeRuling(repo, { campaignId: record.id, originId: c.requestId, sceneId: 'meal:' + s.campaign.date, domain: 'rules_conflict', question: 'Review the recorded food-safety procedure for one recipient', scope: { key: 'meal:' + p.itemId + ':' + recipient, fingerprint }, decision: c.reason, reasoning: 'Specific Table GM meal review. No consumption, cure, damage or supply change is inferred by this approval.', decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', requestId: c.requestId, receiptId: c.requestId, blockingReason: '', risk: 'bounded' });
            text = 'This recipient’s specific meal procedure was reviewed for today. The source stack still retains its hazard; no portion was consumed.';
        }
        else if (['consume', 'resource', 'share', 'share-item', 'stock', 'unmet', 'review-need', 'cancel-consumption'].includes(c.operation)) {
            activityRules(repo, record.id);
            const recipientId = c.recipientId ?? c.actorId, sourceId = c.sourceId ?? c.actorId, resource = c.target ?? 'food';
            own(sourceId);
            if (c.operation === 'consume' || c.operation === 'unmet' || c.operation === 'stock' || c.operation === 'review-need' || c.operation === 'cancel-consumption')
                own(recipientId);
            if (!s.characters.some(ch => ch.id === recipientId))
                throw Error('Choose an actual recipient.');
            let n = st.needs.find(n => n.date === s.campaign.date && n.characterId === recipientId && n.resource === resource);
            if (!n) {
                n = { date: s.campaign.date, characterId: recipientId, resource, status: 'Pending', sourceId: null, itemId: null, request: null, rollId: null, receiptId: null, explanation: 'Not yet consumed.' };
                st.needs.push(n);
            }
            if (!['share', 'share-item', 'stock', 'review-need'].includes(c.operation) && n.status === 'Satisfied')
                throw Error('This daily ' + resource + ' requirement was already handled. No supply was charged again.');
            if (!['share-item', 'stock', 'cancel-consumption'].includes(c.operation) && n.request)
                throw Error('Resolve the existing consumption roll before choosing another source.');
            const source = s.characters.find(ch => ch.id === sourceId)!;
            if (c.operation === 'cancel-consumption') {
                if (!n.request)
                    throw Error('There is no outstanding unrolled consumption request.');
                n.request = null;
                n.status = 'Pending';
                n.sourceId = null;
                n.receiptId = c.requestId;
                n.explanation = 'The unrolled request was cancelled. No resources were consumed or restored.';
                text = n.explanation;
            }
            else if (c.operation === 'review-need') {
                requireGM();
                if (n.status !== 'Needs GM review' || !c.reason || c.reason.length < 20)
                    throw Error('Describe the specific reviewed daily condition procedure.');
                n.status = 'Unmet';
                n.explanation += ' Table GM reviewed: ' + c.reason;
                n.receiptId = c.requestId;
                text = n.explanation;
            }
            else if (c.operation === 'share-item') {
                const provision = st.provisions.find(p => p.itemId === c.itemId && p.ownerId === sourceId), sheet = sheetFor(source), item = sheet.gear?.find(g => g.itemId === c.itemId), quantity = c.quantity ?? 1;
                if (!provision || !item || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < quantity || sourceId === recipientId)
                    throw Error('Choose an available physical provision stack and another recipient.');
                const recipient = s.characters.find(ch => ch.id === recipientId)!, rs = sheetFor(recipient), whole = quantity === Number(item.quantity), itemId = whole ? item.itemId! : randomUUID();
                rs.gear ??= [];
                rs.gear.push({ ...item, itemId, quantity: String(quantity) });
                item.quantity = String(Number(item.quantity) - quantity);
                if (whole)
                    sheet.gear = sheet.gear!.filter(g => g !== item);
                s.characters = s.characters.map(ch => ch.id === sourceId ? applySheet(ch, sheet) : ch.id === recipientId ? applySheet(ch, rs) : ch);
                if (whole)
                    provision.ownerId = recipientId;
                else
                    st.provisions.push({ ...provision, itemId, ownerId: recipientId });
                text = 'Transferred ' + quantity + ' ' + provision.kind + ' to ' + recipient.name + '. Receiving supplies does not force consumption or satisfy a daily need.';
                auditPortion('ordinary_transfer',provision,recipientId,text);
            }
            else if (c.operation === 'stock') {
                const p = st.provisions.find(p => p.itemId === c.itemId && p.ownerId === sourceId), sheet = sheetFor(source), item = sheet.gear?.find(g => g.itemId === c.itemId), quantity = c.quantity ?? 1, key = ('res-' + resource) as 'res-food', dice = ['None', 'D6', 'D8', 'D10', 'D12'], current = dice.indexOf(String(sheet[key] ?? 'None'));
                if (sourceId !== recipientId || !p || p.kind !== (resource === 'food' ? 'Food' : 'Water') || !item || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < quantity || current < 0 || current + quantity > 4)
                    throw Error('Only available prepared Food or Water units may be explicitly stowed into the corresponding carried Resource Die, up to D12.');
                sheet[key] = dice[current + quantity];
                item.quantity = String(Number(item.quantity) - quantity);
                if (item.quantity === '0')
                    sheet.gear = sheet.gear!.filter(g => g !== item);
                s.characters = s.characters.map(ch => ch.id === sourceId ? applySheet(ch, sheet) : ch);
                text = 'Stowed ' + quantity + ' ' + p.kind + ' unit(s): carried ' + resource + ' is now ' + sheet[key] + '. Nothing was consumed.';
            }
            else if (c.operation === 'unmet') {
                if (n.status === 'Unmet')
                    throw Error('This unmet need was already resolved; no condition harm was repeated.');
                own(recipientId);
                if (!dueNeeds(s))
                    throw Error('The daily checkpoint is not due; supplies may still be acquired or shared.');
                if (!c.reason)
                    throw Error('Confirm that this need remains unmet after considering sharing and supplies.');
                const target = s.characters.find(ch => ch.id === recipientId)!, sheet = sheetFor(target);
                sheet[resource === 'food' ? 'cond-hungry' : 'cond-thirsty'] = true;
                n.status = 'Unmet';
                n.receiptId = c.requestId;
                n.explanation = 'Explicitly resolved without ' + resource + ': ' + c.reason + '. The official condition applies; existing damage/critical obligations remain.';
                const previous = st.needs.filter(v => v.characterId === recipientId && v.resource === resource && v.date !== s.campaign.date).sort((a, b) => -(dateDistance(a.date, b.date) ?? 0));
                let consecutive = 0, priorDate = s.campaign.date;
                for (const prior of previous.toReversed()) {
                    if (prior.status !== 'Unmet' || dateDistance(prior.date, priorDate) !== 1)
                        break;
                    consecutive++;
                    priorDate = prior.date;
                }
                const harm = resource === 'water' && consecutive >= 1 ? ['strength', 'agility'] : resource === 'food' && consecutive >= 7 && consecutive % 7 === 0 ? ['strength'] : [];
                for (const attr of harm) {
                    const key = ('attr-' + attr) as 'attr-strength', value = Number(sheet[key]);
                    if (!Number.isInteger(value) || value < 1) {
                        n.status = 'Needs GM review';
                        n.explanation += ' Review the existing Broken ' + attr + ' condition and its printed deadline; no death has been inferred.';
                    }
                    else {
                        sheet[key] = String(value - 1);
                        n.explanation += ' Daily condition caused 1 ' + attr + ' damage.';
                        if (value === 1) {
                            n.status = 'Needs GM review';
                            n.explanation += ' Broken due to a condition; review the printed recovery/death deadline, without a human critical injury.';
                        }
                    }
                }
                s.characters = s.characters.map(ch => ch.id === target.id ? applySheet(ch, sheet) : ch);
                text = n.explanation;
            }
            else if (c.operation === 'consume') {
                const provision = st.provisions.find(p => p.itemId === c.itemId && p.ownerId === sourceId), sheet = sheetFor(source), item = sheet.gear?.find(g => g.itemId === c.itemId);
                if (!provision || !item || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1)
                    throw Error('Choose an available recorded provision owned by the source.');
                if (!fresh(s, provision))
                    throw Error('These raw provisions are older than their supported one-day freshness window. No portion was consumed.');
                if (provision.hazard && !rulings(repo, record.id).some(r => r.status === 'applied' && r.scope.key === 'meal:' + provision.itemId + ':' + recipientId && r.scope.fingerprint === provision.itemId + '|' + recipientId + '|' + s.campaign.date))
                    throw Error('This meal requires its specific GM food-safety procedure before consumption.');
                if (resource === 'food' && !['Vegetables', 'Meat', 'Fish', 'Food'].includes(provision.kind) || resource === 'water' && provision.kind !== 'Water')
                    throw Error('The selected item does not satisfy this need.');
                item.quantity = String(Number(item.quantity) - 1);
                if (item.quantity === '0')
                    sheet.gear = sheet.gear!.filter(g => g !== item);
                s.characters = s.characters.map(ch => ch.id === sourceId ? applySheet(ch, sheet) : ch);
                const recipient = s.characters.find(ch => ch.id === recipientId)!, rs = sheetFor(recipient);
                rs[resource === 'food' ? 'cond-hungry' : 'cond-thirsty'] = false;
                if (provision.chefRank >= 3) {
                    const v = Number(rs['attr-empathy']), max = Number(rs['attr-empathy-regular']);
                    if (v > 0 && Number.isInteger(max) && v < max && !rs['cond-thirsty'])
                        rs['attr-empathy'] = String(v + 1);
                }
                s.characters = s.characters.map(ch => ch.id === recipientId ? applySheet(ch, rs) : ch);
                n.status = 'Satisfied';
                n.sourceId = sourceId;
                n.itemId = provision.itemId;
                n.receiptId = c.requestId;
                n.explanation = 'One ' + provision.kind + ' from ' + source.name + ' was consumed by ' + recipient.name + '.';
                auditPortion('ordinary_consumption',provision,recipientId,n.explanation);
                text = n.explanation;
            }
            else {
                const sheet = sheetFor(source), key = ('res-' + resource) as 'res-food', dice = ['None', 'D6', 'D8', 'D10', 'D12'], sides = dice.indexOf(String(sheet[key] ?? 'None'));
                if (sides < 1)
                    throw Error(source.name + ' has no carried ' + resource + ' resource die.');
                if (c.operation === 'share') {
                    if (st.needs.some(v => v.sourceId === sourceId && v.resource === resource && v.request))
                        throw Error('Resolve the supplier’s outstanding consumption roll before transferring its die steps.');
                    if (sourceId === recipientId)
                        throw Error('Choose another recipient for sharing.');
                    const recipient = s.characters.find(ch => ch.id === recipientId)!, rs = sheetFor(recipient), ri = dice.indexOf(String(rs[key] ?? 'None')), steps = c.quantity ?? 1;
                    if (steps > sides || ri < 0 || ri + steps > 4)
                        throw Error('The proposed Resource Die step transfer exceeds the actual source or recipient capacity.');
                    sheet[key] = dice[sides - steps];
                    rs[key] = dice[ri + steps];
                    s.characters = s.characters.map(ch => ch.id === sourceId ? applySheet(ch, sheet) : ch.id === recipientId ? applySheet(ch, rs) : ch);
                    text = 'Shared ' + steps + ' ' + resource + ' resource step(s) from ' + source.name + ' to ' + recipient.name + '. The recipient must roll their current resource die when consuming; sharing alone is not consumption.';
                }
                else {
                    if (sourceId !== recipientId)
                        throw Error('The printed sharing rule transfers Resource Die steps to the recipient first. Share supplies, then let the recipient roll their current die; no unsupported supplier-consumption exception was assumed.');
                    const req = { context: { entryId: 'daily:' + s.campaign.date, assignmentId: recipientId + ':' + resource, requestId: randomUUID(), date: s.campaign.date, quarter: s.campaign.quarter, step: 'consume-' + resource }, characterId: sourceId, skill: resource, attribute: null, base: 0, skillDice: 0, modifier: 0, gear: 0, dice: 1, artifactAllowed: false, utility: 'Resource' as const, resource, sides: Number(dice[sides].slice(1)), evidence: activityRules(repo, record.id).sources, rollId: null };
                    n.request = req;
                    n.sourceId = sourceId;
                    n.receiptId = c.requestId;
                    n.status = 'Awaiting a specific roll';
                    n.explanation = 'Roll ' + dice[sides] + ' ' + resource + ' from ' + source.name + '’s sheet. A 1–2 depletes a step after this ration is consumed.';
                    text = n.explanation;
                }
            }
        }
        else if (c.operation === 'complete') {
            if (!entry || c.entryId !== entry.entryId)
                throw Error('Choose the current submitted activity quarter.');
            for (const x of entry.activities)
                own(x.characterId);
            const previousSession=structuredClone(s);
            const prepared = prepareCompletion(repo, record.id, s, entry.entryId);
            const updated = repo.update(record.id, record.revision, s, { activitiesValidated: true, workflowValidated: true });
            const result = executeJourney({ type: 'quarter-chat-complete', campaignId: record.id, revision: updated.revision, actionId: c.requestId, entryId: entry.entryId, actorId: c.actorId, resolution: prepared, confirmed: true }, repo, { routineCompletion: true,previousSession });
            entry.completed = true;
            db.prepare('UPDATE journey_actions SET fingerprint=? WHERE campaign_id=? AND action_id=?').run(hash, record.id, c.requestId);
            db.exec('COMMIT');
            return { record: result.record, replayed: false };
        }
        else {
            if (!entry || !a)
                throw Error('Choose a current submitted activity.');
            own(a.characterId);
            if (entry.completed)
                throw Error('This activity quarter is already complete.');
            if (c.operation === 'prepare') {
                if (a.status === 'Resolved' || a.request)
                    throw Error('This activity already has its result or pending roll.');
                if (a.activity === 'Forage') {
                    const tm = terrainModifiers[entry.terrain]?.forage;
                    if (tm === null || tm === undefined)
                        throw Error('Foraging is unavailable in this authoritative terrain.');
                    if (!st.settings.season)
                        throw Error('Confirm the in-world season in Journey Settings; the computer calendar is not used.');
                    a.target = c.target ?? 'food';
                    a.request = newRequest(s, entry.entryId, a, 'forage', 'Survival', tm + { Spring: -1, Summer: 0, Autumn: 1, Winter: -2 }[st.settings.season] + (rank(s, a.characterId, 'Gatherer') >= 1 ? 1 : 0));
                    a.stage = 'forage';
                    a.status = 'Awaiting roll';
                    a.summary = 'Forage for ' + a.target + '; Survival includes terrain, season and verified Gatherer rank.';
                }
                else if (a.activity === 'Hunt') {
                    const tm = terrainModifiers[entry.terrain]?.hunt;
                    if (tm === null || tm === undefined)
                        throw Error('Hunting is unavailable in this terrain.');
                    const owner = s.characters.find(ch => ch.id === a.characterId)!, sheet = sheetFor(owner), weapon = sheet.weapons?.find(w => (w.itemId === c.choice || w.name === c.choice) && w.skill === 'marksmanship'), trap = sheet.gear?.find(g => (g.itemId === c.choice || g.item === c.choice) && /hunting trap|snare/i.test(g.item ?? '') && Number(g.quantity) > 0);
                    if (!weapon && !trap)
                        throw Error('Select an actual recorded ranged weapon or hunting trap.');
                    if (weapon && /bow/i.test(weapon.name ?? '') && (!sheet['res-arrows'] || sheet['res-arrows'] === 'None'))
                        throw Error('This bow hunt requires recorded arrows.');
                    a.method = weapon ? 'weapon' : 'trap';
                    a.choice = c.choice!;
                    a.request = newRequest(s, entry.entryId, a, 'hunt-search', 'Survival', tm + (rank(s, a.characterId, 'Master of the Hunt') >= 1 ? 1 : 0));
                    a.stage = 'hunt-search';
                    a.status = 'Awaiting roll';
                    a.summary = 'Search for game; a successful search still needs a prey roll and a kill check.';
                }
                else if (a.activity === 'Cook') {
                    if (rank(s, a.characterId, 'Chef') < 1)
                        throw Error('Preparing portable Food requires the actual Chef talent (or an Inn procedure). Raw fresh ingredients can be eaten without Chef.');
                    if (!c.fire && !c.kitchen)
                        throw Error('Confirm an actual cooking fire or proper kitchen.');
                    a.choice = c.kitchen ? 'kitchen' : 'fire';
                    a.stage = 'cook-capacity';
                    if (c.kitchen) {
                        a.yield = 12;
                        a.stage = 'cook-allocation';
                        a.summary = 'Kitchen capacity 12 units. Allocate existing fresh ingredients.';
                    }
                    else {
                        a.request = newRequest(s, entry.entryId, a, 'cook-capacity', 'D6', 0, 'D6');
                        a.status = 'Awaiting roll';
                        a.summary = 'Roll the Chef cooking-capacity D6; this is not a skill success roll.';
                    }
                }
                else
                    throw Error('This activity has no supported preparation step.');
                text = a.summary;
            }
            else if (c.operation === 'keep') {
                const card = s.dice?.find(r => r.id === a.request?.rollId && r.activityContext?.requestId === a.request.context.requestId);
                if (!card)
                    throw Error('No saved failed activity roll awaits a keep decision.');
                resolveActivityRoll(repo, record.id, s, entry.entryId, a, card);
                text = a.summary;
            }
            else if (c.operation === 'bind') {
                const card = s.dice?.find(r => r.id === c.rollId);
                if (!card || !a.request)
                    throw Error('Select a saved card and an outstanding typed activity request.');
                if (a.request.rollId)
                    throw Error('This request already has a saved result. Push or keep that exact result; it cannot be replaced by another roll.');
                const reason = historicalEligibility(s, a.request, card);
                if (reason) {
                    if (!gm || !c.reason || c.reason.length < 20 || !['Already finalized', 'Predates this quarter-day form; a specific GM ruling is required'].includes(reason))
                        throw Error(reason);
                    if (repo.db.prepare("SELECT 1 FROM ai_requests WHERE campaign_id=? AND json_extract(payload,'$.rollId')=? AND status IN ('running','completed')").get(record.id, card.id))
                        throw Error('This historical roll was already used by a GM procedure.');
                    validateActivityPool(a.request, { type: 'create', campaignId: record.id, actionId: c.requestId, roll: card.result, metadata: card.metadata });
                    makeRuling(repo, { campaignId: record.id, originId: c.requestId, sceneId: 'activity:' + entry.entryId, domain: 'rules_conflict', question: 'Associate this exact unused historical saved card', scope: { key: a.assignmentId, fingerprint: card.id }, decision: c.reason, reasoning: 'Explicit Table GM historical association; character, verified dice and current pool remain enforced.', decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', requestId: c.requestId, receiptId: c.requestId, blockingReason: '', risk: 'bounded' });
                }
                card.activityContext = a.request.context;
                afterActivityDice(repo, record.id, s, card);
                text = a.summary;
            }
            else if (c.operation === 'prey-keep') {
                if (a.stage !== 'choose-prey' || !a.prey)
                    throw Error('Roll for the actual prey first.');
                if (c.prey !== undefined) {
                    if (!a.preyOptions.includes(c.prey))
                        throw Error('Choose one of this exact prey roll’s results.');
                    a.prey = c.prey;
                }
                huntingKillRequest(s, entry.entryId, a);
                text = a.summary;
            }
            else if (c.operation === 'prey-reroll') {
                if (a.stage !== 'choose-prey' || a.rerolls < 1)
                    throw Error('No extra search success remains for another prey roll.');
                a.rerolls--;
                a.request = newRequest(s, entry.entryId, a, 'prey', 'D6', 0, 'D6');
                a.status = 'Awaiting roll';
                a.stage = 'prey';
                text = 'Roll new prey. The previous result cannot be recovered.';
            }
            else if (c.operation === 'cook') {
                if (a.status === 'Resolved' || a.stage !== 'cook-allocation' || a.activity !== 'Cook')
                    throw Error('Resolve actual Chef capacity before allocating ingredients.');
                const owner = s.characters.find(ch => ch.id === a.characterId)!, sheet = sheetFor(owner), p = st.provisions.find(p => p.itemId === c.itemId && p.ownerId === owner.id && ['Vegetables', 'Meat', 'Fish'].includes(p.kind)), item = sheet.gear?.find(g => g.itemId === c.itemId), n = c.quantity ?? 1;
                if (!p || !item || !fresh(s, p) || p.hazard || !Number.isSafeInteger(Number(item.quantity)) || n > Number(item.quantity) || n > a.yield)
                    throw Error('Choose available fresh ingredients within the verified cooking capacity.');
                item.quantity = String(Number(item.quantity) - n);
                if (item.quantity === '0')
                    sheet.gear = sheet.gear!.filter(g => g !== item);
                s.characters = s.characters.map(ch => ch.id === owner.id ? applySheet(ch, sheet) : ch);
                const chef = rank(s, owner.id, 'Chef'), total = n + (chef >= 2 ? 1 : 0);
                addProvisions(s, owner.id, 'Food', total, chef);
                a.yield = total;
                finish(a, 'Prepared ' + total + ' portable Food from ' + n + ' fresh ingredients' + (chef >= 2 ? ' including Chef’s extra unit.' : '.') + ' No automatic consumption or resource-die increase.');
                text = a.summary;
            }
            else if (c.operation === 'reveal-camp') {
                requireGM();
                const row = db.prepare('SELECT state_json FROM activity_private WHERE campaign_id=? AND assignment_id=?').get(record.id, a.assignmentId);
                if (!row)
                    throw Error('No hidden camp mishap is pending.');
                const secret = JSON.parse(String(row.state_json));
                if (secret.applied)
                    throw Error('This camp mishap was already revealed.');
                applyCampMishap(s, a, secret.mishap);
                secret.applied = true;
                db.prepare('UPDATE activity_private SET state_json=? WHERE campaign_id=? AND assignment_id=?').run(JSON.stringify(secret), record.id, a.assignmentId);
                text = a.summary;
            }
            else if (c.operation === 'interrupt') {
                a.interrupted = true;
                a.summary = 'This ' + a.activity + ' was interrupted; it will not grant Rest or Sleep benefits.';
                text = a.summary;
            }
            else if (c.operation === 'watch-threat') {
                requireGM();
                if (a.activity !== 'Keep Watch' || !c.reason)
                    throw Error('Identify the actual threat and its straight/opposed Scouting procedure.');
                a.choice = c.reason;
                a.request = newRequest(s, entry.entryId, a, 'watch', 'Scouting', entry.activities.some(x => x.activity === 'Make Camp' && x.status === 'Resolved' && rank(s, x.characterId, 'Quartermaster') >= 2) ? 2 : 0);
                a.status = 'Awaiting roll';
                a.summary = 'A specific threat requires Scouting. ' + c.reason;
                text = a.summary;
            }
            else if (c.operation === 'review') {
                requireGM();
                const hidden = db.prepare('SELECT state_json FROM activity_private WHERE campaign_id=? AND assignment_id=?').get(record.id, a.assignmentId);
                if (hidden && !JSON.parse(String(hidden.state_json)).applied)
                    throw Error('Reveal and adjudicate the saved hidden camp mishap before completing its review.');
                if (!c.reason || c.reason.length < 20)
                    throw Error('Record the specific printed follow-up, actual results and remaining obligations.');
                if (a.status !== 'Needs GM ruling' && !a.review)
                    throw Error('This activity does not have a specific review hold.');
                makeRuling(repo, { campaignId: record.id, originId: c.requestId, sceneId: 'activity:' + entry.entryId, domain: 'rules_conflict', question: a.summary, scope: { key: a.assignmentId, fingerprint: JSON.stringify({ stage: a.stage, rollIds: a.rollIds }) }, decision: c.reason, reasoning: 'Explicit Table GM review; no unrecorded resource, roll or damage mutation is inferred.', decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', requestId: c.requestId, receiptId: c.requestId, blockingReason: '', risk: 'bounded' });
                a.review = c.reason;
                finish(a, 'Table GM reviewed: ' + c.reason);
                text = a.summary;
            }
            if(a.activity==='Make Camp')syncCampResult(repo,record.id,s,a);
        }
        s.journal.push({ id: c.requestId + ':activity', title: 'Activity: ' + c.operation, text });
        const updated = repo.update(record.id, record.revision, s, { activitiesValidated: true, workflowValidated: true });
        db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id, c.requestId, hash, new Date().toISOString());
        db.exec('COMMIT');
        return { record: updated, replayed: false, text };
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
import type { Session } from '../../lib/types';
import { activityBlockers } from './state';
export function prepareCompletion(repo: SqliteCampaignRepository, id: string, s: Session, entryId: string) {
    const entry = s.activityState?.entries.find(e => e.entryId === entryId);
    if (!entry || entry.completed)
        throw Error('Choose the current uncompleted activity quarter.');
    ensureNeeds(s);
    const reasons = activityBlockers(s, entryId);
    if (activeCombat(repo, id))
        reasons.push('The party is still resolving an encounter.');
    if (reasons.length)
        throw Error(reasons.join('\n'));
    const submitted = s.dayTracker!.find(d => d.id === entryId)!;
    const interrupted = repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=?').all(id).some(row => { const e = JSON.parse(String(row.state_json)); return e.sceneHex === entry.hex && e.startedAt >= submitted.submittedAt; });
    if (interrupted && entry.activities.some(a => ['Rest', 'Sleep'].includes(a.activity) && !a.interrupted))
        throw Error('An encounter began during this activity quarter. Review and mark affected Rest/Sleep interrupted before claiming recovery.');
    const changes: string[] = [];
    const currentCamp=occupiedCamp(s),shelter=currentCamp?{choice:currentCamp.effects.includes('no_sleep')?'no-sleep':currentCamp.shelter==='sheltered'?'sheltered':'less-pleasant'}:null;if(currentCamp&&!usableCamp(s)&&entry.activities.some(a=>a.activity==='Sleep'&&!a.interrupted))throw Error('Resolve the shared campsite’s shelter complication before completing Sleep.');
    for (const a of entry.activities) {
        const ch = s.characters.find(ch => ch.id === a.characterId)!, sheet = sheetFor(ch), sleep = a.activity === 'Sleep', rest = sleep || a.activity === 'Rest' || a.activity === 'Forage' && rank(s, ch.id, 'Gatherer') >= 2 || a.activity === 'Hunt' && rank(s, ch.id, 'Master of the Hunt') >= 2;
        if (!rest || a.interrupted)
            continue;
        if (sleep && !shelter && !a.choice) {
            a.stage = 'bare-sleep';
            a.request = newRequest(s, entry.entryId, a, 'bare-sleep', 'Survival');
            a.status = 'Awaiting roll';
            throw Error(ch.name + ' needs the printed bare-ground Survival and cold procedure before Sleep.');
        }
        const noSleep = sleep && (shelter?.choice === 'no-sleep' || a.choice === 'no-sleep');
        if (noSleep) {
            sheet['cond-sleepy'] = true;
            changes.push(ch.name + ': no Sleep obtained at this campsite.');
        }
        else if (sleep) {
            if (a.review && a.review.startsWith('Confirm'))
                throw Error(ch.name + ': ' + a.review);
            sheet['cond-sleepy'] = false;
            changes.push(ch.name + ' completed uninterrupted Sleep.');
        }
        if (sheet['cond-cold'])
            throw Error(ch.name + '’s Cold condition requires its specific warm-shelter recovery procedure.');
        if (!noSleep && !sheet['cond-thirsty'])
            for (const attr of ['strength', 'agility', 'wits', 'empathy'] as const) {
                if (attr === 'strength' && sheet['cond-hungry'] || attr === 'wits' && sheet['cond-sleepy'])
                    continue;
                const current = Number(sheet['attr-' + attr as 'attr-strength']), max = Number(sheet['attr-' + attr + '-regular' as 'attr-strength']);
                if (!Number.isInteger(current) || !Number.isInteger(max) || max < 1)
                    throw Error(ch.name + ' needs actual current/regular ' + attr + ' values.');
                if (current === 0)
                    throw Error(ch.name + '’s Broken ' + attr + ' needs its existing recovery procedure.');
                if (current < max) {
                    sheet['attr-' + attr as 'attr-strength'] = String(max);
                    changes.push(ch.name + ': ' + attr + ' ' + current + ' → ' + max);
                }
            }
        s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
    }
    if(entry.quarter==='Night'){const records=s.activityState!.entries.filter(e=>e.date===entry.date&&(e.completed||e.entryId===entryId));if(new Set(records.map(e=>e.quarter)).size===4){for(const ch of s.characters){const slept=records.some(e=>e.activities.some(a=>a.characterId===ch.id&&a.activity==='Sleep'&&!a.interrupted&&a.choice!=='no-sleep'&&!e.activities.some(c=>c.activity==='Make Camp'&&c.choice==='no-sleep')));if(!slept){const sheet=sheetFor(ch);sheet['cond-sleepy']=true;s.characters=s.characters.map(c=>c.id===ch.id?applySheet(c,sheet):c);changes.push(ch.name+' becomes Sleepy after a fully recorded day without Sleep.');}}}}
    entry.completed = true;
    return { endingHex: s.campaign.hex, quarterDays: 1 as const, nextWeather: s.campaign.weather, adjudication: entry.activities.map(a => (s.characters.find(c => c.id === a.characterId)?.name ?? a.characterId) + ' — ' + a.activity + ': ' + a.summary).join('\n') + '\n' + changes.join('\n'), narrative: entry.activities.map(a => {
            const name = s.characters.find(ch => ch.id === a.characterId)?.name ?? a.characterId;
            if (a.activity === 'Make Camp')
                return name + (a.choice === 'sheltered' ? ' made a sheltered, comfortable camp.' : ' dealt with the recorded camp conditions.');
            if (a.activity === 'Forage')
                return name + (a.yield > 0 ? ' gathered ' + a.yield + ' portions of fresh Vegetables.' : a.target === 'water' ? ' resolved the recorded search for drinking water.' : ' finished the forage without an unverified food reward.');
            if (a.activity === 'Hunt')
                return name + (a.yield > 0 ? ' brought back ' + a.yield + ' portions of Meat.' : ' finished the hunt without an unverified food reward.');
            if (a.activity === 'Cook')
                return name + ' prepared ' + a.yield + ' portions of Food.';
            if (a.activity === 'Sleep')
                return name + (a.interrupted ? ' had Sleep interrupted.' : a.choice === 'no-sleep' || shelter?.choice === 'no-sleep' ? ' could not Sleep at this campsite.' : ' slept through the quarter.');
            if (a.activity === 'Keep Watch')
                return name + ' kept watch.';
            return name + (a.interrupted ? ' had the selected activity interrupted.' : ' completed the selected ' + a.activity.toLowerCase() + ' activity.');
        }).join(' ') + ' The quarter has ended at ' + entry.hex + '.', restConfirmed: false };
}
