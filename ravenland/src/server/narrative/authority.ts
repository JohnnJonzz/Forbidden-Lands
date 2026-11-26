import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { requireCharacterAccess } from '../character-access';
import { AIError } from '../ai/config';
import { createHash } from 'node:crypto';
export const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function tableGM(repo: SqliteCampaignRepository, id: string, principal: CharacterPrincipal | null) {
    const row = repo.db.prepare('SELECT player_id,revision FROM table_gm_settings WHERE campaign_id=?').get(id);
    // A trusted local request is a server-established controller identity, independent of selected PC.
    return { playerId: row ? String(row.player_id) : 'trusted-local', revision: row ? Number(row.revision) : 0, assigned: !!row, isTableGM: !!principal && (row ? row.player_id === principal.playerId : principal.mode === 'trusted-local' && principal.playerId === 'trusted-local'), canAssign: principal?.mode === 'trusted-local' };
}
export function assignTableGM(repo: SqliteCampaignRepository, id: string, actor: string, principal: CharacterPrincipal | null, playerId: string, revision: number, requestId: string) {
    requireCharacterAccess(principal, id, actor);
    if (principal?.mode !== 'trusted-local')
        throw new AIError('table_gm_controller', 'Only the trusted local controller can assign the Table GM.', 403);
    if (!/^[\w:@.-]{1,100}$/.test(playerId))
        throw new AIError('table_gm_identity', 'Enter a configured player identity, rather than a character display name.');
    const db = repo.db, fingerprint = digest({ playerId, revision });
    db.exec('BEGIN IMMEDIATE');
    try {
        const prior = db.prepare('SELECT * FROM narrative_receipts WHERE campaign_id=? AND request_id=?').get(id, requestId);
        if (prior) {
            if (prior.fingerprint !== fingerprint || prior.actor_id !== principal.playerId)
                throw new AIError('duplicate', 'This assignment request was already used.', 409);
            db.exec('COMMIT');
            return JSON.parse(String(prior.result_json));
        }
        if (tableGM(repo, id, principal).revision !== revision)
            throw new AIError('conflict', 'The Table GM assignment changed. Refresh it first.', 409);
        db.prepare('INSERT INTO table_gm_settings VALUES (?,?,?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET player_id=excluded.player_id,revision=excluded.revision,assigned_by=excluded.assigned_by,updated_at=excluded.updated_at').run(id, playerId, revision + 1, principal.playerId, new Date().toISOString());
        const result = tableGM(repo, id, principal);
        db.prepare('INSERT INTO narrative_receipts VALUES (?,?,?,?,?)').run(id, requestId, principal.playerId, fingerprint, JSON.stringify(result));
        db.exec('COMMIT');
        return result;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
