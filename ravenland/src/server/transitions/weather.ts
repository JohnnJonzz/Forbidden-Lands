import { createHash, randomInt } from 'node:crypto';
import type { Session } from '../../lib/types';
import type { Environment, WeatherResult } from '../../lib/environment';
import { journeyFor } from '../../lib/journey/engine';
import { displayDate,dateKey } from '../../lib/calendar';
import { realizeHex, stepHex } from '../../lib/weather-hex';
export const stable = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
export function environment(s: Session): Environment { return s.environment ??= { calendar: null, hexFlower: null, protocolRevision: 0, weather: [], currentWeatherId: null, weatherStatus: 'pending', review: 'Weather has not been established.', audit: [] }; }
export function currentWeather(s: Session) { return s.environment?.weatherStatus === 'pending' ? null : s.environment?.weather.find(w => w.id === s.environment?.currentWeatherId) ?? null; }
export function saveWeather(s: Session, result: WeatherResult) { const e = environment(s); if (!e.weather.some(w => w.id === result.id))
    e.weather.push(result); e.currentWeatherId = result.id; e.weatherStatus = 'established'; e.review = ''; s.campaign.weather = result.description; const j = journeyFor(s); s.journey = j; j.weather = { ...j.weather, forDescription: result.description, source: 'Manual', updatedAt: result.recordedAt, unverifiedEffects: result.effects.join('; ') }; return result; }
export function manualWeather(s: Session, id: string, actorId: string, description: string, detail: Partial<Pick<WeatherResult, 'wind' | 'precipitation' | 'temperature' | 'severity' | 'effects'>> = {}, source = 'Explicit Table GM weather ruling', cadence: WeatherResult['cadence'] = 'persistent') { const e = environment(s); return saveWeather(s, { id, date: s.campaign.date, quarter: s.campaign.quarter, hex: s.campaign.hex, location: s.campaign.location, region: s.campaign.hex, period: cadence === 'persistent' ? 'until explicitly replaced' : displayDate(s.campaign.date, e.calendar) + (cadence === 'quarter' ? ':' + s.campaign.quarter : ''), cadence, description, ...{ wind: null, precipitation: null, temperature: null, severity: 'Unspecified', effects: [] }, ...detail, draws: [], provenance: source === 'Legacy manually established weather' ? 'legacy_manual' : 'table_gm_manual', source, actorId, recordedAt: new Date().toISOString(), modifiers: [] }); }
export function realizeWeather(s: Session, id: string, actorId: string, die: (n: number) => number = n => randomInt(1, n + 1)) { const e = environment(s), h = e.hexFlower!; const weather = realizeHex(h, die), draws: WeatherResult['draws'] = []; if (h.lastNavigation)
    h.lastNavigation.dice.forEach((value, i) => draws.push({ dimension: 'navigation D6 ' + (i + 1), sides: 6, value })); if (h.wildEvent)
    draws.push({ dimension: 'warning hex', sides: 3, value: h.wildEvent.roll }); if (h.temperatureRoll)
    draws.push({ dimension: 'Book of Beasts temperature transcription', sides: 6, value: h.temperatureRoll }); return saveWeather(s, { id, date: s.campaign.date, quarter: s.campaign.quarter, hex: s.campaign.hex, location: s.campaign.location, region: 'Campaign-approved Ravenland hex-flower', period: displayDate(s.campaign.date, e.calendar), cadence: 'daily', description: [weather.condition, weather.temperature, weather.wind].join(' · '), wind: weather.wind, precipitation: weather.precipitation, temperature: weather.temperature, severity: weather.wild ? 'severe' : 'ordinary', effects: weather.hazards, draws, provenance: 'reviewed_campaign_protocol', source: 'Ravenland Hex-Flower Weather v2.0 · user-supplied campaign protocol · ' + h.sourceHash, actorId, recordedAt: new Date().toISOString(), hexFlower: structuredClone(h), temperatureProvenance: weather.temperatureProvenance, windProvenance: weather.windProvenance, bookWind: weather.bookWind, condition: weather.condition, wild: weather.wild, modifiers: h.modifiersApproved ? [{ activity: 'Lead the Way', value: weather.leadModifier, provenance: 'campaign_weather_house_rule' }, { activity: 'Make Camp', value: weather.campModifier, provenance: 'campaign_weather_house_rule' }] : [] }); }
export function establishWeather(s: Session, transitionId: string, die: (n: number) => number = n => randomInt(1, n + 1)) {
    const e = environment(s), h = e.hexFlower, prior = currentWeather(s);
    if (!h?.enabled) {
        if (prior)
            return saveWeather(s, prior);
        if (s.campaign.weather && !/^(?:not established|unknown|pending|weather pending review)$/i.test(s.campaign.weather))
            return manualWeather(s, 'weather:' + stable(transitionId + ':legacy'), 'legacy-controller', s.campaign.weather, {}, 'Legacy manually established weather');
        e.weatherStatus = 'pending';
        e.review = 'The Table GM must establish weather or activate the supplied Ravenland hex-flower protocol.';
        s.campaign.weather = 'Weather pending review';
        return null;
    }
    const period = displayDate(s.campaign.date, e.calendar), id = 'weather:' + stable('hex-flower-2:' + dateKey(s.campaign.date,e.calendar));
    if (dateKey(h.lastAdvancedDate ?? '',e.calendar)===dateKey(s.campaign.date,e.calendar) && prior && !(prior.cadence === 'quarter' && prior.quarter !== s.campaign.quarter))
        return saveWeather(s, prior);
    const existing = e.weather.find(w => w.id === id);
    if (existing)
        return saveWeather(s, existing);
    if (dateKey(h.lastAdvancedDate ?? '',e.calendar)===dateKey(s.campaign.date,e.calendar))
        return prior;
    if (s.campaign.quarter !== 'Morning') {
        if (prior)
            return saveWeather(s, prior);
        e.weatherStatus = 'pending';
        e.review = 'The activated hex-flower next advances at Morning. Confirm weather for the current quarter.';
        s.campaign.weather = 'Weather pending review';
        return null;
    }
    const next = structuredClone(h);
    stepHex(next, die);
    next.lastAdvancedDate = period;
    e.hexFlower = next;
    return realizeWeather(s, id, 'deterministic-hex-flower-service', die);
}
