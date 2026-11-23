import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { SqliteCampaignRepository } from '../src/server/sqlite';
import { executeContinuity } from '../src/server/continuity/service';
import { historicalReview } from '../src/server/continuity/review';
import { continuityConversation, guardCampNarration } from '../src/server/continuity/conversation';
import { occupiedCamp, usableCamp, departCamps, siteKey } from '../src/lib/campsites';
import { currentRoutine } from '../src/lib/activities';
import { requestedActivityRoll } from '../src/server/activities/context';
export async function realContinuityTests(t: TestContext, repo: SqliteCampaignRepository, fixture: () => any, file: string) {
    function setup() {
        const f = fixture();
        f.run('configure', { checkpoint: 'Night', season: 'Autumn' });
        const e = f.assign(['Forage', 'Make Camp', 'Sleep', 'Keep Watch']), ids = f.current().session.characters.map((c: any) => c.id);
        f.run('prepare', { assignmentId: e.activities[0].assignmentId, target: 'food' });
        f.roll(ids[0], 2);
        f.roll(ids[1]);
        f.run('complete', { entryId: e.entryId });
        const night = f.assign(['Sleep', 'Sleep', 'Keep Watch', 'Sleep']);
        for (const id of ids)
            for (const target of ['food', 'water'])
                if (target === 'water' || [ids[1], ids[3]].includes(id)) {
                    f.run('resource', { actorId: id, target });
                    f.roll(id, 0, 3);
                }
        const source = { entryId: e.entryId, assignmentId: e.activities[0].assignmentId }, campSource = { entryId: e.entryId, assignmentId: e.activities[1].assignmentId };
        const run = (patch: any, requestId = randomUUID()) => executeContinuity(repo, { campaignId: f.id, revision: f.current().revision, requestId, actorId: ids[0], confirmed: true, reason: 'The Table GM reviewed the original Evening source and the exact historical bookkeeping.', ...patch }, f.principal);
        return { ...f, e, night, ids, source, campSource, runContinuity: run };
    }
    function snapshots(f: any) { const s = f.current().session; return { day: s.dayTracker, dice: s.dice, clock: s.campaign, completed: s.chatJourney?.updates.filter((u: any) => u.kind === 'completed') }; }
    function removeCamp(f: any) { const r = f.current(); delete r.session.campsites; repo.update(f.id, r.revision, r.session, { activitiesValidated: true }); }
    const meal = (f: any, method = 'available') => ({ operation: 'confirm-consumption', ...f.source, method, date: f.current().session.campaign.date, quarter: 'Evening', earlier: true, itemId: f.current().session.activityState.provisions[0]?.itemId, consumers: [f.ids[0], f.ids[2]].map(characterId => ({ characterId, resource: 'food', amount: 1 })) });
    await t.test('6.8c one Evening camp persists into Night and all three Sleep rows use it without bare-ground dice', () => {
        const f = setup(), s = f.current().session;
        assert.equal(s.campsites.length, 1);
        assert.equal(usableCamp(s)?.establishedBy, f.ids[1]);
        assert.equal(usableCamp(s)?.establishedQuarter, 'Evening');
        for (const i of [0, 1, 3]) {
            assert.equal(currentRoutine(s)!.activities[i].stage, 'using-camp');
            assert.equal(requestedActivityRoll(s, f.ids[i]), null);
        }
        assert.equal(s.activityState.needs.filter((n: any) => n.status === 'Pending').length, 2);
        assert.throws(() => f.run('complete', { entryId: f.night.entryId }), /food|daily|needs/i);
    });
    await t.test('6.8c exact shared two-Vegetable meals preserve six completed needs, original dice and clock; retry and restart are safe', () => {
        const f = setup(), before = snapshots(f), untouched = f.current().session.activityState.needs.filter((n: any) => n.status === 'Satisfied'), id = randomUUID(), patch = meal(f);
        f.runContinuity(patch, id);
        assert.equal(f.runContinuity(patch, id).replayed, true);
        const s = f.current().session;
        assert.equal(s.activityState.needs.filter((n: any) => n.status === 'Satisfied').length, 8);
        assert.deepEqual(s.activityState.needs.filter((n: any) => untouched.some((u: any) => u.characterId === n.characterId && u.resource === n.resource)), untouched);
        assert.equal(s.characters[0].sheet.gear.filter((g: any) => g.item === 'Vegetables').length, 0);
        assert.deepEqual(snapshots(f), before);
        assert.equal(s.activityState.continuityEvents.at(-1).deducted, 2);
        const reopened = new SqliteCampaignRepository(file);
        try {
            assert.deepEqual(reopened.get(f.id)!.session.activityState, s.activityState);
            assert.deepEqual(reopened.get(f.id)!.session.campsites, s.campsites);
        }
        finally {
            reopened.close();
        }
        f.run('complete', { entryId: f.night.entryId });
        assert.equal(f.current().session.campaign.quarter, 'Morning');
    });
    await t.test('6.8c historical camp reconciliation changes only unrolled Sleep and shared camp; duplicate retry cannot create another camp', () => {
        const f = setup();
        removeCamp(f);
        let r = f.current();
        for (const a of currentRoutine(r.session)!.activities.filter(a => a.activity === 'Sleep')) {
            a.stage = 'bare-sleep';
            a.status = 'Needs GM ruling';
            a.summary = 'Historical missing camp';
        }
        repo.update(f.id, r.revision, r.session, { activitiesValidated: true });
        const before = snapshots(f), needs = structuredClone(f.current().session.activityState.needs), id = randomUUID(), patch = { operation: 'reconcile-camp', ...f.campSource };
        assert.equal(historicalReview(repo, f.id, f.campSource.entryId, f.campSource.assignmentId).classification, 'verified_saved_result');
        f.runContinuity(patch, id);
        assert.equal(f.runContinuity(patch, id).replayed, true);
        assert.equal(f.current().session.campsites.length, 1);
        assert.deepEqual(f.current().session.activityState.needs, needs);
        assert.deepEqual(snapshots(f), before);
        assert.ok(currentRoutine(f.current().session)!.activities.filter(a => a.activity === 'Sleep').every(a => a.stage === 'using-camp'));
    });
    await t.test('6.8c verified missing yield requires explicit +2 −2 approval, grants once atomically and preserves Evening history', () => { const f = setup(); let r = f.current(); r.session.characters[0].sheet.gear = []; r.session.activityState.provisions = []; repo.update(f.id, r.revision, r.session, { activitiesValidated: true }); const before = snapshots(f), patch = { ...meal(f, 'restore-missing-yield'), itemId: undefined }; assert.throws(() => f.runContinuity(patch), /Approve/); assert.equal(f.current().session.activityState.provisions.length, 0); f.runContinuity({ ...patch, adjustmentApproved: true }); const e = f.current().session.activityState.continuityEvents.at(-1); assert.equal(e.awarded, 2); assert.equal(e.deducted, 2); assert.equal(f.current().session.characters[0].sheet.gear.length, 0); assert.deepEqual(snapshots(f), before); f.runContinuity({ ...patch, adjustmentApproved: true }); assert.equal(f.current().session.activityState.continuityEvents.reduce((n: number, e: any) => n + e.awarded, 0), 2); });
    await t.test('6.8c manual historical campsite Success needs an explicit ruling and never fabricates a die', () => { const f = fixture(), s = f.current().session, id = randomUUID(), assignmentId = randomUUID(); s.dayTracker = [{ id, date: s.campaign.date, quarter: 'Evening', from: 'U06', destination: '', endingHex: 'U06', planId: id, weather: 'Clear', direction: '', travelRuling: 'Stationary', notes: '', narrative: 'Legacy manual campsite record', traveling: false, submittedAt: new Date().toISOString(), status: 'Completed', assignments: [{ id: assignmentId, characterId: s.characters[1].id, characterName: 'Edrus', activity: 'Make Camp', skill: 'Survival', outcome: 'Success' }] }]; s.campaign.quarter = 'Night'; repo.update(f.id, f.current().revision, s, { activitiesValidated: true, workflowValidated: true }); const command = { campaignId: f.id, revision: f.current().revision, requestId: randomUUID(), actorId: s.characters[0].id, operation: 'reconcile-camp', entryId: id, assignmentId, reason: 'The Table GM confirms Edrus completed shelter here during Evening; the missing original roll remains uncertain.', confirmed: true }; assert.equal(historicalReview(repo, f.id, id, assignmentId).classification, 'manual_incomplete'); assert.throws(() => executeContinuity(repo, command, f.principal), /manual/); executeContinuity(repo, { ...command, historicalRuling: true }, f.principal); assert.equal(usableCamp(f.current().session)?.rollId, null); assert.equal(usableCamp(f.current().session)?.establishment, 'historical_ruling'); assert.equal(f.current().session.dice?.length ?? 0, 0); });
    await t.test('6.8c insufficient stock, expired meals, false authority and conflicting source cannot mutate needs', () => { const f = setup(); let r = f.current(); r.session.characters[0].sheet.gear[0].quantity = '1'; repo.update(f.id, r.revision, r.session); const before = snapshots(f), needs = structuredClone(f.current().session.activityState.needs); assert.throws(() => f.runContinuity(meal(f)), /Insufficient/); const p = { ...meal(f), campaignId: f.id, revision: f.current().revision, requestId: randomUUID(), actorId: f.ids[0], reason: 'Unauthorized historical correction must remain rejected.', confirmed: true }; assert.throws(() => executeContinuity(repo, p, { playerId: 'ordinary', grants: f.principal.grants }), /Table GM/); assert.throws(() => f.runContinuity({ ...meal(f), ...f.campSource }), /Forag/); r = f.current(); r.session.activityState.provisions[0].date = '12th Stillfall, 1165 +2 days'; repo.update(f.id, r.revision, r.session, { activitiesValidated: true }); assert.throws(() => f.runContinuity({ ...meal(f), consumers: meal(f).consumers.slice(0, 1) }), /expired/); assert.deepEqual(f.current().session.activityState.needs, needs); assert.deepEqual(snapshots(f), before); });
    await t.test('6.8c prior deduction testimony does not deduct again; known yield prevents another allocation', () => { const f = setup(); let r = f.current(); r.session.characters[0].sheet.gear = []; repo.update(f.id, r.revision, r.session); f.runContinuity({ ...meal(f, 'already-deducted'), historicalRuling: true }); const e = f.current().session.activityState.continuityEvents.at(-1); assert.equal(e.deducted, 0); assert.ok(e.allocations.every((x: any) => x.provenance === 'confirmed_prior_deduction')); assert.equal(f.current().session.characters[0].sheet.gear.length, 0); assert.throws(() => f.runContinuity({ ...meal(f, 'already-deducted'), historicalRuling: true, date: '12th Stillfall, 1165 +1 day' }), /already occurred/); });
    await t.test('6.8c explicit no-evidence meal ruling records facts without acquiring supplies, rolling dice or inventing earlier receipts', () => { const f = fixture(); f.run('configure', { checkpoint: 'Evening' }); const before = snapshots(f), id = f.current().session.characters[0].id, command = { campaignId: f.id, revision: f.current().revision, requestId: randomUUID(), actorId: id, operation: 'confirm-consumption', method: 'ruling', historicalRuling: true, consumers: [{ characterId: id, resource: 'food', amount: 1 }], reason: 'The Table GM establishes the already-eaten meal as a historical fact; original supply evidence is incomplete.', confirmed: true }; executeContinuity(repo, command, f.principal); const s = f.current().session, e = s.activityState.continuityEvents.at(-1); assert.equal(e.kind, 'consumption_ruling'); assert.equal(e.sourceRollId, null); assert.equal(e.awarded, 0); assert.equal(e.deducted, 0); assert.match(s.activityState.needs[0].explanation, /Table GM consumption ruling/); assert.deepEqual(snapshots(f), before); });
    await t.test('6.8c chat validates authority and invokes real camp and food operations; speculation and model prose do not mutate state', () => { const f = setup(); removeCamp(f); const before = f.current().revision; assert.equal(continuityConversation(repo, f.id, f.ids[0], randomUUID(), 'Could we use the camp Edrus made during Evening?', f.principal), null); assert.match(guardCampNarration(f.current().session, 'The camp is available.'), /No available/); assert.equal(f.current().revision, before); assert.match(continuityConversation(repo, f.id, f.ids[0], randomUUID(), 'Use the camp Edrus made during Evening for Night Sleep.', f.principal)!, /recorded/); assert.ok(usableCamp(f.current().session)); assert.match(continuityConversation(repo, f.id, f.ids[0], randomUUID(), 'As Table GM, I confirm Grogahx and Elyanna each consumed one portion of the vegetables during Evening.', f.principal)!, /satisfied/); assert.equal(f.current().session.activityState.needs.filter((n: any) => n.status === 'Satisfied').length, 8); });
    await t.test('6.8c destruction and same-hex site departure invalidate shelter and never revive it on returning', () => { const f = setup(); const original = structuredClone(f.current().session), next = structuredClone(original); next.campaign.location = 'Another forest clearing'; assert.notEqual(siteKey(original), siteKey(next)); departCamps(original, next, 'test-departure'); assert.equal(next.campsites[0].availability, 'inactive'); next.campaign.location = original.campaign.location; assert.equal(occupiedCamp(next), null); f.runContinuity({ operation: 'invalidate-camp', campId: original.campsites[0].id, invalidation: 'destroyed' }); assert.equal(usableCamp(f.current().session), null); assert.throws(() => f.runContinuity({ operation: 'reconcile-camp', ...f.campSource }), /invalidated/); assert.ok(currentRoutine(f.current().session)!.activities.filter(a => a.activity === 'Sleep').every(a => a.status === 'Needs GM ruling')); });
    await t.test('6.8c ordinary shared transfer retains source attribution and prevents a duplicate missing-yield award', () => { const f = setup(), itemId = f.current().session.activityState.provisions[0].itemId; f.run('share-item', { sourceId: f.ids[0], recipientId: f.ids[2], itemId, quantity: 1 }); const review = historicalReview(repo, f.id, f.source.entryId, f.source.assignmentId); assert.equal(review.inventory.length, 2); assert.equal(review.inventory.reduce((n, p) => n + p.quantity, 0), 2); assert.throws(() => f.runContinuity({ ...meal(f, 'restore-missing-yield'), itemId: undefined, adjustmentApproved: true }), /already exists/); });
    await t.test('6.8c active shelter does not cure Cold or allow premature Sleep recovery', () => { const f = setup(); f.runContinuity(meal(f)); let r = f.current(); r.session.characters[0].sheet['cond-cold'] = true; r.session.characters[0].sheet['attr-wits'] = '2'; repo.update(f.id, r.revision, r.session); assert.throws(() => f.run('complete', { entryId: f.night.entryId }), /Cold|cold/); assert.equal(f.current().session.characters[0].sheet['attr-wits'], '2'); assert.equal(f.current().session.campaign.quarter, 'Night'); });
    await t.test('6.8c a roll scoped to another actor or activity cannot establish historical shelter', () => { const f = setup(); removeCamp(f); const r = f.current(), a = r.session.activityState.entries[0].activities[1], card = r.session.dice.find((c: any) => c.id === a.rollIds[0]); card.characterId = f.ids[3]; card.result.characterId = f.ids[3]; card.original.characterId = f.ids[3]; repo.update(f.id, r.revision, r.session); const revision = f.current().revision; assert.throws(() => f.runContinuity({ operation: 'reconcile-camp', ...f.campSource }), /verified positive Survival/); assert.equal(f.current().revision, revision); assert.equal(f.current().session.campsites, undefined); });
    await t.test('6.8c one unresolved private camp mishap is a shared shelter issue, not separate bare-ground requests or weather immunity', () => { const f = fixture(), e = f.assign(['Make Camp', 'Rest', 'Sleep', 'Keep Watch']), ids = f.current().session.characters.map((ch: any) => ch.id); f.roll(ids[0], 0); f.run('keep', { assignmentId: e.activities[0].assignmentId }); let s = f.current().session; assert.equal(s.campsites.length, 1); assert.equal(occupiedCamp(s)?.availability, 'compromised'); assert.equal(currentRoutine(s)!.activities[2].stage, 'camp-review'); assert.equal(currentRoutine(s)!.activities[2].request, null); assert.doesNotMatch(JSON.stringify(s.campsites), /\"mishap\":/); repo.db.prepare('UPDATE activity_private SET state_json=? WHERE campaign_id=? AND assignment_id=?').run(JSON.stringify({ mishap: 21, applied: false }), f.id, e.activities[0].assignmentId); f.run('reveal-camp', { assignmentId: e.activities[0].assignmentId }); assert.equal(usableCamp(f.current().session), null); assert.equal(occupiedCamp(f.current().session)?.shelter, 'unusable'); assert.throws(() => f.run('complete', { entryId: e.entryId }), /camp|shelter|follow-up/); });
    await t.test('6.8c a historical claim cannot eat before its source existed or reuse unrelated inventory as that source', () => { const f = setup(); assert.throws(() => f.runContinuity({ ...meal(f), quarter: 'Morning' }), /predates/); let r = f.current(); const p = r.session.activityState.provisions[0]; p.originAssignmentId = randomUUID(); p.date = '11th Stillfall, 1165'; repo.update(f.id, r.revision, r.session, { activitiesValidated: true }); assert.throws(() => f.runContinuity(meal(f)), /does not belong/); });
    await t.test('6.8c legacy transferred portions with no origin metadata still count previous meal receipts against the source yield', () => { const f = setup(), item = f.current().session.activityState.provisions[0].itemId; f.run('share-item', { sourceId: f.ids[0], recipientId: f.ids[2], itemId: item, quantity: 1 }); f.run('consume', { sourceId: f.ids[0], recipientId: f.ids[0], itemId: item, target: 'food' }); const otherItem = f.current().session.activityState.provisions.find((p: any) => p.ownerId === f.ids[2]).itemId; f.run('consume', { actorId: f.ids[2], sourceId: f.ids[2], recipientId: f.ids[2], itemId: otherItem, target: 'food' }); const r = f.current(); delete r.session.activityState.continuityEvents; for (const p of r.session.activityState.provisions) {
        delete p.originEntryId;
        delete p.originAssignmentId;
        delete p.originRollId;
    } const n = r.session.activityState.needs.find((n: any) => n.characterId === f.ids[3] && n.resource === 'food'); Object.assign(n, { status: 'Pending', receiptId: null, rollId: null, request: null }); repo.update(f.id, r.revision, r.session, { activitiesValidated: true }); assert.throws(() => f.runContinuity({ ...meal(f, 'already-deducted'), historicalRuling: true, consumers: [{ characterId: f.ids[3], resource: 'food', amount: 1 }] }), /already allocated/); });
    await t.test('6.8c imports and AI test copies preserve snapshot shelter with independent campsite and campaign identities', () => { const f = setup(), original = f.current(), copy = repo.create(structuredClone(original.session)); assert.notEqual(copy.id, original.id); assert.notEqual(copy.session.campsites![0].id, original.session.campsites[0].id); assert.equal(copy.session.campsites![0].campaignId, copy.id); assert.equal(usableCamp(copy.session)?.availability, 'active'); assert.equal(copy.session.campsites![0].audit.at(-1)?.kind, 'campaign_copy'); assert.deepEqual(repo.get(original.id)!.session.campsites, original.session.campsites); const principal = { playerId: 'trusted-local', mode: 'trusted-local' as const, grants: [{ campaignId: copy.id, characterIds: f.ids }] }; executeContinuity(repo, { campaignId: copy.id, revision: copy.revision, requestId: randomUUID(), actorId: f.ids[0], operation: 'invalidate-camp', campId: copy.session.campsites![0].id, invalidation: 'break-camp', reason: 'Breaking camp only in this independent imported campaign snapshot.', confirmed: true }, principal); assert.equal(usableCamp(repo.get(copy.id)!.session), null); assert.ok(usableCamp(repo.get(original.id)!.session)); });
    await t.test('6.8c a known two-portion source cannot silently validate an inflated recorded stack', () => { const f = setup(), r = f.current(); r.session.characters[0].sheet.gear[0].quantity = '3'; repo.update(f.id, r.revision, r.session); const before = f.current(); assert.throws(() => f.runContinuity(meal(f)), /exceed the original supported yield/); assert.deepEqual(f.current(), before); });
}
