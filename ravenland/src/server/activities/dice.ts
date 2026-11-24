import {pathOfForest} from '../quarter-resolution/talents';
import {activitySeason,campaignSeason} from '../../lib/campaign-calendar';
import {sameDay} from '../../lib/calendar';
import {weatherModifier} from '../../lib/weather-context';
import { mechanicalCharacter } from '../mechanical-character';
import { rank } from './state';
import { terrainModifiers, preyTable } from './rules';
import { randomUUID } from 'node:crypto';
import { activityRules } from './rules';
import { isDeepStrictEqual } from 'node:util';
import type { Session } from '../../lib/types';
import type { ActivityRequest } from '../../lib/activities';
import type { DiceCommand, PendingDice } from '../../lib/dice/schema';
import type { SqliteCampaignRepository } from '../sqlite';
import { currentRoutine } from '../../lib/activities';
import { canPush } from '../../lib/dice/engine';
import { resolveActivityRoll, resolveDailyRoll } from './resolution';
export function requestsFor(s: Session, characterId: string, fresh = true) { const requests = (currentRoutine(s)?.activities ?? []).flatMap(a => a.request && !a.request.rollId ? [a.request] : []); requests.push(...(s.activityState?.needs ?? []).flatMap(n => sameDay(n.date,s.campaign.date,s.environment?.calendar) && n.request && !n.request.rollId ? [n.request] : [])); return requests.filter(r => r.characterId === characterId).map(r => fresh ? effectiveRequest(s, r) : r); }
export function effectiveRequest(s: Session, r: ActivityRequest): ActivityRequest {
    const ch = s.characters.find(ch => ch.id === r.characterId);
    if (!ch)
        return r;
    const a = currentRoutine(s)?.activities.find(a => a.assignmentId === r.context.assignmentId), mechanics = mechanicalCharacter(ch);
    if (r.utility) {
        if (r.utility === 'Resource' && r.resource) {
            const value = ch.sheet?.[('res-' + r.resource) as 'res-food'];
            return { ...r, sides: /^D(?:6|8|10|12)$/.test(String(value)) ? Number(String(value).slice(1)) : 0 };
        }
        return { ...r, dice: r.context.step === 'prey' && rank(s, ch.id, 'Master of the Hunt') >= 3 ? 2 : 1 };
    }
    const base = r.attribute ? mechanics.attributes[r.attribute].current : null, skill = mechanics.skills['skill-' + r.skill.toLowerCase()];
    if (base === null || skill === null || skill === undefined)
        throw Error('Record actual current attributes and skills before staging this activity.');
    if (Object.values(mechanics.attributes).some(a => a.current === 0))
        throw Error('Resolve this character’s Broken recovery before an ordinary activity roll.');
    let modifier = r.modifier, artifactAllowed = r.artifactAllowed, gear = r.gear;
    if (r.context.step === 'camp') {
        modifier = (rank(s, ch.id, 'Quartermaster') >= 1 ? 1 : 0)+weatherModifier(s,'Make Camp');
        artifactAllowed = rank(s, ch.id, 'Quartermaster') >= 3;
    }
    if (r.context.step === 'forage' && activitySeason(s)) {
        const terrain = currentRoutine(s)!.terrain, tm = terrainModifiers[terrain]?.forage;
        if (tm === null || tm === undefined)
            throw Error('The recorded terrain does not support Foraging.');
        modifier = tm + { Spring: -1, Summer: 0, Autumn: 1, Winter: -2 }[activitySeason(s)!] + (rank(s, ch.id, 'Gatherer') >= 1 ? 1 : 0);
    }
    if (r.context.step === 'hunt-search') {
        const tm = terrainModifiers[currentRoutine(s)!.terrain]?.hunt;
        if (tm === null || tm === undefined)
            throw Error('The recorded terrain does not support Hunting.');
        modifier = tm + (rank(s, ch.id, 'Master of the Hunt') >= 1 ? 1 : 0);
    }
    if (r.context.step === 'kill' && a?.prey) {
        modifier = preyTable[a.prey - 1].difficulty + (a.method === 'trap' && rank(s, ch.id, 'Master of the Hunt') >= 1 ? 1 : 0);
        if (a.method === 'weapon') {
            const weapon = ch.sheet?.weapons?.find(w => w.itemId === a.choice || w.name === a.choice), value = weapon?.current ?? weapon?.gearBonus;
            if (!/^\d+$/.test(value ?? ''))
                throw Error('Review the current hunting weapon Gear rating.');
            gear = Number(value);
        }
    }
    return { ...r, base, skillDice: skill, modifier, artifactAllowed, gear };
}
export function matchingActivityRequest(s: Session, c: Extract<DiceCommand, {
    type: 'create';
}>): ActivityRequest | null {
    if (c.expectedCombatContext || c.expectedProcedureContext || c.expectedNarrativeRequestId || c.expectedJourneyContext) {
        if (c.expectedActivityContext)
            throw Error('A roll cannot belong to two distinct procedures.');
        return null;
    }
    const all = requestsFor(s, c.roll.characterId, false).map(r => { const matches = r.utility ? r.utility === 'Resource' ? c.metadata.utility?.kind === 'Resource' && c.metadata.utility.resource === r.resource : r.utility === 'D6' ? c.metadata.utility?.kind === 'Procedure' : c.metadata.utility?.kind === 'D66' : !c.metadata.utility && r.skill.toLowerCase() === c.roll.skill.toLowerCase(); return matches ? effectiveRequest(s, r) : r; }), eligible = all.filter(r => r.utility === 'Resource' ? c.metadata.utility?.kind === 'Resource' && c.metadata.utility.resource === r.resource : r.utility === 'D6' ? c.metadata.utility?.kind === 'Procedure' && c.metadata.utility.faces.length === r.dice : r.utility === 'D66' ? c.metadata.utility?.kind === 'D66' : !c.metadata.utility && r.skill.toLowerCase() === c.roll.skill.toLowerCase());
    if (c.expectedActivityContext) {
        const exact = all.find(r => isDeepStrictEqual(r.context, c.expectedActivityContext));
        if (!exact || !eligible.includes(exact))
            throw Error('The requested activity step changed. Refresh before rolling; this result was not reassigned.');
        return exact;
    }
    if (eligible.length > 1)
        throw Error('More than one activity matches this roll. Stage the specific requested activity first.');
    return eligible[0] ?? null;
}
export function validateActivityPool(request: ActivityRequest, c: Extract<DiceCommand, {
    type: 'create';
}>) {
    if (request.utility === 'Resource') {
        const u = c.metadata.utility;
        if (u?.kind !== 'Resource' || u.sides !== request.sides)
            throw Error('The requested resource die changed. Refresh the current source die.');
        return;
    }
    if (request.utility)
        return;
    const r = c.roll, n = request.skillDice + request.modifier;
    if (c.metadata.attribute !== request.attribute || r.attribute.length !== request.base || r.skillDice.length !== Math.abs(n) || r.negativeSkill !== (n < 0) || r.gear.length !== request.gear || (r.artifacts.length > 0 && (!request.artifactAllowed || r.artifacts.length !== 1 || r.artifacts[0].sides !== 8)) || c.metadata.isArmor)
        throw Error('Use the current typed activity pool, including its printed modifiers. Unverified assistance or artifact/gear bonuses need their supported rule review.');
}
export function afterActivityDice(repo: SqliteCampaignRepository, id: string, s: Session, card: PendingDice) {
    if (!card.activityContext)
        return;
    if (resolveDailyRoll(s, card))
        return;
    const e = currentRoutine(s), a = e?.activities.find(a => a.request?.context.requestId === card.activityContext!.requestId);
    if (!e || !a)
        throw Error('This activity result no longer has its original request.');
    a.request!.rollId = card.id;
    if (card.result.successes === 0 && ((canPush(card) && !card.result.pushed)||['forage','hunt-search'].includes(a.request!.context.step)&&!!pathOfForest(repo,id,s,a.characterId,a.activity))) {
        a.status = 'Awaiting Push/keep decision';
        a.summary = 'Saved ' + a.request!.skill + ' failed. Push legally from the sheet or keep this exact result.';
        return;
    }
    resolveActivityRoll(repo, id, s, e.entryId, a, card);
}
export function historicalEligibility(s: Session, request: ActivityRequest, card: PendingDice) {
    if (card.characterId !== request.characterId)
        return 'Different character';
    if (card.metadata.utility || card.result.skill.toLowerCase() !== request.skill.toLowerCase())
        return 'Different skill or procedure';
    if (card.quarterRequestId || card.creatureContext || card.combatContext || card.procedureContext || card.journeyContext || card.narrativeRequestId || card.activityContext)
        return 'Already bound to another procedure';
    if (card.status !== 'Pending')
        return 'Already finalized';
    if (s.dayTracker?.some(e => e.assignments.some(a => a.rollId === card.id)))
        return 'Already used by a saved activity';
    const f = s.chatJourney?.forms.find(f => f.entryId === request.context.entryId);
    if (!f || card.createdAt < f.requestedAt)
        return 'Predates this quarter-day form; a specific GM ruling is required';
    try {
        validateActivityPool(request, { type: 'create', campaignId: '', actionId: '', roll: card.result, metadata: card.metadata });
    }
    catch {
        return 'Pool does not match current printed activity modifiers';
    }
    return null;
}
export function prepareUnrequestedConsumption(repo: SqliteCampaignRepository, id: string, s: Session, c: Extract<DiceCommand, {
    type: 'create';
}>) {
    const u = c.metadata.utility;
    if (!s.activityState || c.expectedActivityContext || u?.kind !== 'Resource' || !['food', 'water'].includes(u.resource))
        return;
    const resource = u.resource as 'food' | 'water';
    let n = s.activityState.needs.find(n => sameDay(n.date,s.campaign.date,s.environment?.calendar) && n.characterId === c.roll.characterId && n.resource === resource);
    if (n?.status === 'Satisfied' || n?.status === 'Unmet' || n?.request)
        return;
    const request = { context: { entryId: 'daily:' + s.campaign.date, assignmentId: c.roll.characterId + ':' + resource, requestId: randomUUID(), date: s.campaign.date, quarter: s.campaign.quarter, step: 'consume-' + resource }, characterId: c.roll.characterId, skill: resource, attribute: null, base: 0, skillDice: 0, modifier: 0, gear: 0, dice: 1, artifactAllowed: false, utility: 'Resource' as const, resource, sides: u.sides, evidence: activityRules(repo, id).sources, rollId: null };
    if (!n) {
        n = { date: s.campaign.date, characterId: c.roll.characterId, resource, status: 'Pending', sourceId: null, itemId: null, request: null, rollId: null, receiptId: null, explanation: '' };
        s.activityState.needs.push(n);
    }
    n.status = 'Awaiting a specific roll';
    n.sourceId = c.roll.characterId;
    n.receiptId = c.actionId;
    n.request = request;
}
