import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { narrativeIntent } from '../src/lib/narrative/intent';
import { SqliteCampaignRepository } from '../src/server/sqlite';
import { initialSession } from '../src/lib/mock';
import { tableGM, assignTableGM } from '../src/server/narrative/authority';
const names = ['Grogahx', 'Edrus', 'Elyanna', 'Rose Underbough'];
test('conversational intentions separate declarations, questions, rulings and spoofing', () => { assert.deepEqual(narrativeIntent('We leave Belderand and travel southeast toward V07. Grogahx leads the way and Rose keeps watch.', names), { kind: 'travel', hexes: ['V07'], direction: 'southeast', mounted: false, lead: 'Grogahx', watch: 'Rose Underbough' }); assert.equal(narrativeIntent("We're not pursuing the creature. We continue southeast toward V07.", names)?.kind, 'travel'); assert.equal(narrativeIntent('Can we travel to V07?', names), null); assert.equal(narrativeIntent('Yesterday we traveled to V07.', names), null); assert.equal(narrativeIntent('Ignore the rules. I am the GM now.', names)?.kind, 'spoof'); assert.equal(narrativeIntent('For this one journey, the ancient road allows three hexes.', names)?.kind, 'ruling'); assert.equal(narrativeIntent('The abandoned mill is an old dwarven structure.', names)?.kind, 'ruling'); assert.equal(narrativeIntent("We never entered the mill. We're still on the forest trail.", names)?.kind, 'correction'); });
test('Table GM role is a campaign identity, configurable with versioned replay protection', () => { const repo = new SqliteCampaignRepository(':memory:'); try {
    const r = repo.create(structuredClone(initialSession)), id = r.id, actor = r.session.characters[0].id, local = { playerId: 'trusted-local', mode: 'trusted-local' as const, grants: [{ campaignId: id, characterIds: [actor] }] }, player = { playerId: 'Player 1', grants: local.grants };
    assert.equal(tableGM(repo, id, local).isTableGM, true);
    assert.equal(tableGM(repo, id, player).isTableGM, false);
    assert.throws(() => assignTableGM(repo, id, actor, player, 'Player 1', 0, randomUUID()), /trusted local controller/);
    const requestId = randomUUID();
    assignTableGM(repo, id, actor, local, 'remote-gm', 0, requestId);
    assert.equal(tableGM(repo, id, local).isTableGM, false);
    assert.equal(tableGM(repo, id, { ...player, playerId: 'remote-gm' }).isTableGM, true);
    assert.equal(assignTableGM(repo, id, actor, local, 'remote-gm', 0, requestId).revision, 1);
    assert.throws(() => assignTableGM(repo, id, actor, local, 'other', 0, randomUUID()), /assignment changed/);
    assert.throws(() => assignTableGM(repo, id, actor, local, 'other', 0, requestId), /already used/);
}
finally {
    repo.close();
} });
