import { z } from 'zod';
import { DELTAS, DIR_NAMES, PHASES, FLOWER_FOR, NAV, FLOWERS, WEATHER, WIND, WILD_EVENTS } from './weather-hex-data';
export type Phase = typeof PHASES[number];
export type WindCode = keyof typeof WIND;
export const phaseSchema = z.enum(PHASES);
const wildSchema = z.object({ w: z.string(), wind: z.enum(['n', 'b', 'g', 's']), title: z.string(), roll: z.number().int().min(1).max(3) }).strict();
export const hexStateSchema = z.object({ version: z.literal('2.0'), phase: phaseSchema, x: z.number().int(), y: z.number().int(), day: z.number().int().positive(), temperatureMode: z.enum(['seasonal', 'book']), temperatureRoll: z.number().int().min(1).max(6).nullable(), tempOverride: z.enum(['Hot', 'Pleasant', 'Cool']).nullable(), windOverride: z.enum(['n', 'b', 'g', 's']).nullable(), wildEvent: wildSchema.nullable(), lastNavigation: z.object({ dice: z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]), sum: z.number().int(), direction: z.enum(DIR_NAMES), action: z.enum(['move', 'blocked', 'wrapped']) }).strict().nullable(), lastAdvancedDate: z.string().nullable(), enabled: z.boolean(), modifiersApproved: z.boolean(), bookTemperatureApproved: z.boolean(), sourceHash: z.string() }).strict().refine(s => inFlower(s.phase, s.x, s.y), 'Position is outside the selected flower');
export type HexState = z.infer<typeof hexStateSchema>;
export function inFlower(phase: Phase, x: number, y: number) { return Object.hasOwn(FLOWERS[FLOWER_FOR[phase]], `${x},${y}`); }
export function navDirection(phase: Phase, roll: number) { const groups = NAV[phase], sizes = phase === 'fallrise' ? [2, 2, 2, 1, 2, 2] : [1, 2, 2, 2, 2, 2]; let offset = 0; for (let d = 0; d < 6; d++) {
    if ((groups.slice(offset, offset + sizes[d]) as readonly number[]).includes(roll))
        return d;
    offset += sizes[d];
} throw Error('Invalid 2D6 navigation sum.'); }
export function checkedDie(die: (n: number) => number, n: number) { const v = die(n); if (!Number.isInteger(v) || v < 1 || v > n)
    throw Error('Invalid weather die.'); return v; }
export function resetOverrides(s: HexState) { s.windOverride = null; s.tempOverride = null; s.temperatureRoll = null; s.wildEvent = null; }
export function realizeHex(s: HexState, die: (n: number) => number) { const flower = FLOWERS[FLOWER_FOR[s.phase]] as Record<string, string>, [raw, wind] = flower[`${s.x},${s.y}`].split('/'); if (raw === 'wild' && !s.wildEvent) {
    const list = WILD_EVENTS[s.phase.startsWith('winter') ? 'cold' : 'warm'], roll = checkedDie(die, list.length);
    s.wildEvent = { ...list[roll - 1], roll };
} if (s.temperatureMode === 'book' && !s.tempOverride && s.temperatureRoll === null) {
    if (!s.bookTemperatureApproved)
        throw Error('Book of Beasts temperature transcription needs explicit Table GM approval or the original source.');
    s.temperatureRoll = checkedDie(die, 6);
} const code = (raw === 'wild' ? s.wildEvent!.w : raw) as keyof typeof WEATHER, windCode = (s.windOverride ?? (raw === 'wild' ? s.wildEvent!.wind : wind)) as WindCode, w = WEATHER[code], windResult = WIND[windCode]; if (!w || !windResult)
    throw Error('Invalid saved weather code.'); const temperature = s.tempOverride ?? (s.temperatureMode === 'book' ? s.temperatureRoll === 1 ? 'Hot' : s.temperatureRoll === 6 ? 'Cool' : 'Pleasant' : code === 'hot' ? 'Hot' : s.phase.startsWith('winter') ? 'Cool' : 'Pleasant'); const hazards: string[] = []; if (windResult.book === 'Storm' && w.rain === 'Downpour')
    hazards.push('Protocol exposure: Endurance −2 to keep moving each quarter; source is the supplied Book of Beasts transcription, not verified in the two core PDFs.');
else if (windResult.book === 'Storm' || w.rain === 'Downpour')
    hazards.push('Protocol exposure: Endurance to keep moving each quarter; review the supplied Book of Beasts transcription.'); if (temperature === 'Hot')
    hazards.push('Protocol exposure: hiking Endurance each quarter or Thirsty; verify the procedure before applying consequences.'); if (temperature === 'Cool')
    hazards.push('Protocol exposure: outside-camp Endurance each quarter or Cold; verify the procedure before applying consequences.'); return { condition: w.label, precipitation: w.rain, wind: windResult.label, bookWind: windResult.book, temperature, leadModifier: w.lead, campModifier: windResult.camp, hazards, wild: raw === 'wild' ? s.wildEvent!.title : null, temperatureProvenance: s.tempOverride ? 'Table GM override' : s.temperatureMode === 'seasonal' ? 'Seasonal temperature house rule' : 'Book of Beasts p153 table transcribed in supplied v2.0; original BoB not verified', windProvenance: s.windOverride ? 'Table GM wind override; original flower glyphs remain a best-effort transcription' : 'Best-effort glyph transcription retained from supplied v2.0' }; }
export function stepHex(s: HexState, die: (n: number) => number) { const d1 = checkedDie(die, 6), d2 = checkedDie(die, 6), sum = d1 + d2, dir = navDirection(s.phase, sum), delta = DELTAS[dir]; let x = s.x + delta[0], y = s.y + delta[1], action: 'move' | 'blocked' | 'wrapped' = 'move'; if (!inFlower(s.phase, x, y)) {
    if (s.x === 0 && s.y === -4 && dir === 0 || s.x === 0 && s.y === 4 && dir === 3) {
        x = s.x;
        y = s.y;
        action = 'blocked';
    }
    else {
        x = s.x;
        y = s.y;
        for (let i = 0; i < 6; i++) {
            const rx = x - delta[0], ry = y - delta[1];
            if (!inFlower(s.phase, rx, ry))
                break;
            x = rx;
            y = ry;
        }
        action = 'wrapped';
    }
} s.x = x; s.y = y; s.day++; resetOverrides(s); s.lastNavigation = { dice: [d1, d2], sum, direction: DIR_NAMES[dir], action }; return realizeHex(s, die); }
