import type { Session } from '../../lib/types';
import type { SqliteCampaignRepository } from '../sqlite';
import { countSuccesses } from '../../lib/dice/engine';
import { pendingDiceSchema } from '../../lib/dice/schema';
import { completionFor } from '../../lib/journey/chat-engine';
import { dateDistance, fresh } from '../activities/state';
import { campRules } from './camps';
export function historicalReview(repo: SqliteCampaignRepository, id: string, entryId: string, assignmentId: string) {
    const s = repo.get(id)!.session, entry = s.dayTracker?.find(e => e.id === entryId), assignment = entry?.assignments.find(a => a.id === assignmentId);
    if (!entry || !assignment || !['Make Camp', 'Forage'].includes(assignment.activity))
        throw Error('Choose the original Make Camp or Forage assignment.');
    const completed = !!completionFor(s, entryId) || entry.status === 'Completed', native = s.activityState?.entries.find(e => e.entryId === entryId)?.activities.find(a => a.assignmentId === assignmentId), form = s.chatJourney?.forms.find(f => f.entryId === entryId), rollIds = native?.rollIds ?? (assignment.rollId ? [assignment.rollId] : []), cards = rollIds.map(r => s.dice?.find(c => c.id === r)).filter(c => !!c && !c.metadata.utility), card = cards.find(c => c!.result.skill.toLowerCase() === 'survival') ?? null, uncertainties: string[] = [], errors: string[] = [];
    const elapsed = dateDistance(entry.date, s.campaign.date,s.environment?.calendar);
    if (elapsed === null || elapsed < 0 || elapsed === 0 && ['Morning', 'Day', 'Evening', 'Night'].indexOf(entry.quarter) > ['Morning', 'Day', 'Evening', 'Night'].indexOf(s.campaign.quarter))
        errors.push('The source event is not earlier than the current in-world time.');
    if (!completed)
        errors.push('The source quarter is not completed.');
    if (entry.traveling)
        errors.push('A stationary camp/forage source is required.');
    if (!s.characters.some(c => c.id === assignment.characterId))
        errors.push('The original character is no longer in this party.');
    if (assignment.activity === 'Make Camp' && (entry.from !== s.campaign.hex || entry.endingHex && entry.endingHex !== entry.from))
        errors.push('The source is not at this party’s actual occupied location.');
    if (assignment.activity === 'Make Camp' && form?.location && form.location !== s.campaign.location)
        errors.push('The source names a different location in this hex.');
    if (card) {
        const parsed = pendingDiceSchema.safeParse(card);
        if (!parsed.success || card.characterId !== assignment.characterId || card.metadata.utility || card.combatContext || card.creatureContext || card.procedureContext || card.journeyContext || card.narrativeRequestId || card.result.successes !== countSuccesses(card.result) || countSuccesses(card.result) <= 0)
            errors.push('The referenced saved roll is not a verified positive Survival result for this character and activity.');
        if (card.activityContext && (card.activityContext.entryId !== entryId || card.activityContext.assignmentId !== assignmentId))
            errors.push('The roll belongs to another activity or quarter.');
        if (card.result.quarterDayId && ![entryId, entry.planId].includes(card.result.quarterDayId))
            errors.push('The roll has another quarter-day scope.');
        const end = completionFor(s, entryId)?.at;
        if (end && card.createdAt > end)
            errors.push('The saved result was created after this historical quarter completed.');
    }
    else {
        if (assignment.rollId || native?.rollIds.length)
            errors.push('The original saved Survival reference is missing or incompatible.');
        else
            uncertainties.push('Only a manual result is recorded; no saved Survival die is available.');
    }
    if (native && native.status !== 'Resolved')
        errors.push('The original mechanical procedure remains unresolved.');
    if (assignment.activity === 'Make Camp' && native && native.choice !== 'sheltered')
        errors.push('The original camp is not a verified successful shelter.');
    if (!native && assignment.outcome !== 'Success')
        errors.push('The original assignment does not record Success.');
    const privateCamp = repo.db.prepare('SELECT state_json FROM activity_private WHERE campaign_id=? AND assignment_id=?').get(id, assignmentId);
    if (privateCamp && !JSON.parse(String(privateCamp.state_json)).applied)
        errors.push('A private camp procedure still requires GM review.');
    if (assignment.activity === 'Make Camp') {
        const moved = (s.journey?.log ?? []).some(e => e.at >= entry.submittedAt && (e.before.hex !== entry.from || e.after.hex !== entry.from));
        if (moved)
            errors.push('Recorded movement left this camp behind; a return does not reactivate it.');
        const old = s.campsites?.find(c => c.assignmentId === assignmentId);
        if (old?.availability === 'inactive')
            errors.push('This campsite was explicitly abandoned or invalidated.');
    }
    const overrides = repo.db.prepare("SELECT override_scope FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule'").all(id);
    const scopedOverride = overrides.some(r => /forag|camp|consum|food|water|sleep/i.test(String(r.override_scope)));
    if (scopedOverride)
        uncertainties.push('An applicable scoped House Rule needs an explicit Table GM historical ruling before using the printed default.');
    const success = card ? countSuccesses(card.result) : null, yieldCount = assignment.activity === 'Forage' ? native?.yield ?? success : null;
    if (assignment.activity === 'Forage') {
        if (native && native.target !== 'food')
            errors.push('This Forage was for water, not Vegetables.');
        if (yieldCount !== null && yieldCount < 1)
            errors.push('This source has no supported Vegetable yield.');
        if (native && success && ![success, 2 * success].includes(native.yield))
            errors.push('The recorded yield conflicts with the supported success/talent calculation.');
    }
    const provisions = (s.activityState?.provisions ?? []).filter(p => p.kind === 'Vegetables' && (p.originAssignmentId === assignmentId || !p.originAssignmentId && p.ownerId === assignment.characterId && p.date === entry.date && p.quarter === entry.quarter));
    const inventory = provisions.map(p => ({ itemId: p.itemId, ownerId: p.ownerId, quantity: Number(s.characters.find(c => c.id === p.ownerId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0), fresh: fresh(s, p), hazard: !!p.hazard }));
    const ambiguousTransfers = (s.activityState?.provisions ?? []).filter(p => p.kind === 'Vegetables' && !p.originAssignmentId && p.ownerId !== assignment.characterId && p.date === entry.date && p.quarter === entry.quarter).map(p => ({ ownerId: p.ownerId, itemId: p.itemId, quantity: s.characters.find(ch => ch.id === p.ownerId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? '0' }));
    const rawUnattributed = s.characters.flatMap(ch => (ch.sheet?.gear ?? []).filter(g => /vegetables/i.test(g.item ?? '') && !s.activityState?.provisions.some(p => p.itemId === g.itemId)).map(g => ({ ownerId: ch.id, itemId: g.itemId ?? null, quantity: g.quantity })));
    return { entryId, assignmentId, characterId: assignment.characterId, characterName: assignment.characterName, activity: assignment.activity, date: entry.date, quarter: entry.quarter, hex: entry.from, location: form?.location ?? null, completed, classification: errors.length ? 'conflicting' : card && !scopedOverride ? 'verified_saved_result' : 'manual_incomplete', rollId: card?.id ?? null, successes: success, yield: yieldCount, errors, uncertainties, sources: campRules(repo, id), scopedOverride, inventory, unattributedInventory: [...rawUnattributed, ...ambiguousTransfers] };
}
export function reviewCandidates(repo: SqliteCampaignRepository, id: string) { const s = repo.get(id)!.session; return (s.dayTracker ?? []).slice(-80).flatMap(e => e.assignments.filter(a => ['Make Camp', 'Forage'].includes(a.activity)).map(a => { try {
    return historicalReview(repo, id, e.id, a.id);
}
catch (error) {
    return { entryId: e.id, assignmentId: a.id, activity: a.activity, errors: [error instanceof Error ? error.message : 'Review unavailable'] };
} })); }
