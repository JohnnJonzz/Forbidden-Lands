import {readFlow} from '../quarter-resolution/store';
import {checkFor} from '../quarter-resolution/director';
import { dailyBlockers } from '../activities/state';
import { randomUUID } from 'node:crypto';
import type { Session } from '../../lib/types';
import type { SqliteCampaignRepository } from '../sqlite';
import type { Calendar, WeatherResult } from '../../lib/environment';
import { occupiedCamp } from '../../lib/campsites';
import { displayDate,dateKey } from '../../lib/calendar';
import { expeditionFor } from '../../lib/journey/expedition';
import { establishWeather, environment, stable, currentWeather } from './weather';
import { estimatedCost, serverAIConfig } from '../ai/config';
import { OpenAIProvider } from '../ai/provider';
export interface Transition {
    assisted?: boolean;
    id: string;
    campaignId: string;
    entryId: string;
    completionReceipt: string;
    at: string;
    previous: Session['campaign'];
    current: Session['campaign'];
    activities: {
        characterId: string;
        name: string;
        activity: string;
        summary: string;
        status: string;
        interrupted: boolean;
        rollIds: string[];
    }[];
    recoveries: {
        characterId: string;
        attribute: string;
        before: unknown;
        after: unknown;
    }[];
    conditions: {
        characterId: string;
        flags: string[];
    }[];
    resources: {
        characterId: string;
        resource: string;
        before: unknown;
        after: unknown;
    }[];
    needs: unknown[];
    encounters: {
        id: string;
        status: string;
        outcome: string | null;
    }[];
    encounterProcedure: string;
    camp: ReturnType<typeof occupiedCamp>;
    weather: WeatherResult | null;
    weatherReview: string;
    obligations: string[];
    narration: {
        status: 'fallback' | 'pending_weather' | 'running' | 'generated' | 'superseded';
        attempt: number;
        lease: string | null;
        leaseAt: number;
        error: string | null;
        provider: 'application' | 'openai';
        model: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
    };
}
export function transitions(repo: SqliteCampaignRepository, id: string) { return repo.db.prepare('SELECT state_json FROM quarter_transitions WHERE campaign_id=? ORDER BY rowid DESC LIMIT 50').all(id).map(r => JSON.parse(String(r.state_json)) as Transition); }
export function persistTransition(repo: SqliteCampaignRepository, t: Transition) { repo.db.prepare('INSERT INTO quarter_transitions VALUES (?,?,?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET state_json=excluded.state_json').run(t.campaignId, t.id, t.entryId, t.completionReceipt, JSON.stringify(t)); }
export function sceneOptions(t: Transition) { const forest = /forest|wood/i.test(t.current.terrain); return forest ? ['The trees stand close around you; the wider forest remains beyond your sight.', 'Beyond the party’s position, the forest keeps its own counsel.', 'The shapes of the surrounding trees frame the next stretch of your journey.'] : ['The land around you waits beneath the changing sky.', 'The outlines of your surroundings anchor the new scene.', 'The horizon offers no answers of its own.']; }
export function transitionText(t: Transition, flavor = 0, calendar?: Calendar | null) { const morning = t.current.quarter === 'Morning', date = displayDate(t.current.date, calendar), intro = morning ? 'The Night ends. Morning begins on ' + date + '.' : t.previous.quarter + ' gives way to ' + t.current.quarter + ' on ' + date + '.', activities = t.activities.map(a => a.name + ' ' + (a.interrupted ? a.activity + ' was interrupted.' : a.summary.charAt(0).toLowerCase() + a.summary.slice(1))).join(' '), weather = t.weather ? 'Weather: ' + t.weather.description + '.' + (t.weather.provenance === 'legacy_manual' ? ' This is the carried-forward manual result; its individual wind, temperature and precipitation were not recorded.' : '') : 'Weather awaits Table GM review: ' + t.weatherReview, camp = t.camp ? (t.camp.availability === 'active' ? 'The established campsite remains available.' : 'The shared campsite still needs shelter review.') : 'No occupied campsite is recorded.', encounter = t.encounterProcedure==='declined_contact'?'The distant procession passed without contact. No combat or pursuit escape was established.':t.encounterProcedure === 'waived_for_testing'?'This encounter check was waived by a Table GM testing override. No encounter result was rolled.':t.encounterProcedure==='skipped_for_testing'?'Skipped — Table GM Testing Override. Original encounter and dice remain saved; no victory or rewards were applied.':t.encounterProcedure==='scene_resolved'?'The actual encounter scene was reviewed as resolved.':t.encounterProcedure === 'verified_none' ? 'The recorded encounter procedure established no encounter.' : t.encounters.length ? t.encounters.map(e => 'Encounter ' + e.id + ': ' + e.status + (e.outcome ? '; ' + e.outcome : '') + '.').join(' ') : 'No encounter procedure is recorded for this quarter; the watch does not by itself establish safety.'; return [intro, activities, weather + ' ' + camp + ' The party remains at ' + t.current.location + ' (' + t.current.hex + ').', encounter, sceneOptions(t)[flavor], t.obligations.length ? 'Review required: ' + t.obligations.join('; ') : t.assisted?'Assign the party’s next quarter-day activities when ready.':'What will you do next? Choose your next activity in Quarter-Day Activities; no activity or destination has been selected for you.'].filter(Boolean).join('\n\n'); }
export function replaceScene(s: Session, t: Transition, flavor = 0) { const id = 'transition:' + t.id, message = { id, role: 'gm' as const, author: t.narration.provider === 'openai' ? 'Game Master' : 'Quarter Transition', provider: t.narration.provider, text: transitionText(t, flavor, s.environment?.calendar) }; const found = s.messages.findIndex(m => m.id === id); if (found >= 0)
    s.messages[found] = message;
else
    s.messages.push(message); }
