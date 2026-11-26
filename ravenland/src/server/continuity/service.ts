import {sameDay} from '../../lib/calendar';
import { createHash } from 'node:crypto';
import { continuityCommandSchema, type ContinuityEvent } from '../../lib/continuity';
import { occupiedCamp } from '../../lib/campsites';
import type { SqliteCampaignRepository } from '../sqlite';
import { requireCharacterAccess, type CharacterPrincipal } from '../character-access';
import { tableGM } from '../narrative/authority';
import { stateFor, fresh, dateDistance, addProvisions } from '../activities/state';
import { sheetFor, applySheet } from '../../lib/character-sheet';
import { createCamp, refreshSleep } from './camps';
import { historicalReview } from './review';
import { activityRules } from '../activities/rules';
import { makeRuling } from '../rulings/store';
export function executeContinuity(repo: SqliteCampaignRepository, raw: unknown, principal: CharacterPrincipal | null) {
    const c = continuityCommandSchema.parse(raw);
    requireCharacterAccess(principal, c.campaignId, c.actorId);
    if (!tableGM(repo, c.campaignId, principal).isTableGM)
        throw Error('Only the assigned Table GM can confirm historical continuity. A GM title in chat is not authority.');
    const { revision, ...identity } = c;
    void revision;
    const hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex'), db = repo.db;
    db.exec('BEGIN IMMEDIATE');
    try {
        const r = repo.get(c.campaignId);
        if (!r)
            throw Error('Campaign not found.');
        const prior = db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(c.campaignId, c.requestId);
        if (prior) {
            if (prior.fingerprint !== hash)
                throw Error('Continuity request reused with different choices.');
            db.exec('COMMIT');
            return { record: r, replayed: true, text: 'This exact correction is already recorded; nothing was applied twice.' };
        }
        if (r.revision !== c.revision)
            throw Error('The campaign changed. Refresh this review before confirming.');
        const s = r.session, st = stateFor(s), at = new Date().toISOString();
        let text = '';
        const event: ContinuityEvent = { id: c.requestId, kind: 'consumption_confirmation', actorId: principal!.playerId, date: c.date ?? s.campaign.date, quarter: c.quarter ?? s.campaign.quarter, recordedAt: at, sourceEntryId: c.entryId ?? null, sourceAssignmentId: c.assignmentId ?? null, sourceItemId: c.itemId ?? null, sourceRollId: null, sourceOwnerId: c.sourceOwnerId ?? null, awarded: 0, deducted: 0, allocations: [], reason: c.reason };
        if (c.operation === 'reconcile-camp') {
            if (!c.entryId || !c.assignmentId)
                throw Error('Choose the original completed Make Camp event.');
            const review = historicalReview(repo, r.id, c.entryId, c.assignmentId);
            if (review.activity !== 'Make Camp')
                throw Error('The source assignment is not Make Camp.');
            if (review.errors.length)
                throw Error(review.errors.join(' '));
            if (review.classification !== 'verified_saved_result' && (!c.historicalRuling || c.reason.length < 20))
                throw Error('This is a manual historical Success, not verified dice. Explicitly approve a historical campsite ruling and its uncertainty.');
            const existing = occupiedCamp(s);
            if (existing && existing.assignmentId !== review.assignmentId)
                throw Error('A different campsite already occupies this location. Review it before creating another.');
            const camp = createCamp(s, r.id, { entryId: review.entryId, assignmentId: review.assignmentId, characterId: review.characterId, rollId: review.rollId, date: review.date, quarter: review.quarter, sources: review.sources, kind: review.classification === 'verified_saved_result' ? 'verified_reconciliation' : 'gm_historical_ruling', reason: c.reason, receiptId: c.requestId, verified: review.classification === 'verified_saved_result' });
            refreshSleep(s);
            event.kind = 'camp_reconciliation';
            event.sourceRollId = review.rollId;
            event.sourceOwnerId = review.characterId;
            text = 'The ' + review.quarter + ' campsite in ' + camp.hex + ' is recorded and available. Current unrolled Sleep requests now use this shared camp. Completed history, saved dice, consumption and the clock were preserved.';
        }
        else if (c.operation === 'invalidate-camp') {
            const camp = s.campsites?.find(x => x.id === c.campId);
            if (!camp || camp.availability === 'inactive')
                throw Error('Choose an occupied active or compromised campsite.');
            camp.availability = 'inactive';
            camp.shelter = c.invalidation === 'break-camp' ? camp.shelter : 'unusable';
            camp.invalidatedReason = c.invalidation + ': ' + c.reason;
            camp.revision++;
            camp.audit.push({ eventId: c.requestId, kind: c.invalidation ?? 'unusable', date: s.campaign.date, quarter: s.campaign.quarter, reason: c.reason });
            event.kind = 'camp_invalidation';
            text = 'The campsite is unavailable. It cannot be revived merely by returning to this hex.';
            for (const e of st.entries.filter(e => !e.completed))
                for (const a of e.activities.filter(a => a.activity === 'Sleep' && a.stage === 'using-camp')) {
                    a.status = 'Needs GM ruling';
                    a.stage = 'camp-review';
                    a.summary = 'The shared camp became unavailable; review shelter or interrupt Sleep. No recovery has been applied.';
                }
        }
        else {
            if (!c.historicalRuling)
                activityRules(repo, r.id);
            if (!c.consumers?.length || !c.method)
                throw Error('Identify each consumer, resource and source method.');
            if (new Set(c.consumers.map(x => x.characterId + ':' + x.resource)).size !== c.consumers.length)
                throw Error('Each daily need can be allocated only once.');
            if (c.consumers.some(x => !s.characters.some(ch => ch.id === x.characterId)))
                throw Error('Choose actual party members.');
            const date = c.date ?? s.campaign.date, quarter = c.quarter ?? s.campaign.quarter, dayDelta = dateDistance(date, s.campaign.date,s.environment?.calendar), quarters = ['Morning', 'Day', 'Evening', 'Night'];
            if (dayDelta === null || dayDelta < 0 || dayDelta === 0 && quarters.indexOf(quarter) > quarters.indexOf(s.campaign.quarter))
                throw Error('Choose a known in-world date/quarter that has already occurred.');
            if (!c.earlier && (!sameDay(date,s.campaign.date,s.environment?.calendar) || quarter !== s.campaign.quarter))
                throw Error('Confirm that this meal occurred earlier before selecting a past date or quarter.');
            if (c.reason.length < 20)
                throw Error('Record the source and the historical bookkeeping being corrected.');
            const pending = c.consumers.filter(x => !st.needs.some(n => sameDay(n.date,date,s.environment?.calendar) && n.characterId === x.characterId && n.resource === x.resource && n.status === 'Satisfied'));
            if (pending.length === 0) {
                text = 'These needs are already satisfied; no inventory award, deduction or resource roll was repeated.';
            }
            else {
                const source = c.entryId && c.assignmentId ? historicalReview(repo, r.id, c.entryId, c.assignmentId) : null;
                event.sourceRollId = source?.rollId ?? null;
                event.sourceOwnerId = c.sourceOwnerId ?? source?.characterId ?? null;
                if (source) {
                    if (source.yield !== null) {
                        const sourceItems = source.inventory.map(p => p.itemId), used = (st.continuityEvents ?? []).filter(e => e.sourceAssignmentId === source.assignmentId).flatMap(e => e.allocations).length + st.needs.filter(n => n.status === 'Satisfied' && n.itemId && sourceItems.includes(n.itemId) && !n.receiptId?.startsWith('continuity:') && !(st.continuityEvents ?? []).some(e => e.id === n.receiptId)).length;
                        if (source.inventory.reduce((n, p) => n + p.quantity, 0) + used > source.yield)
                            throw Error('Recorded stock and prior meals exceed the original supported yield. Review the inventory discrepancy before confirming consumption.');
                    }
                    const sourceAge = dateDistance(source.date, date,s.environment?.calendar);
                    if (sourceAge === null || sourceAge < 0 || sourceAge === 0 && quarters.indexOf(quarter) < quarters.indexOf(source.quarter))
                        throw Error('The claimed meal predates the original Foraging source.');
                    if (['already-deducted', 'ruling'].includes(c.method) && !fresh({ ...s, campaign: { ...s.campaign, date, quarter } }, { itemId: 'historical-source', ownerId: source.characterId, kind: 'Vegetables', date: source.date, quarter: source.quarter, chefRank: 0, hazard: null }))
                        throw Error('The known raw source was expired at the claimed meal time.');
                }
                if (c.method === 'ruling') {
                    if (source && source.activity !== 'Forage')
                        throw Error('A camp record is not a food source.');
                    if (source && pending.some(x => x.resource !== 'food'))
                        throw Error('A Vegetable source cannot satisfy Water.');
                    if (!c.historicalRuling)
                        throw Error('Explicitly select Table GM consumption ruling. It records testimony, not a saved roll or acquisition.');
                    if (c.adjustmentApproved)
                        throw Error('A consumption fact ruling cannot silently adjust inventory. Approve an inventory correction separately.');
                    if (source?.errors.length)
                        throw Error('The selected source conflicts with the claim. Choose a different actual source or resolve that discrepancy: ' + source.errors.join(' '));
                    if (source && [...source.inventory, ...source.unattributedInventory].some(p => Number(p.quantity) > 0) || c.itemId && st.provisions.some(p => p.itemId === c.itemId && Number(s.characters.find(ch => ch.id === p.ownerId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0) > 0))
                        throw Error('Recorded portions still exist. Approve their inventory deduction separately instead of bypassing it with a consumption ruling.');
                    if (source?.yield !== null && source?.yield !== undefined) {
                        const legacySourceIds = [...source.inventory, ...source.unattributedInventory].map(p => p.itemId);
                        const used = (st.continuityEvents ?? []).filter(e => e.sourceAssignmentId === source.assignmentId).flatMap(e => e.allocations).length + st.needs.filter(n => n.status === 'Satisfied' && n.itemId && legacySourceIds.includes(n.itemId) && !n.receiptId?.startsWith('continuity:') && !(st.continuityEvents ?? []).some(e => e.id === n.receiptId)).length;
                        if (used + pending.length > source.yield)
                            throw Error('The known source yield is already allocated.');
                    }
                    event.kind = 'consumption_ruling';
                    event.sourceRollId = null;
                    event.sourceItemId = null;
                }
                else {
                    if (source?.errors.length)
                        throw Error(source.errors.join(' '));
                    if (source && source.activity !== 'Forage')
                        throw Error('Choose the original food Foraging event.');
                    if (source && source.classification !== 'verified_saved_result' && !c.historicalRuling)
                        throw Error('The source is only a manual Success. Use an explicit historical ruling rather than treating it as verified yield.');
                    let provision = st.provisions.find(p => p.itemId === c.itemId);
                    if (source && c.itemId && !source.inventory.some(p => p.itemId === c.itemId))
                        throw Error('The selected stock does not belong to the reviewed Foraging source.');
                    if (c.sourceOwnerId && provision && provision.ownerId !== c.sourceOwnerId)
                        throw Error('The selected stack belongs to another source character.');
                    if (source && c.sourceOwnerId && !source.inventory.some(p => p.ownerId === c.sourceOwnerId) && c.sourceOwnerId !== source.characterId)
                        throw Error('The stated source owner does not match the original or transferred provision.');
                    if (c.method === 'restore-missing-yield') {
                        if (!source || source.classification !== 'verified_saved_result' || !source.yield || source.yield < pending.length)
                            throw Error('A verified original yield sufficient for all allocations is required.');
                        if (source.inventory.length || source.unattributedInventory.length || (st.continuityEvents ?? []).some(e => e.sourceAssignmentId === source.assignmentId && (e.awarded > 0 || e.allocations.length > 0)))
                            throw Error('An award, remaining stock or ambiguous inventory already exists. Review its deductions; do not award the yield again.');
                        if (!c.adjustmentApproved)
                            throw Error('Approve the visible missing-yield award and meal deduction together before applying them.');
                        const itemId = addProvisions(s, source.characterId, 'Vegetables', source.yield);
                        provision = st.provisions.find(p => p.itemId === itemId)!;
                        Object.assign(provision, { date: source.date, quarter: source.quarter, originEntryId: source.entryId, originAssignmentId: source.assignmentId, ...(source.rollId ? { originRollId: source.rollId } : {}) });
                        const restored = s.characters.find(ch => ch.id === source.characterId)?.sheet?.gear?.find(g => g.itemId === itemId);
                        if (restored)
                            restored.notes = 'Historical ' + source.date + ' ' + source.quarter + ' Foraging yield reconciled now; acquisition/deduction receipt ' + c.requestId;
                        event.awarded = source.yield;
                        event.sourceItemId = itemId!;
                    }
                    if (c.method === 'already-deducted') {
                        const ids = source ? [...source.inventory, ...source.unattributedInventory].map(p => p.itemId) : (provision ? [provision.itemId] : []);
                        if (!source && !provision)
                            throw Error('Choose the actual original provision/source event.');
                        if (pending.some(x => x.resource !== 'food'))
                            throw Error('A Vegetable Foraging source cannot satisfy Water.');
                        const knownYield = source?.yield ?? null, already = (st.continuityEvents ?? []).filter(e => e.sourceAssignmentId === source?.assignmentId && e.sourceAssignmentId !== null).flatMap(e => e.allocations).length + (st.needs.filter(n => n.status === 'Satisfied' && n.itemId && ids.includes(n.itemId) && !n.receiptId?.startsWith('continuity:') && !(st.continuityEvents ?? []).some(e => e.id === n.receiptId)).length);
                        if (knownYield === null)
                            throw Error('A known original yield is needed to reconcile a prior deduction; otherwise choose the clearly labeled Table GM consumption ruling.');
                        if (already + pending.length + (source ? [...source.inventory, ...source.unattributedInventory].reduce((n, p) => n + Number(p.quantity), 0) : 0) > knownYield)
                            throw Error('The known source yield is already allocated; these portions cannot be consumed twice.');
                        if (!c.historicalRuling)
                            throw Error('Prior deductions without a verified consumption receipt require explicit Table GM testimony. No earlier transaction will be invented.');
                        if (provision && Number(s.characters.find(ch => ch.id === provision.ownerId)?.sheet?.gear?.find(g => g.itemId === provision!.itemId)?.quantity ?? 0) > 0)
                            throw Error('The chosen portions still remain in inventory. Approve their actual deduction instead.');
                    }
                    else {
                        if (!provision)
                            throw Error('Select an available, recorded provision stack.');
                        if (c.sourceOwnerId && provision.ownerId !== c.sourceOwnerId)
                            throw Error('The selected stack belongs to another source character.');
                        if (provision.hazard)
                            throw Error('Resolve the specific food-safety procedure first; historical confirmation cannot bypass a hazard.');
                        if (pending.some(x => x.resource === 'food' ? !['Vegetables', 'Meat', 'Fish', 'Food'].includes(provision!.kind) : provision!.kind !== 'Water'))
                            throw Error('The provision kind does not satisfy the requested need.');
                        const owner = s.characters.find(ch => ch.id === provision!.ownerId)!, sheet = sheetFor(owner), item = sheet.gear?.find(g => g.itemId === provision!.itemId), quantity = Number(item?.quantity);
                        if (!item || !Number.isSafeInteger(quantity) || quantity < pending.length)
                            throw Error('Insufficient recorded portions for these consumers.');
                        const when = { ...s, campaign: { ...s.campaign, date, quarter } };
                        if (!fresh(when, provision))
                            throw Error('Those raw portions were expired at the claimed meal time. No need was satisfied.');
                        item.quantity = String(quantity - pending.length);
                        if (item.quantity === '0')
                            sheet.gear = sheet.gear!.filter(g => g !== item);
                        s.characters = s.characters.map(ch => ch.id === owner.id ? applySheet(ch, sheet) : ch);
                        event.deducted = pending.length;
                        event.sourceItemId = provision.itemId;
                        event.sourceOwnerId = provision.ownerId;
                    }
                }
                for (const target of pending) {
                    let need = st.needs.find(n => sameDay(n.date,date,s.environment?.calendar) && n.characterId === target.characterId && n.resource === target.resource);
                    if (need?.request?.rollId || need?.rollId)
                        throw Error('A saved consumption roll is already linked; resolve that exact procedure first.');
                    if (!need) {
                        need = { date, characterId: target.characterId, resource: target.resource, status: 'Pending', sourceId: null, itemId: null, request: null, rollId: null, receiptId: null, explanation: '' };
                        st.needs.push(need);
                    }
                    const provenance = c.method === 'ruling' ? 'gm_historical_ruling' : c.method === 'already-deducted' ? 'confirmed_prior_deduction' : 'verified_portion';
                    Object.assign(need, { status: 'Satisfied', sourceId: event.sourceOwnerId, itemId: event.sourceItemId, request: null, rollId: null, receiptId: 'continuity:' + c.requestId, explanation: c.method === 'ruling' ? 'Satisfied by explicit Table GM consumption ruling; no saved roll or acquisition is implied. ' + c.reason : 'One eligible portion from ' + (source ? source.characterName + '’s ' + source.quarter + ' Foraging' : 'the reviewed inventory') + '; ' + (c.method === 'already-deducted' ? 'prior deduction confirmed by Table GM testimony; nothing deducted again.' : 'actual inventory deduction recorded now.') });
                    event.allocations.push({ characterId: target.characterId, resource: target.resource, amount: 1, date, provenance });
                    if (sameDay(date,s.campaign.date,s.environment?.calendar)) {
                        const ch = s.characters.find(ch => ch.id === target.characterId)!, sheet = sheetFor(ch);
                        sheet[target.resource === 'food' ? 'cond-hungry' : 'cond-thirsty'] = false;
                        s.characters = s.characters.map(x => x.id === ch.id ? applySheet(ch, sheet) : x);
                    }
                }
                text = pending.map(x => s.characters.find(ch => ch.id === x.characterId)!.name + ' — ' + x.resource + ' satisfied').join('; ') + '. Already completed needs, saved dice and the campaign clock were preserved.';
            }
        }
        if (c.historicalRuling)
            makeRuling(repo, { campaignId: r.id, originId: c.requestId, sceneId: 'continuity:' + s.campaign.hex, domain: 'rules_conflict', question: c.operation === 'reconcile-camp' ? 'Historical camp uncertainty' : 'Historical consumption testimony', scope: { key: c.assignmentId ?? c.requestId, fingerprint: hash }, decision: c.reason, reasoning: 'Explicit historical ruling; it does not create missing dice, earlier receipts or unrelated inventory.', decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', requestId: c.requestId, receiptId: c.requestId, blockingReason: '', risk: 'bounded' });
        (st.continuityEvents ??= []).push(event);
        s.journal.push({ id: c.requestId + ':continuity', title: 'Continuity: ' + c.operation, text: text + '\n' + c.reason });
        const record = repo.update(r.id, r.revision, s, { activitiesValidated: true, workflowValidated: true });
        db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(r.id, c.requestId, hash, at);
        db.exec('COMMIT');
        return { record, replayed: false, text };
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
