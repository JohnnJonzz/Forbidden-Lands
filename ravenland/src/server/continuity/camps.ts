import { createHash } from 'node:crypto';
import { occupiedCamp, siteKey, usableCamp, type Campsite } from '../../lib/campsites';
import type { Session } from '../../lib/types';
import type { RoutineActivity } from '../../lib/activities';
import type { SqliteCampaignRepository } from '../sqlite';
import { combatPages, citation } from '../combat/sources';
import { currentRoutine } from '../../lib/activities';
export const stableId = (value: string) => { const h = createHash('sha256').update(value).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32); };
export function campRules(repo: SqliteCampaignRepository, id: string) { const pages = combatPages(repo, id, 'handbook').map(p => ({ ...p, text: p.text.replace(/-\s+/g, '').replace(/\s+/g, ' ') })), camp = pages.find(p => /Only one person rolls to MAK\s*E CAMP/i.test(p.text)), sleep = pages.find(p => /SLEEP also counts as REST/i.test(p.text) && /BARE GROUND/i.test(p.text)); if (!camp || !sleep)
    throw Error('Restore the original Handbook Make Camp and Sleep evidence before establishing shelter.'); return [camp, sleep].map(p => { const c = citation(p); return c.chunkId + ' · ' + c.title + ' · physical page ' + c.page; }); }
export function createCamp(s: Session, id: string, details: {
    entryId: string;
    assignmentId: string;
    characterId: string;
    rollId: string | null;
    date: string;
    quarter: Session['campaign']['quarter'];
    sources: string[];
    kind: Campsite['provenance']['kind'];
    reason: string;
    receiptId: string;
    verified: boolean;
    failed?: boolean;
}) {
    s.campsites ??= [];
    const prior = s.campsites.find(c => c.assignmentId === details.assignmentId);
    if (prior) {
        if (prior.availability === 'inactive')
            throw Error('This campsite was abandoned or invalidated. Returning to its hex does not reestablish it. Make or explicitly establish a new camp.');
        return prior;
    }
    for (const old of s.campsites.filter(c => c.availability !== 'inactive')) {
        old.availability = 'inactive';
        old.invalidatedReason = 'Superseded by a separately established campsite.';
        old.revision++;
        old.audit.push({ eventId: details.receiptId, kind: 'superseded', date: s.campaign.date, quarter: s.campaign.quarter, reason: old.invalidatedReason });
    }
    const camp: Campsite = { id: stableId(id + ':camp:' + details.assignmentId), campaignId: id, partyId: 'current-party', hex: s.campaign.hex, locationKey: siteKey(s), locationName: s.campaign.location, establishedDate: details.date, establishedQuarter: details.quarter, establishedBy: details.characterId, entryId: details.entryId, assignmentId: details.assignmentId, rollId: details.rollId, establishment: details.failed ? 'failed_procedure' : details.verified ? 'verified' : 'historical_ruling', availability: details.failed ? 'compromised' : 'active', shelter: details.failed ? 'less_pleasant' : 'sheltered', effects: details.failed ? ['Camp complication requires review.'] : [], sources: details.sources, revision: 1, invalidatedReason: null, provenance: { kind: details.kind, receiptId: details.receiptId, recordedAt: new Date().toISOString(), reason: details.reason }, audit: [{ eventId: details.receiptId, kind: details.kind, date: s.campaign.date, quarter: s.campaign.quarter, reason: details.reason }] };
    s.campsites.push(camp);
    const journalId = 'camp:' + camp.id;
    if (!s.journal.some(j => j.id === journalId))
        s.journal.push({ id: journalId, title: details.failed ? 'Campsite requires review' : 'Campsite established', text: s.campaign.hex + ' · ' + s.campaign.location + ' · established by ' + (s.characters.find(c => c.id === details.characterId)?.name ?? details.characterId) + ' · ' + details.date + ' ' + details.quarter + '\n' + details.reason });
    return camp;
}
export function projectCamp(repo: SqliteCampaignRepository, id: string, s: Session, entryId: string, a: RoutineActivity, rollId: string) { const entry = s.activityState!.entries.find(e => e.entryId === entryId)!; const camp = createCamp(s, id, { entryId, assignmentId: a.assignmentId, characterId: a.characterId, rollId, date: entry.date, quarter: entry.quarter, sources: campRules(repo, id), kind: 'activity', reason: a.summary, receiptId: rollId, verified: true, failed: a.status !== 'Resolved' || a.choice !== 'sheltered' }); refreshSleep(s); return camp; }
export function refreshSleep(s: Session) { const entry = currentRoutine(s); if (!entry)
    return; const camp = occupiedCamp(s), usable = usableCamp(s); for (const a of entry.activities.filter(a => a.activity === 'Sleep' && !a.interrupted)) {
    if (a.rollIds.length || a.request?.rollId)
        continue;
    if (usable) {
        a.request = null;
        a.stage = 'using-camp';
        a.status = 'Resolved';
        a.summary = 'Sleeping at the established campsite in ' + camp!.hex + '. No separate bare-ground sleeping-spot check is required. Cold and other recorded conditions still apply.';
    }
    else if (camp) {
        a.request = null;
        a.stage = 'camp-review';
        a.status = 'Needs GM ruling';
        a.summary = 'The shared campsite is compromised; resolve its recorded shelter issue before Sleep.';
    }
} }
export function syncCampResult(repo: SqliteCampaignRepository, id: string, s: Session, a: RoutineActivity) {
    const camp = s.campsites?.find(c => c.assignmentId === a.assignmentId && c.availability !== 'inactive');
    if (!camp)
        return;
    const privateRow = repo.db.prepare('SELECT state_json FROM activity_private WHERE campaign_id=? AND assignment_id=?').get(id, a.assignmentId), hidden = privateRow ? JSON.parse(String(privateRow.state_json)) : null;
    if (hidden && !hidden.applied) {
        camp.availability = 'compromised';
        camp.effects = ['Camp complication requires review.'];
        return;
    }
    const noSleep = a.choice === 'no-sleep' || !!hidden && hidden.mishap >= 21 && hidden.mishap <= 32 || !!hidden && hidden.mishap >= 43 && hidden.mishap <= 45;
    camp.effects = noSleep ? ['no_sleep'] : a.status === 'Resolved' ? [] : ['Camp follow-up requires review.'];
    camp.availability = noSleep || a.status !== 'Resolved' ? 'compromised' : 'active';
    camp.shelter = noSleep ? 'unusable' : camp.establishment === 'failed_procedure' ? 'less_pleasant' : 'sheltered';
    camp.revision++;
    camp.audit.push({ eventId: a.rollIds.at(-1) ?? a.assignmentId, kind: 'procedure_review', date: s.campaign.date, quarter: s.campaign.quarter, reason: a.summary });
    refreshSleep(s);
}
