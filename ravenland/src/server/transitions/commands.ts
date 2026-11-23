import { quarterFor } from '../../lib/journey/quarter-engine';
import { phaseSchema, inFlower, resetOverrides } from '../../lib/weather-hex';
import { WEATHER_SOURCE_SHA256 } from '../../lib/weather-hex-data';
import { displayDate, fantasyDayDistance } from '../../lib/calendar';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SqliteCampaignRepository } from '../sqlite';
import { requireCharacterAccess, type CharacterPrincipal } from '../character-access';
import { tableGM } from '../narrative/authority';
import { calendarSchema } from '../../lib/environment';
import { activeChatForm, completionFor } from '../../lib/journey/chat-engine';
import { manualWeather, establishWeather, environment, realizeWeather } from './weather';
import { appendTransition, refreshTransitionWeather } from './service';
import { makeRuling } from '../rulings/store';
export const environmentCommand = z.object({ campaignId: z.string().uuid(), revision: z.number().int().positive(), requestId: z.string().uuid(), actorId: z.string(), operation: z.enum(['activate-hex-flower', 'adjust-hex-flower', 'manual-weather', 'retry-weather', 'retry-narration', 'configure-calendar', 'correct-date', 'review-transition']), phase: phaseSchema.optional(), temperatureMode: z.enum(['seasonal', 'book']).optional(), temperatureOverride: z.enum(['Hot', 'Pleasant', 'Cool', 'auto']).optional(), windOverride: z.enum(['n', 'b', 'g', 's', 'auto']).optional(), x: z.number().int().optional(), y: z.number().int().optional(), rerollWild: z.boolean().optional(), approveReplacement: z.boolean().optional(), approveModifiers: z.boolean().optional(), reviewBookTemperature: z.boolean().optional(), authorizeDailyAdvancement: z.boolean().optional(), calendar: calendarSchema.optional(), date: z.string().min(1).max(100).optional(), description: z.string().min(1).max(300).optional(), wind: z.string().max(100).optional(), precipitation: z.string().max(100).optional(), temperature: z.string().max(100).optional(), cadence: z.enum(['persistent', 'daily', 'quarter']).optional(), reason: z.string().trim().min(20).max(2000), confirmed: z.literal(true) }).strict();
export function executeEnvironment(repo: SqliteCampaignRepository, raw: unknown, principal: CharacterPrincipal | null) {
    const c = environmentCommand.parse(raw);
    requireCharacterAccess(principal, c.campaignId, c.actorId);
    if (!tableGM(repo, c.campaignId, principal).isTableGM)
        throw Error('Only the assigned Table GM can change weather, calendar or transition rulings.');
    const { revision, ...identity } = c;
    void revision;
    const hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    repo.db.exec('BEGIN IMMEDIATE');
    try {
        const r = repo.get(c.campaignId);
        if (!r)
            throw Error('Campaign not found.');
        const prior = repo.db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(r.id, c.requestId);
        if (prior) {
            if (prior.fingerprint !== hash)
                throw Error('Environment request reused with different choices.');
            repo.db.exec('COMMIT');
            return { record: r, replayed: true };
        }
        if (r.revision !== c.revision)
            throw Error('The campaign changed. Refresh the environment review.');
        const s = r.session, e = environment(s), at = new Date().toISOString();
        if (c.operation === 'activate-hex-flower') {
            if (!c.phase || !c.authorizeDailyAdvancement)
                throw Error('Choose the actual seasonal phase and explicitly authorize daily weather advancement at Morning.');
            if (c.temperatureMode === 'book' && !c.reviewBookTemperature && !e.hexFlower?.bookTemperatureApproved)
                throw Error('Approve the supplied Book of Beasts transcription or provide its original source before selecting book temperature.');
            if (!e.currentWeatherId)
                establishWeather(s, c.requestId);
            const previousHex = e.hexFlower;
            e.hexFlower = { version: '2.0', phase: c.phase, x: previousHex?.phase === c.phase ? previousHex.x : 0, y: previousHex?.phase === c.phase ? previousHex.y : 0, day: previousHex?.day ?? 1, temperatureMode: c.temperatureMode ?? 'seasonal', temperatureRoll: previousHex?.phase === c.phase && previousHex.temperatureMode === (c.temperatureMode ?? 'seasonal') ? previousHex.temperatureRoll : null, tempOverride: previousHex?.phase === c.phase ? previousHex.tempOverride : null, windOverride: previousHex?.phase === c.phase ? previousHex.windOverride : null, wildEvent: previousHex?.phase === c.phase ? previousHex.wildEvent : null, lastNavigation: previousHex?.phase === c.phase ? previousHex.lastNavigation : null, lastAdvancedDate: displayDate(s.campaign.date, e.calendar), enabled: true, modifiersApproved: c.approveModifiers ?? false, bookTemperatureApproved: c.reviewBookTemperature || previousHex?.bookTemperatureApproved || false, sourceHash: WEATHER_SOURCE_SHA256 };
            e.protocolRevision++;
            s.quarterDays = quarterFor(s);
            s.quarterDays.settings.weatherMode = 'AI Game Master';
            if (s.activityState)
                s.activityState.settings.season = c.phase.startsWith('spring') ? 'Spring' : c.phase.startsWith('summer') ? 'Summer' : c.phase.startsWith('fall') ? 'Autumn' : 'Winter';
            if (c.approveReplacement) {
                realizeWeather(s, 'weather:' + c.requestId, principal!.playerId);
                refreshTransitionWeather(repo, r.id, s);
            }
        }
        if (c.operation === 'adjust-hex-flower') {
            const h = e.hexFlower;
            if (!h)
                throw Error('Activate the supplied hex-flower protocol first.');
            if (!c.approveReplacement)
                throw Error('Explicitly approve replacing the current weather result; original weather records remain preserved.');
            if (c.phase && c.phase !== h.phase) {
                h.phase = c.phase;
                if (s.activityState)
                    s.activityState.settings.season = c.phase.startsWith('spring') ? 'Spring' : c.phase.startsWith('summer') ? 'Summer' : c.phase.startsWith('fall') ? 'Autumn' : 'Winter';
                h.x = 0;
                h.y = 0;
                resetOverrides(h);
                h.lastNavigation = null;
            }
            if (c.temperatureMode && c.temperatureMode !== h.temperatureMode) {
                if (c.temperatureMode === 'book' && !h.bookTemperatureApproved && !c.reviewBookTemperature)
                    throw Error('Book temperature requires explicit approval of the supplied unverified transcription.');
                h.temperatureMode = c.temperatureMode;
                h.temperatureRoll = null;
                h.tempOverride = null;
            }
            if (c.reviewBookTemperature)
                h.bookTemperatureApproved = true;
            if (c.approveModifiers !== undefined)
                h.modifiersApproved = c.approveModifiers;
            if (c.x !== undefined || c.y !== undefined) {
                if (c.x === undefined || c.y === undefined || !inFlower(h.phase, c.x, c.y))
                    throw Error('Choose a valid coordinate in the selected weather flower.');
                h.x = c.x;
                h.y = c.y;
                resetOverrides(h);
                h.lastNavigation = null;
            }
            if (c.temperatureOverride !== undefined)
                h.tempOverride = c.temperatureOverride === 'auto' ? null : c.temperatureOverride;
            if (c.windOverride !== undefined)
                h.windOverride = c.windOverride === 'auto' ? null : c.windOverride;
            if (c.rerollWild) {
                if (h.x !== 0 || h.y !== -4)
                    throw Error('The warning hex is only at 0,-4.');
                h.wildEvent = null;
            }
            h.lastAdvancedDate = displayDate(s.campaign.date, e.calendar);
            realizeWeather(s, 'weather:' + c.requestId, principal!.playerId);
            refreshTransitionWeather(repo, r.id, s);
        }
        if (c.operation === 'manual-weather') {
            if (!c.description)
                throw Error('Describe the actual established weather.');
            manualWeather(s, 'weather:' + c.requestId, principal!.playerId, c.description, { wind: c.wind ?? null, precipitation: c.precipitation ?? null, temperature: c.temperature ?? null }, c.reason, c.cadence ?? 'persistent');
            if ((c.cadence ?? 'persistent') === 'persistent' && e.hexFlower) {
                e.hexFlower.enabled = false;
                s.quarterDays = quarterFor(s);
                s.quarterDays.settings.weatherMode = 'Manual';
            }
            refreshTransitionWeather(repo, r.id, s);
        }
        if (c.operation === 'retry-weather') {
            establishWeather(s, c.requestId);
            refreshTransitionWeather(repo, r.id, s);
        }
        if (c.operation === 'configure-calendar') {
            if (!c.calendar)
                throw Error('Supply the confirmed phase names, order and lengths for this campaign.');
            e.calendar = c.calendar;
            refreshTransitionWeather(repo, r.id, s, true);
        }
        if (c.operation === 'correct-date') {
            if (!c.date)
                throw Error('Choose the corrected in-world date.');
            const form = activeChatForm(s);
            if (form?.entryId && !completionFor(s, form.entryId))
                throw Error('Resolve the submitted quarter before correcting its date.');
            const equivalent = fantasyDayDistance(s.campaign.date, c.date, e.calendar) === 0;
            if (s.activityState?.needs.some(n => n.date === s.campaign.date) && s.campaign.date !== c.date && !equivalent)
                throw Error('This date has recorded daily needs. Use the existing date representation until those dated records receive a scoped migration; no satisfied needs will be reset.');
            if (equivalent && s.activityState) {
                for (const need of s.activityState.needs.filter(n => n.date === s.campaign.date)) {
                    if (s.activityState.needs.some(other => other !== need && other.date === c.date && other.characterId === need.characterId && other.resource === need.resource))
                        throw Error('Conflicting dated needs must be reviewed before normalizing this date label.');
                    need.date = c.date;
                }
            }
            s.campaign.date = c.date;
            if (e.currentWeatherId && !equivalent) {
                e.weatherStatus = 'pending';
                e.review = 'The corrected date needs an explicit weather review; no weather step or recovery was repeated.';
                s.campaign.weather = 'Weather pending review';
            }
            for (const f of s.chatJourney?.forms ?? [])
                if (!f.entryId)
                    f.superseded = true;
        }
        if (c.operation === 'review-transition') {
            const completed = [...(s.chatJourney?.updates ?? [])].reverse().find(u => u.kind === 'completed' && displayDate(u.date ?? '', e.calendar) === displayDate(s.campaign.date, e.calendar) && u.quarter === s.campaign.quarter);
            if (!completed)
                throw Error('There is no completed quarter leading to the current clock position.');
            const entry = s.dayTracker!.find(x => x.id === completed.entryId)!, before = structuredClone(s);
            Object.assign(before.campaign, { date: entry.date, quarter: entry.quarter, hex: entry.from, weather: entry.weather });
            appendTransition(repo, r.id, before, s, entry.id, completed.id);
        }
        e.audit.push({ id: c.requestId, actorId: principal!.playerId, reason: c.operation + ': ' + c.reason, at });
        if (['activate-hex-flower', 'adjust-hex-flower', 'manual-weather', 'configure-calendar', 'correct-date'].includes(c.operation))
            makeRuling(repo, { campaignId: r.id, originId: c.requestId, sceneId: 'environment:' + s.campaign.hex, domain: 'rules_conflict', question: c.operation, scope: { key: c.operation, fingerprint: hash }, decision: c.reason, reasoning: 'Explicit Table GM environment ruling; it does not invent printed modifiers, consumption, recovery or encounter outcomes.', decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', requestId: c.requestId, receiptId: c.requestId, blockingReason: '', risk: 'bounded' });
        const record = repo.update(r.id, r.revision, s, { environmentValidated: true, activitiesValidated: true, workflowValidated: true, timeEventId: c.requestId, elapsedQuarters: 0 });
        repo.db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(r.id, c.requestId, hash, at);
        repo.db.exec('COMMIT');
        return { record, replayed: false };
    }
    catch (error) {
        repo.db.exec('ROLLBACK');
        throw error;
    }
}
