import { executeJourney } from '../src/server/journey/service';
import { activeChatForm } from '../src/lib/journey/chat-engine';
import { loadCombatRules, lookupEnemy } from '../src/server/combat/sources';
import { verifiedMobilityRules } from '../src/server/combat/mobility-rules';
import { createEncounter, beginEnemyAttack } from '../src/server/combat/engine';
import { saveCombat } from '../src/server/combat/store';
import { recoveryInspection, executeCombatRecovery } from '../src/server/combat/administrative-recovery';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteCampaignRepository } from '../src/server/sqlite';
import { SqliteMapStore } from '../src/server/map/store';
import { readGeography } from '../src/server/map/importer';
import { initialSession } from '../src/lib/mock';
import { narrativeTurn, afterNarrativeDice } from '../src/server/narrative/journey';
import { narrativeState } from '../src/server/narrative/state';
import { executeDice } from '../src/server/dice/service';
import { expeditionFor } from '../src/lib/journey/expedition';
import { AIService } from '../src/server/ai/service';
import { SqliteMemoryRepository } from '../src/server/ai/memory';
export async function realNarrativeJourneyTests(t: TestContext, source: SqliteCampaignRepository, sourceId: string) {
    const dir = mkdtempSync(join(tmpdir(), 'raven-68-')), file = join(dir, 'db.sqlite');
    source.db.prepare('VACUUM INTO ?').run(file);
    const repo = new SqliteCampaignRepository(file);
    try {
        const map = new SqliteMapStore(repo);
        map.import(await readGeography('data/Ravenland_Campaign_Master.xlsx', JSON.parse(readFileSync('config/ravenland-master.json', 'utf8'))));
        map.calibrate(JSON.parse(readFileSync('config/ravenland-calibration.json', 'utf8')).grid);
        function fixture() {
            const s = structuredClone(initialSession);
            Object.assign(s.campaign, { hex: 'T05', location: 'Belderand', terrain: 'Forest', date: '12th Stillfall, 1165', quarter: 'Day', weather: 'Clear' });
            s.messages = [];
            s.journal = [];
            s.characters.forEach((c, i) => { c.name = ['Grogahx', 'Edrus', 'Elyanna', 'Rose Underbough'][i]; c.sheet = { ...Object.fromEntries(['strength', 'agility', 'wits', 'empathy'].flatMap(a => [[`attr-${a}`, '3'], [`attr-${a}-regular`, '3']])), gear: [], weapons: [], 'skill-survival': '0', 'skill-scouting': '0', 'res-food': 'D6', 'res-water': 'D8', 'coin-gold': '0', 'coin-silver': '0', 'coin-copper': '0' }; });
            const r = repo.create(s);
            repo.db.prepare('INSERT INTO campaign_sourcebooks (campaign_id,document_id) SELECT ?,id FROM source_documents WHERE campaign_id=?').run(r.id, sourceId);
            const principal = { playerId: 'trusted-local', mode: 'trusted-local' as const, grants: [{ campaignId: r.id, characterIds: r.session.characters.map(c => c.id) }] }, current = () => repo.get(r.id)!, say = (text: string, key = randomUUID(), die: (sides: number) => number = () => 1) => narrativeTurn(repo, r.id, current().session.characters[0].id, key, text, principal, die)!;
            const roll = (actor: number, skill: string, success = true) => { const id = randomUUID(); executeDice({ type: 'create', campaignId: r.id, actionId: randomUUID(), roll: { id, characterId: current().session.characters[actor].id, skill, attribute: success ? [6, 2, 3] : [2, 3, 4], skillDice: [], negativeSkill: false, gear: [], artifacts: [], successes: success ? 1 : 0, pushed: false, attributeDamage: 0, gearDamage: 0, willpower: 0, quarterDayId: null, requestId: null }, metadata: { attribute: 'wits', isArmor: false, weaponIndex: null, weaponDamage: null } }, repo, principal); afterNarrativeDice(repo, r.id, principal, id, () => 1); return id; };
            return { id: r.id, current, say, roll, principal };
        }
        await t.test('ordinary four-PC chat journey binds sheet dice, per-hex scope, replay and one quarter', async () => { const f = fixture(); const service = new AIService(repo, undefined, f.principal, () => 1), request = { campaignId: f.id, requestId: randomUUID(), kind: 'chat', characterId: f.current().session.characters[0].id, action: 'We travel to U06. Grogahx leads the way and Rose keeps watch.' }; const reply = await service.run(request); assert.match(reply.narration, /Survival/); assert.doesNotMatch(reply.narration, /roll Scouting/); f.roll(0, 'Survival'); assert.equal(f.current().session.campaign.hex, 'U06'); assert.equal(f.current().session.campaign.quarter, 'Day'); const first = f.current().session.dayTracker![0], dice = f.current().session.dice!.length; assert.match(f.say('We continue to V05.'), /Survival/); assert.equal(f.current().session.dice!.length, dice); const nav = f.roll(0, 'Survival'); assert.equal(f.current().session.campaign.hex, 'V05'); assert.equal(f.current().session.campaign.quarter, 'Day'); assert.equal(expeditionFor(f.current().session, first.id).entries.length, 2); assert.deepEqual(f.current().session.dayTracker![0], first); afterNarrativeDice(repo, f.id, f.principal, nav, () => 6); assert.equal(expeditionFor(f.current().session, first.id).entries.length, 2); const key = randomUUID(); assert.match(f.say('Finish the journey.', key), /Evening/); assert.equal(f.say('Finish the journey.', key), f.say('Finish the journey.', key)); assert.equal(f.current().session.campaign.quarter, 'Evening'); assert.equal(f.current().session.journal.filter(j => j.title === 'Day activities completed').length, 1); assert.equal((await service.run(request)).replayed, true); });
        await t.test('actual U06 to V07 terrain is checked, mixed terrain is held', () => { const f = fixture(); assert.match(f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'), /Survival/); f.roll(0, 'Survival'); f.roll(3, 'Scouting'); const result = f.say("We're not pursuing the creature. We continue southeast toward V07."); assert.match(result, /Mixed|terrain|map places/i); assert.equal(f.current().session.campaign.hex, 'U06'); assert.equal(f.current().session.campaign.quarter, 'Day'); assert.equal(map.lookupForCampaign(f.id, 'V07')!.terrain, 'Dark Forest'); });
        await t.test('failure preserves Push choice and requests actual navigation D66, Watch failure is not an ambush', () => { const f = fixture(); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival', false); assert.equal(f.current().session.campaign.hex, 'T05'); assert.match(f.say('Keep the result.'), /D66/); f.roll(3, 'Scouting'); assert.match(f.say('Please continue.'), /D66/); assert.equal(f.current().session.campaign.hex, 'T05'); const state = narrativeState(repo, f.id)!; assert.ok(state.requests.some(r => r.skill === 'D66')); });
        await t.test('authorized GM facts use existing canon provenance; ordinary spoof does not', () => { const f = fixture(); const action = 'The abandoned mill is an old dwarven structure.', actor = f.current().session.characters[0].id, player = { playerId: 'ordinary-player', grants: f.principal.grants }; assert.match(narrativeTurn(repo, f.id, actor, randomUUID(), action, player)!, /assigned Table GM/); assert.equal(new SqliteMemoryRepository(repo).list(f.id).length, 0); assert.match(f.say(action), /established campaign fact/); const m = new SqliteMemoryRepository(repo).list(f.id)[0]; assert.equal(m.status, 'approved'); assert.equal(m.provenance?.origin, 'GM-established'); assert.equal(m.source?.kind, 'chat'); assert.match(f.say("We never entered the mill. We're still on the forest trail."), /Entering the mill was not established/); assert.match(f.say('We cover five forest hexes in one quarter-day.'), /two hexes/); });
        await t.test('one-journey Table GM allowance is scoped and survives reopen', () => {
            const f = fixture();
            f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.');
            assert.match(f.say('For this one journey, the ancient road allows three hexes.'), /three|3-hex/);
            f.roll(0, 'Survival');
            f.roll(3, 'Scouting');
            assert.equal(expeditionFor(f.current().session, f.current().session.dayTracker![0].id).limit, 3);
            const reopened = new SqliteCampaignRepository(file);
            try {
                assert.equal(narrativeState(reopened, f.id)!.review.tableRulingId, narrativeState(repo, f.id)!.review.tableRulingId);
            }
            finally {
                reopened.close();
            }
        });
        await t.test('Belderand legacy Nightwarg abort yields to U06→V07 intent, preserves attack history and asks only new per-hex Survival', async () => {
            const f = fixture(), actor = f.current().session.characters[0].id;
            const cmd = (body: Record<string, unknown>) => executeJourney({ campaignId: f.id, revision: f.current().revision, actionId: randomUUID(), ...body }, repo);
            cmd({ type: 'quarter-chat-request' });
            const lead = f.roll(0, 'Survival'), watch = f.roll(3, 'Scouting'), form = activeChatForm(f.current().session)!;
            cmd({ type: 'quarter-chat-submit', formId: form.id, actorId: actor, draft: { ...form.draft, traveling: true, destination: 'U06', assignments: form.draft.assignments.map((a, i) => ({ ...a, activity: i === 0 ? 'Lead the Way' : i === 3 ? 'Keep Watch' : 'Hike', skill: i === 0 ? 'Survival' : i === 3 ? 'Scouting' : 'No roll', outcome: i === 0 || i === 3 ? 'Success' : '', ...(i === 0 ? { rollId: lead } : i === 3 ? { rollId: watch } : {}) })) } });
            const entryId = f.current().session.dayTracker![0].id;
            cmd({ type: 'quarter-chat-plan-route', entryId, review: { route: ['U06', 'V07'], mode: 'On foot', mounts: [], conditions: 'Existing isolated GM reviewed this exact mixed Forest/Dark Forest route in daylight.', navigationModifier: 0, modifierReason: 'Daylight and actual saved current Wits/Survival.', crossings: [], mixedReview: { allowance: 2, reason: 'Explicit pre-existing scoped human GM mixed-terrain ruling for this original two-hex legacy plan.' } }, confirmed: true });
            const rules = loadCombatRules(repo, f.id), e = createEncounter(f.id, f.current().session, [lookupEnemy(repo, f.id, 'Nightwarg')], 'Near', () => 1, f.current().session.characters.map(c => c.id), verifiedMobilityRules(rules.handbook));
            e.turn = e.combatants.findIndex(c => c.side === 'enemy');
            beginEnemyAttack(e, 'monster', () => 1);
            saveCombat(repo, e);
            const inspect = recoveryInspection(repo, f.id, e.id);
            executeCombatRecovery(repo, { campaignId: f.id, characterId: actor, encounterId: e.id, requestId: randomUUID(), revision: inspect.revision, previewHash: inspect.previewHash, operation: 'abort', scope: 'malformed_state', confirmation: 'ABORT ENCOUNTER', confirmed: true, reason: 'Isolated historical attack range hold administratively stopped with original records preserved.', dispositions: inspect.obligations.map(o => ({ id: o.id, disposition: o.kind === 'pending_action' ? 'terminate_uncertain' : 'defer_uncertainty', evidence: 'Original selected attack remains historical without a fictional defense or outcome.' })) }, f.principal);
            cmd({ type: 'quarter-chat-expedition-review', entryId, kind: 'encounter', result: 'resolved', reason: 'Administrative termination acknowledged; original mechanics and obligations retained.', encounterId: e.id, rollId: null, navigationRollId: null, confirmed: true });
            const p = expeditionFor(f.current().session, entryId);
            cmd({ type: 'quarter-chat-enter-hex', entryId, routeId: p.routeId, step: 0, navigationRollId: lead, adjudication: 'Verified original navigation and resolved administrative encounter permit the first legacy entry.', confirmed: true });
            const before = String(repo.db.prepare('SELECT state_json FROM combat_encounters WHERE id=?').get(e.id)!.state_json), original = f.current().session.dayTracker![0], service = new AIService(repo, undefined, f.principal, () => 1);
            const reply = await service.run({ campaignId: f.id, characterId: actor, requestId: randomUUID(), kind: 'chat', action: "We're not pursuing the creature. We continue southeast toward V07." });
            assert.match(reply.narration, /Survival/);
            assert.doesNotMatch(reply.narration, /Campaign Records|terminated attack|roll Scouting|draw initiative/);
            assert.equal(f.current().session.campaign.hex, 'U06');
            f.roll(0, 'Survival');
            assert.equal(f.current().session.campaign.hex, 'V07');
            assert.equal(f.current().session.campaign.quarter, 'Day');
            assert.deepEqual(f.current().session.dayTracker![0], original);
            assert.equal(String(repo.db.prepare('SELECT state_json FROM combat_encounters WHERE id=?').get(e.id)!.state_json), before);
            assert.equal(f.current().session.dice!.filter(d => d.result.skill === 'Scouting').length, 1);
            assert.match(f.say('Finish the journey.'), /Evening/);
        });
        await t.test('recurring Forest rule, scene exception and scoped mixed-terrain override avoid repeated challenges', () => { const f = fixture(); assert.match(f.say('House rule: Forest travel on foot allows three hexes per quarter-day.'), /recurring house rule/); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival'); assert.equal(expeditionFor(f.current().session, f.current().session.dayTracker![0].id).limit, 3); assert.match(f.say("As Table GM, we are treating this wall as an easy climb. No roll is needed."), /scene ruling/); assert.match(f.say('Grogahx climbs the wall.'), /no roll is required/); const g = fixture(); assert.match(g.say('We travel to U06 then V07. Grogahx leads the way and Rose keeps watch.'), /Mixed/); assert.match(g.say('For this journey, allow two hexes.'), /Survival/); g.roll(0, 'Survival'); assert.equal(g.current().session.campaign.hex, 'U06'); g.roll(0, 'Survival'); assert.equal(g.current().session.campaign.hex, 'V07'); });
        await t.test('printed positive encounter selection is saved once; failed Watch does not manufacture combat or movement', () => { const f = fixture(); let count = 0; assert.match(f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.', randomUUID(), () => [4, 1][count++] ?? 1), /Scouting/); const state = narrativeState(repo, f.id)!; assert.equal(state.encounter!.entryNumber, 1); f.roll(0, 'Survival'); f.roll(3, 'Scouting', false); assert.equal(f.current().session.campaign.hex, 'T05'); assert.match(f.say('Keep the result.'), /up close|close range/); assert.equal(f.current().session.campaign.hex, 'T05'); assert.equal(repo.db.prepare('SELECT COUNT(*) AS n FROM combat_encounters WHERE campaign_id=?').get(f.id)!.n, 0); const draw = repo.db.prepare("SELECT payload_json FROM narrative_events WHERE campaign_id=? AND kind='gm_encounter_draw'").get(f.id)!.payload_json; f.say('Please continue.'); assert.equal(repo.db.prepare("SELECT payload_json FROM narrative_events WHERE campaign_id=? AND kind='gm_encounter_draw'").get(f.id)!.payload_json, draw); });
        await t.test('named mounted travel is source-backed; Pathfinder rank 1 uses its actual signed modifier', async () => {
            const f = fixture(), actor = f.current().session.characters[0].id;
            const reply = await new AIService(repo, undefined, f.principal, () => 1).run({ campaignId: f.id, characterId: actor, requestId: randomUUID(), kind: 'chat', action: 'We travel mounted to U06. Grogahx rides Ash, Edrus rides Birch, Elyanna rides Cedar, Rose rides Elm. Grogahx leads the way and Rose keeps watch.' });
            assert.match(reply.narration, /Survival/);
            f.roll(0, 'Survival');
            assert.equal(expeditionFor(f.current().session, f.current().session.dayTracker![0].id).limit, 3);
            const g = fixture(), record = g.current();
            record.session.characters[0].sheet!.talents = [{ name: 'Pathfinder', rank: '1' }];
            repo.update(g.id, record.revision, record.session);
            assert.match(g.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'), /\(1\)/);
            const request = narrativeState(repo, g.id)!.requests[0];
            assert.equal(request.modifier, 1);
            assert.throws(() => g.roll(0, 'Survival'), /modifier/);
            assert.equal(g.current().session.dice?.length ?? 0, 0);
            const rollId = randomUUID();
            executeDice({ type: 'create', campaignId: g.id, actionId: randomUUID(), roll: { id: rollId, characterId: g.current().session.characters[0].id, skill: 'Survival', attribute: [6, 2, 3], skillDice: [2], negativeSkill: false, gear: [], artifacts: [], successes: 1, pushed: false, attributeDamage: 0, gearDamage: 0, willpower: 0, quarterDayId: null, requestId: null }, metadata: { attribute: 'wits', isArmor: false, weaponIndex: null, weaponDamage: null } }, repo, g.principal);
            afterNarrativeDice(repo, g.id, g.principal, rollId, () => 1);
            assert.equal(g.current().session.campaign.hex, 'U06');
        });
        await t.test('a surviving one-hex legacy plan requires an explicit scoped extension before another entry', () => { const f = fixture(); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival'); repo.db.prepare('DELETE FROM narrative_journeys WHERE campaign_id=?').run(f.id); assert.match(f.say('We continue to V05.'), /original submitted route ended/); assert.equal(f.current().session.campaign.hex, 'U06'); assert.match(f.say('For this journey, allow two hexes.'), /2-hex/); assert.match(f.say('We continue to V05.'), /Survival/); f.roll(0, 'Survival'); assert.equal(f.current().session.campaign.hex, 'V05'); assert.equal(f.current().session.campaign.quarter, 'Day'); });
        await t.test('saved Fog mishap applies printed Empathy and movement limit once without invented generic lost result', () => { const f = fixture(); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival', false); f.say('Keep the result.'); const rollId = randomUUID(), characterId = f.current().session.characters[0].id; executeDice({ type: 'create', campaignId: f.id, actionId: randomUUID(), roll: { id: rollId, characterId, skill: 'D66', attribute: [], skillDice: [], negativeSkill: false, gear: [], artifacts: [], successes: 0, pushed: false, attributeDamage: 0, gearDamage: 0, willpower: 0, quarterDayId: null, requestId: null }, metadata: { attribute: null, isArmor: false, weaponIndex: null, weaponDamage: null, utility: { kind: 'D66', faces: [4, 6] } } }, repo, f.principal); afterNarrativeDice(repo, f.id, f.principal, rollId, () => 1); assert.equal(f.current().session.campaign.hex, 'U06'); assert.equal(f.current().session.campaign.quarter, 'Day'); assert.ok(f.current().session.characters.every(c => c.sheet!['attr-empathy'] === '2')); afterNarrativeDice(repo, f.id, f.principal, rollId, () => 1); assert.ok(f.current().session.characters.every(c => c.sheet!['attr-empathy'] === '2')); assert.equal(f.current().session.journal.filter(j => j.title === 'Navigation mishap D66 46').length, 1); });
        await t.test('missing journey roles are answered in a short follow-up without redeclaring the route', () => { const f = fixture(); assert.match(f.say('We travel to U06.'), /Who will Lead/); assert.equal(narrativeState(repo, f.id)!.requests.length, 0); assert.match(f.say('Grogahx leads the way and Rose keeps watch.'), /Survival/); f.roll(0, 'Survival'); assert.equal(f.current().session.campaign.hex, 'U06'); });
        await t.test('a verified visited-hex return requests no new navigation or unnecessary Watch roll', () => { const f = fixture(); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival'); f.say('Finish the journey.'); const count = f.current().session.dice!.length; assert.match(f.say('In daylight, we travel to T05. Grogahx leads the way and Rose keeps watch.'), /reach T05/); assert.equal(f.current().session.campaign.hex, 'T05'); assert.equal(f.current().session.campaign.quarter, 'Evening'); assert.equal(f.current().session.dice!.length, count); const entry = f.current().session.dayTracker!.at(-1)!; assert.equal(expeditionFor(f.current().session, entry.id).entries[0].visitedException, true); assert.equal(entry.assignments.find(a => a.activity === 'Lead the Way')!.outcome, ''); });
        await t.test('stopping cannot discard an unresolved saved navigation failure', () => { const f = fixture(); f.say('We travel to U06. Grogahx leads the way and Rose keeps watch.'); f.roll(0, 'Survival'); f.say('We continue to V05.'); f.roll(0, 'Survival', false); assert.match(f.say('Stop the journey here.'), /failed navigation/); assert.equal(f.current().session.campaign.hex, 'U06'); assert.equal(f.current().session.campaign.quarter, 'Day'); });
    }
    finally {
        repo.close();
        rmSync(dir, { recursive: true, force: true });
    }
}
