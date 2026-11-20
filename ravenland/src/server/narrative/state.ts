import { z } from 'zod';
import type { SqliteCampaignRepository } from '../sqlite';
import { routeReviewSchema } from '../../lib/journey/expedition';
const request = z.object({ id: z.string().uuid(), characterId: z.string(), skill: z.enum(['Survival', 'Scouting', 'D66']), activity: z.string(), scope: z.string(), modifier: z.number().int(), rollId: z.string().uuid().nullable(), kept: z.boolean() }).strict();
export const narrativeStateSchema = z.object({ id: z.string().uuid(), actorId: z.string(), controllerId: z.string(), date: z.string(), quarter: z.string(), formId: z.string(), entryId: z.string().nullable(), review: routeReviewSchema, leaderId: z.string(), watchId: z.string(), requests: z.array(request), sourceIds: z.array(z.string()), encounter: z.object({ entryNumber: z.number().int().min(0).max(43).optional(), sourceId: z.string().optional(), faces: z.tuple([z.number(), z.number()]), hex: z.string(), terrain: z.string(), resolved: z.boolean() }).nullable(), pendingRuling:z.object({text:z.string(),targetHex:z.string().nullable(),allowance:z.number().int().min(1).max(3)}).optional(), awaitingReview: z.boolean().default(false), legacyExtensionRequired: z.boolean().default(false), done: z.boolean() }).strict();
export type NarrativeJourney = z.infer<typeof narrativeStateSchema>;
export function narrativeState(repo: SqliteCampaignRepository, id: string) { const row = repo.db.prepare('SELECT state_json FROM narrative_journeys WHERE campaign_id=?').get(id); return row ? narrativeStateSchema.parse(JSON.parse(String(row.state_json))) : null; }
export function saveNarrative(repo: SqliteCampaignRepository, id: string, state: NarrativeJourney) { repo.db.prepare('INSERT INTO narrative_journeys VALUES (?,?) ON CONFLICT(campaign_id) DO UPDATE SET state_json=excluded.state_json').run(id, JSON.stringify(narrativeStateSchema.parse(state))); }
export function narrativeEvent(repo: SqliteCampaignRepository, id: string, eventId: string, journeyId: string, kind: string, actorId: string, payload: unknown) {
    const body = JSON.stringify(payload), prior = repo.db.prepare('SELECT payload_json FROM narrative_events WHERE campaign_id=? AND id=?').get(id, eventId);
    if (prior) {
        if (prior.payload_json !== body)
            throw new Error('Narrative event identity was reused with different evidence.');
        return;
    }
    repo.db.prepare('INSERT INTO narrative_events VALUES (?,?,?,?,?,?,?)').run(id, eventId, journeyId, kind, actorId, body, new Date().toISOString());
}
