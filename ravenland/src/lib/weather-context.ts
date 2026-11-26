import type { Session } from './types';
import { dateKey } from './calendar';
export function weatherModifier(s: Session, activity: 'Lead the Way' | 'Make Camp') { const e = s.environment, w = e?.weather.find(w => w.id === e.currentWeatherId); if (!w || e?.weatherStatus !== 'established' || w.description !== s.campaign.weather)
    return 0; if (w.cadence !== 'persistent' && (dateKey(w.date,e.calendar) !== dateKey(s.campaign.date,e.calendar) || w.cadence === 'quarter' && w.quarter !== s.campaign.quarter))
    return 0; return w.modifiers.find(m => m.activity === activity)?.value ?? 0; }
export function guardWeatherNarration(s: Session, text: string) { const e = s.environment, w = e?.weather.find(w => w.id === e.currentWeatherId); if (e?.weatherStatus === 'pending' && /\bthe weather is (?:clear|rainy|sunny|snowy|hot|cold)/i.test(text))
    return 'Current weather requires the Table GM’s saved review; no new conditions were verified.'; if (!w || e?.weatherStatus !== 'established')
    return text; const wet = /drizzle|downpour|rain|snow/i.test(w.precipitation ?? w.description), contradiction = wet && /\bcloudless|clear (?:blue )?sk(?:y|ies)|dry morning|no (?:rain|precipitation)\b/i.test(text) || w.temperature === 'Cool' && /\bscorching|sweltering\b/i.test(text) || w.wind === 'Strong wind' && /\bwindless|still air\b/i.test(text); return contradiction ? 'The authoritative weather remains ' + w.description + '. The saved weather has not been rerolled.' : text; }