export function appendTransition(repo: SqliteCampaignRepository, id: string, before: Session, s: Session, entryId: string, receipt: string, die?: (n: number) => number) {
    const existing = repo.db.prepare('SELECT state_json FROM quarter_transitions WHERE campaign_id=? AND entry_id=?').get(id, entryId);
    if (existing)
        return JSON.parse(String(existing.state_json)) as Transition;
    const entry = s.dayTracker!.find(e => e.id === entryId)!, native = s.activityState?.entries.find(e => e.entryId === entryId), eventId = stable(id + ':' + receipt);
    let weather: WeatherResult | null = null;
    try {
        weather = establishWeather(s, eventId, die);
    }
    catch {
        const e = environment(s);
        e.weatherStatus = 'pending';
        s.campaign.weather = 'Weather pending review';
        e.review = 'Weather generation failed; the completed quarter remains valid. Retry this saved transition’s weather procedure.';
    }
    const camp = occupiedCamp(s), sameSite = camp && camp.hex === s.campaign.hex ? camp : null, encounters = repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=?').all(id).map(r => JSON.parse(String(r.state_json))).filter(e => e.startedAt >= entry.submittedAt && e.sceneHex === s.campaign.hex).map(e => ({ id: e.id, status: e.administrativeAbort ? 'administratively_aborted' : e.status, outcome: e.administrativeAbort ? 'No fictional victory or defeat was established.' : e.outcome?.kind ?? null })), p = expeditionFor(s, entryId), recoveries: Transition['recoveries'] = [], resources: Transition['resources'] = [];
    for (const ch of s.characters) {
        const old = before.characters.find(c => c.id === ch.id);
        for (const a of ['strength', 'agility', 'wits', 'empathy'] as const) {
            const key = `attr-${a}` as const;
            if (old?.sheet?.[key] !== ch.sheet?.[key])
                recoveries.push({ characterId: ch.id, attribute: a, before: old?.sheet?.[key], after: ch.sheet?.[key] });
        }
        for (const key of ['res-food', 'res-water', 'res-arrows', 'res-torches'] as const)
            if (old?.sheet?.[key] !== ch.sheet?.[key])
                resources.push({ characterId: ch.id, resource: key, before: old?.sheet?.[key], after: ch.sheet?.[key] });
    }
    const director=checkFor(repo,id,before,entryId);
    const t: Transition = { assisted:!!readFlow(repo,id,entryId),id: eventId, campaignId: id, entryId, completionReceipt: receipt, at: new Date().toISOString(), previous: structuredClone(before.campaign), current: structuredClone(s.campaign), activities: entry.assignments.map(a => { const actual = native?.activities.find(x => x.assignmentId === a.id); return { characterId: a.characterId, name: a.characterName, activity: a.activity, summary: actual?.interrupted ? 'The assigned ' + a.activity + ' was interrupted.' : actual && a.activity === 'Sleep' ? actual.choice === 'no-sleep' ? 'Sleep did not occur at this campsite.' : 'Slept through the completed ' + entry.quarter + ' quarter.' : actual && a.activity === 'Keep Watch' ? 'Kept watch during ' + entry.quarter + '.' : actual?.summary ?? (a.outcome ? 'Recorded ' + a.outcome : 'Completed assignment; individual recovery is not inferred.'), status: actual?.status ?? a.outcome, interrupted: actual?.interrupted ?? false, rollIds: actual?.rollIds ?? (a.rollId ? [a.rollId] : []) }; }), recoveries, resources, conditions: s.characters.map(ch => ({ characterId: ch.id, flags: Object.entries(ch.sheet ?? {}).filter(([k, v]) => k.startsWith('cond-') && v === true).map(([k]) => k) })), needs: structuredClone(s.activityState?.needs.filter(n => n.date === before.campaign.date) ?? []), encounters, encounterProcedure: director?.resolutionKind==='declined_contact'?'declined_contact':director?.status==='waived'?'waived_for_testing':director?.status==='skipped'?'skipped_for_testing':director?.status==='resolved'?'scene_resolved':director?.status==='none'?'verified_none':p.encounter?.result === 'none' ? 'verified_none' : encounters.length ? 'recorded_encounter' : 'not_recorded', camp: sameSite ? structuredClone(sameSite) : null, weather, weatherReview: environment(s).review, obligations: [...(weather ? [] : [environment(s).review]), ...dailyBlockers(s)], narration: { status: weather ? 'fallback' : 'pending_weather', attempt: 0, lease: null, leaseAt: 0, error: null, provider: 'application', model: null, inputTokens: null, outputTokens: null } };
    persistTransition(repo, t);
    replaceScene(s, t);
    return t;
}
export function refreshTransitionWeather(repo: SqliteCampaignRepository, id: string, s: Session, force = false) { const t = transitions(repo, id).find(t => dateKey(t.current.date,s.environment?.calendar)===dateKey(s.campaign.date,s.environment?.calendar) && t.current.quarter === s.campaign.quarter && t.current.hex === s.campaign.hex && t.current.location === s.campaign.location); if (!t)
    return; const weather = currentWeather(s); if (!weather) {
    if (force)
        replaceScene(s, t);
    return;
} if (!force && t.weather?.id === weather.id && t.narration.status !== 'pending_weather')
    return; t.weather = weather; t.current.weather = s.campaign.weather; t.weatherReview = ''; t.obligations = dailyBlockers(s); t.narration = { ...t.narration, status: 'fallback', attempt: 0, lease: null, leaseAt: 0, error: null, provider: 'application' }; persistTransition(repo, t); replaceScene(s, t); }
