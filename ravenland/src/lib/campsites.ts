import { z } from 'zod';
import type { Session } from './types';
const id = z.string().min(1).max(100), text = z.string().max(5000), quarter = z.enum(['Morning', 'Day', 'Evening', 'Night']);
export const campsiteSchema = z.object({ id: z.string().uuid(), campaignId: z.string().uuid(), partyId: z.literal('current-party'), hex: z.string(), locationKey: z.string(), locationName: z.string(), establishedDate: z.string(), establishedQuarter: quarter, establishedBy: id, entryId: id, assignmentId: id, rollId: z.string().uuid().nullable(), establishment: z.enum(['verified', 'failed_procedure', 'historical_ruling']), availability: z.enum(['active', 'compromised', 'inactive']), shelter: z.enum(['sheltered', 'less_pleasant', 'unusable']), effects: z.array(text).max(30), sources: z.array(text).max(30), revision: z.number().int().positive(), invalidatedReason: text.nullable(), provenance: z.object({ kind: z.enum(['activity', 'verified_reconciliation', 'gm_historical_ruling']), receiptId: id, recordedAt: z.string().datetime(), reason: text }).strict(), audit: z.array(z.object({ eventId: id, kind: text, date: z.string(), quarter, reason: text }).strict()).max(1000) }).strict();
export type Campsite = z.infer<typeof campsiteSchema>;
export function siteKey(s: Session) { const c = s.campaign, known = s.locations?.find(l => l.hex === c.hex && l.name === c.location); return known ? 'location:' + known.id : c.hex + '::' + c.location.trim().toLowerCase(); }
export function occupiedCamp(s: Session) { return s.campsites?.find(c => c.availability !== 'inactive' && c.hex === s.campaign.hex && c.locationKey === siteKey(s)) ?? null; }
export function usableCamp(s: Session) { const camp = occupiedCamp(s); return camp?.availability === 'active' && camp.shelter !== 'unusable' && !camp.effects.includes('no_sleep') ? camp : null; }
export function departCamps(previous: Session, next: Session, eventId: string) { if (previous.campaign.hex === next.campaign.hex && siteKey(previous) === siteKey(next))
    return; for (const camp of next.campsites ?? []) {
    if (camp.availability === 'inactive')
        continue;
    camp.availability = 'inactive';
    camp.invalidatedReason = 'The party left this campsite.';
    camp.revision++;
    camp.audit.push({ eventId, kind: 'departure', date: next.campaign.date, quarter: next.campaign.quarter, reason: camp.invalidatedReason });
} }
