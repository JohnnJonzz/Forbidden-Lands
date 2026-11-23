import {occupiedCamp} from '../../lib/campsites';
import {refreshSleep} from '../continuity/camps';
import { randomUUID } from 'node:crypto';
import { currentRoutine, dueNeeds, type ActivityState, type ActivityRequest, type RoutineActivity } from '../../lib/activities';
import type { Session } from '../../lib/types';
import type { SqliteCampaignRepository } from '../sqlite';
import { sheetFor, applySheet } from '../../lib/character-sheet';
import { mechanicalCharacter } from '../mechanical-character';
import { activityRules, terrainModifiers } from './rules';
import { SqliteMapStore } from '../map/store';
import { AIError } from '../ai/config';
export function stateFor(s: Session): ActivityState { return s.activityState ??= { settings: { checkpoint: 'Night', effectiveDate: s.campaign.date, effectiveQuarter: s.campaign.quarter, season: null }, entries: [], provisions: [], needs: [] }; }
export const rank = (s: Session, id: string, name: string) => mechanicalCharacter(s.characters.find(c => c.id === id)!).talents.find(t => t.name.toLowerCase() === name.toLowerCase())?.rank ?? 0;
export function ensureNeeds(s: Session) {
    const st = stateFor(s);
    if (!dueNeeds(s))
        return;
    for (const c of s.characters)
        for (const resource of ['food', 'water'] as const)
            if (!st.needs.some(n => n.date === s.campaign.date && n.characterId === c.id && n.resource === resource))
                st.needs.push({ date: s.campaign.date, characterId: c.id, resource, status: 'Pending', sourceId: null, itemId: null, request: null, rollId: null, receiptId: null, explanation: 'Daily ' + resource + ' is due. Choose provisions, a carried resource die, sharing, or explicitly resolve a missing supply.' });
}
export function promptNeeds(s: Session, eventId: string) {
    if (!s.activityState)
        return;
    ensureNeeds(s);
    if (dueNeeds(s) && s.activityState.needs.some(n => n.date === s.campaign.date && n.status === 'Pending') && !s.messages.some(m => m.id === eventId + ':daily-needs'))
        s.messages.push({ id: eventId + ':daily-needs', role: 'gm', author: 'Game Master', provider: 'application', text: s.campaign.quarter + ' has begun. How is everyone handling food and water today? You may use fresh provisions, carried resource dice, or explicitly share supplies. The Daily Needs summary shows what remains.' });
}
export function newRequest(s: Session, entryId: string, a: RoutineActivity, step: string, skill: string, modifier = 0, utility: 'D6' | 'D66' | null = null, gear = 0): ActivityRequest {
    const ch = s.characters.find(c => c.id === a.characterId)!, m = mechanicalCharacter(ch), attribute = utility ? null : skill === 'Marksmanship' ? 'agility' : skill === 'Healing' ? 'empathy' : skill === 'Move' ? 'agility' : 'wits', key = skill.toLowerCase(), base = attribute ? m.attributes[attribute].current : 0, skillDice = attribute ? m.skills['skill-' + key] : 0;
    if (!utility && Object.values(m.attributes).some(a => a.current === 0))
        throw new AIError('activity_broken', 'Resolve this character’s Broken recovery before requesting an ordinary activity roll.', 409);
    if (base === null || skillDice === null || skillDice === undefined)
        throw new AIError('activity_pool', 'Record ' + ch.name + '’s actual ' + attribute + ' and ' + skill + ' before requesting this activity roll.', 409);
    return { context: { entryId, assignmentId: a.assignmentId, requestId: randomUUID(), date: s.campaign.date, quarter: s.campaign.quarter, step }, characterId: a.characterId, skill: utility ?? skill, attribute, base, skillDice, modifier, gear, dice: step === 'prey' && rank(s, a.characterId, 'Master of the Hunt') >= 3 ? 2 : 1, artifactAllowed: step === 'camp' && rank(s, a.characterId, 'Quartermaster') >= 3, utility, resource: null, sides: utility === 'D6' ? 6 : null, evidence: a.sources, rollId: null };
}
export function startActivities(repo: SqliteCampaignRepository, id: string, s: Session, entryId: string) {
    const entry = s.dayTracker!.find(e => e.id === entryId)!;
    if (entry.traveling)
        throw Error('Routine activities cannot replace travel procedures.');
    const st = stateFor(s);
    if (st.entries.some(e => e.entryId === entryId))
        return;
    const rules = activityRules(repo, id);
    const terrain = new SqliteMapStore(repo).lookupForCampaign(id, s.campaign.hex)?.terrain ?? s.campaign.terrain;
    if (entry.assignments.filter(a => a.activity === 'Make Camp').length > 1 || entry.assignments.filter(a => a.activity === 'Keep Watch').length > 1)
        throw Error('Choose one camp maker and one lookout; helpers need an explicit supported assistance procedure.');
    const activities: RoutineActivity[] = entry.assignments.map(x => ({ assignmentId: x.id, characterId: x.characterId, activity: x.activity, stage: 'initial', status: 'Awaiting preparation or resource allocation', summary: 'Assigned ' + x.activity, request: null, rollIds: [], prey: null, preyOptions: [], rerolls: 0, method: null, target: 'food', choice: '', yield: 0, interrupted: false, review: '', sources: rules.sources }));
    st.entries.push({ entryId, date: entry.date, quarter: entry.quarter, hex: entry.from, terrain, completed: false, activities });
    for (const a of activities) {
        if (a.activity === 'Make Camp') {
            a.request = newRequest(s, entryId, a, 'camp', 'Survival', rank(s, a.characterId, 'Quartermaster') >= 1 ? 1 : 0);
            a.status = 'Awaiting roll';
        }
        else if (a.activity === 'Forage') {
            a.summary = 'Choose food or water; confirm the campaign season under Journey Settings.';
        }
        else if (a.activity === 'Hunt') {
            a.summary = 'Select a recorded ranged weapon or hunting trap before searching for prey.';
        }
        else if (a.activity === 'Keep Watch') {
            a.status = 'Resolved';
            a.summary = 'Keeping watch. Scouting is required only when an actual threat or ambush needs detection; success never proves no encounter.';
        }
        else if (['Rest', 'Sleep'].includes(a.activity)) {
            a.status = 'Resolved';
            a.summary = 'Assigned ' + a.activity + '; uninterrupted eligibility and recovery are checked at completion, no free skill roll.';
            if (a.activity === 'Sleep' && !activities.some(x => x.activity === 'Make Camp') && !occupiedCamp(s)) {
                a.stage = 'bare-sleep';
                a.request = newRequest(s, entryId, a, 'bare-sleep', 'Survival');
                a.status = 'Awaiting roll';
                a.summary = 'No camp is recorded; find a sleeping spot with the printed bare-ground Survival check and review cold exposure.';
            }
        }
        else if (a.activity === 'Cook') {
            a.summary = 'Choose existing ingredients, actual Chef rank and a fire/kitchen. Fresh Vegetables, Meat and Fish can also be eaten raw within a day.';
        }
        else if (a.activity === 'Other') {
            a.status = 'Resolved';
            a.summary = 'Ordinary declared activity; no unverified skill, inventory or recovery effect.';
        }
        else {
            a.status = 'Needs GM ruling';
            a.summary = a.activity + ' requires its source-specific procedure; no generic success or yield has been assumed.';
        }
    }
    refreshSleep(s);
    ensureNeeds(s);
}
export function dateDistance(before: string, after: string): number | null {
    const parse = (d: string) => { const m = /^(.*?) \(\+(\d+) days?\)$/.exec(d); return { root: m?.[1] ?? d, offset: Number(m?.[2] ?? 0) }; }, a = parse(before), b = parse(after);
    if (a.root === b.root)
        return b.offset - a.offset;
    if (/^\d{4}-\d{2}-\d{2}$/.test(a.root) && /^\d{4}-\d{2}-\d{2}$/.test(b.root))
        return (Date.parse(b.root) - Date.parse(a.root)) / 86400000 + b.offset - a.offset;
    const x = /^(\d+)(?:st|nd|rd|th) (.+)$/.exec(a.root), y = /^(\d+)(?:st|nd|rd|th) (.+)$/.exec(b.root);
    return x && y && x[2] === y[2] ? Number(y[1]) - Number(x[1]) + b.offset - a.offset : null;
}
export function fresh(s: Session, p: ActivityState['provisions'][number]) {
    if (['Food', 'Water', 'Pelts'].includes(p.kind))
        return true;
    const d = dateDistance(p.date, s.campaign.date);
    if (d === null)
        return false;
    const q = ['Morning', 'Day', 'Evening', 'Night'], elapsed = d * 4 + q.indexOf(s.campaign.quarter) - q.indexOf(p.quarter);
    return elapsed >= 0 && elapsed < 4;
}
export function addProvisions(s: Session, ownerId: string, kind: ActivityState['provisions'][number]['kind'], quantity: number, chefRank = 0, hazard: string | null = null) {
    if (quantity < 1)
        return;
    const owner = s.characters.find(c => c.id === ownerId)!, sheet = sheetFor(owner), itemId = randomUUID();
    sheet.gear ??= [];
    sheet.gear.push({ itemId, item: kind, quantity: String(quantity), weight: '', notes: 'Verified ' + kind + ' · ' + s.campaign.date + ' ' + s.campaign.quarter + '. Confirm cargo weight when allocating this stock.' });
    s.characters = s.characters.map(c => c.id === ownerId ? applySheet(c, sheet) : c);
    stateFor(s).provisions.push({ itemId, ownerId, kind, date: s.campaign.date, quarter: s.campaign.quarter, chefRank, hazard });
    return itemId;
}
export function activityBlockers(s: Session, entryId: string) {
    const e = s.activityState?.entries.find(e => e.entryId === entryId);
    if (!e)
        return [];
    const reasons = e.activities.filter(a => a.status !== 'Resolved').map(a => (s.characters.find(c => c.id === a.characterId)?.name ?? a.characterId) + ': ' + a.summary);
    if (dueNeeds(s))
        for (const c of s.characters)
            for (const resource of ['food', 'water']) {
                const n = s.activityState?.needs.find(n => n.date === s.campaign.date && n.characterId === c.id && n.resource === resource);
                if (!n || !['Satisfied', 'Unmet'].includes(n.status))
                    reasons.push(c.name + '’s ' + resource + ' requirement has not been handled.');
            }
    return reasons;
}
export function dailyBlockers(s: Session) {
    if (!s.activityState || !dueNeeds(s))
        return [];
    return s.characters.flatMap(ch => ['food', 'water'].flatMap(resource => { const n = s.activityState?.needs.find(n => n.date === s.campaign.date && n.characterId === ch.id && n.resource === resource); return n && ['Satisfied', 'Unmet'].includes(n.status) ? [] : [ch.name + '’s ' + resource + ' requirement has not been handled.']; }));
}