export async function deliverTransition(repo: SqliteCampaignRepository, id: string, chooser?: ((input: {
    event: Transition;
    options: string[];
}) => Promise<{
    choice: number;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
}>), retry = false) { if (repo.db.isTransaction)
    return; repo.db.exec('BEGIN IMMEDIATE'); const t = transitions(repo, id)[0]; if (!t || t.narration.status === 'pending_weather' || t.narration.status === 'generated' || t.narration.status === 'superseded' || t.narration.status === 'running' && Date.now() - t.narration.leaseAt < 30000 || t.narration.attempt && !retry && t.narration.status === 'fallback' || !chooser && serverAIConfig().provider !== 'openai') {
    repo.db.exec('COMMIT');
    return;
} const lease = randomUUID(); t.narration = { ...t.narration, status: 'running', attempt: t.narration.attempt + 1, lease, leaseAt: Date.now() }; persistTransition(repo, t); repo.db.exec('COMMIT'); try {
    const response = await (chooser ?? (input => new OpenAIProvider().narrateTransition(input)))({ event: t, options: sceneOptions(t) });
    repo.db.prepare('INSERT OR IGNORE INTO ai_usage VALUES (?,?,?,?,?,?,?,?,?,?)').run(lease, id, t.completionReceipt, 'openai', response.model, response.inputTokens, response.outputTokens, estimatedCost(response.inputTokens, response.outputTokens), null, new Date().toISOString());
    if (!Number.isInteger(response.choice) || response.choice < 0 || response.choice > 2)
        throw Error('Invalid bounded transition narration.');
    repo.db.exec('BEGIN IMMEDIATE');
    try {
        const latest = transitions(repo, id).find(e => e.id === t.id)!, r = repo.get(id)!;
        if (latest.narration.lease !== lease) {
            repo.db.exec('COMMIT');
            return;
        }
        if (dateKey(r.session.campaign.date,r.session.environment?.calendar)!==dateKey(t.current.date,r.session.environment?.calendar) || r.session.campaign.location !== t.current.location || r.session.campaign.quarter !== t.current.quarter || r.session.campaign.hex !== t.current.hex || currentWeather(r.session)?.id !== t.weather?.id) {
            latest.narration.status = 'superseded';
            persistTransition(repo, latest);
            repo.db.exec('COMMIT');
            return;
        }
        latest.narration = { ...latest.narration, status: 'generated', lease: null, provider: 'openai', model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
        replaceScene(r.session, latest, response.choice);
        persistTransition(repo, latest);
        repo.update(id, r.revision, r.session);
        repo.db.exec('COMMIT');
    }
    catch (e) {
        repo.db.exec('ROLLBACK');
        throw e;
    }
}
catch {
    const latest = transitions(repo, id).find(e => e.id === t.id);
    if (latest?.narration.lease === lease) {
        latest.narration.status = 'fallback';
        latest.narration.lease = null;
        latest.narration.error = 'Model narration unavailable. The saved deterministic scene and all completed mechanics remain valid.';
        persistTransition(repo, latest);
    }
} }
