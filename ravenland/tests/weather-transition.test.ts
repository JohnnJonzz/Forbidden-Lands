import { dateDistance } from '../src/server/activities/state';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, FLOWERS, FLOWER_FOR, WEATHER_SOURCE_SHA256 } from '../src/lib/weather-hex-data';
import { navDirection, stepHex, realizeHex, type HexState } from '../src/lib/weather-hex';
import { nextDate } from '../src/lib/journey/clock';
import { dateKey,displayDate, fantasyDayDistance } from '../src/lib/calendar';
function state(phase: HexState['phase'] = 'springrise'): HexState { return { version: '2.0', phase, x: 0, y: 0, day: 1, temperatureMode: 'seasonal', temperatureRoll: null, tempOverride: null, windOverride: null, wildEvent: null, lastNavigation: null, lastAdvancedDate: null, enabled: true, modifiersApproved: true, bookTemperatureApproved: false, sourceHash: WEATHER_SOURCE_SHA256 }; }
test('all three supplied flowers retain nineteen tiles and the exact eight-phase assignment', () => { assert.deepEqual(PHASES, ['springrise', 'springwane', 'summerrise', 'summerwane', 'fallrise', 'fallwane', 'winterrise', 'winterwane']); for (const f of Object.values(FLOWERS))
    assert.equal(Object.keys(f).length, 19); assert.deepEqual(PHASES.map(p => FLOWER_FOR[p]), ['middle', 'top', 'top', 'top', 'top', 'middle', 'bottom', 'bottom']); });
const ordinary = [[12], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]], special: {
    [key: string]: number[][];
} = { springwane: [[12], [2, 7], [3, 8], [4, 9], [5, 10], [6, 11]], fallrise: [[2, 12], [5, 6], [7, 8], [11], [9, 10], [3, 4]], fallwane: [[12], [10, 11], [8, 9], [6, 7], [4, 5], [2, 3]] };
for (const p of PHASES)
    test('exact v2.0 navigation groups for ' + p, () => { const groups = special[p] ?? ordinary; for (let n = 2; n <= 12; n++)
        assert.equal(navDirection(p, n), groups.findIndex(g => g.includes(n))); });
test('top and bottom end-lines block; side exits wrap along the original ray', () => { let s = state(); s.y = -4; stepHex(s, n => n); assert.deepEqual([s.x, s.y, s.lastNavigation!.action], [0, -4, 'blocked']); s = state(); s.y = 4; let i = 0; stepHex(s, () => [3, 3][i++] ?? 1); assert.deepEqual([s.x, s.y, s.lastNavigation!.action], [0, 4, 'blocked']); s = state(); s.x = 2; s.y = -2; stepHex(s, () => 1); assert.deepEqual([s.x, s.y, s.lastNavigation!.action], [-2, 2, 'wrapped']); });
test('every phase/tile/2D6 movement remains inside its own flower', () => { for (const phase of PHASES)
    for (const k of Object.keys(FLOWERS[FLOWER_FOR[phase]]))
        for (let a = 1; a <= 6; a++)
            for (let b = 1; b <= 6; b++) {
                const s = state(phase);
                [s.x, s.y] = k.split(',').map(Number);
                let i = 0;
                stepHex(s, () => [a, b][i++] ?? 1);
                assert.ok(Object.hasOwn(FLOWERS[FLOWER_FOR[phase]], `${s.x},${s.y}`));
                assert.equal(s.day, 2);
            } });
test('warning result and book temperature are rolled once and cached; overrides reset on the next day', () => { const s = state('winterrise'); s.y = -4; s.temperatureMode = 'book'; s.bookTemperatureApproved = true; let calls = 0; const die = (n: number) => { calls++; return n; }; const first = realizeHex(s, die); assert.equal(first.temperature, 'Cool'); assert.equal(calls, 2); assert.deepEqual(realizeHex(s, die), first); assert.equal(calls, 2); s.tempOverride = 'Hot'; s.windOverride = 'n'; stepHex(s, () => 1); assert.equal(s.tempOverride, null); assert.equal(s.windOverride, null); });
test('seasonal temperature stays a house rule and book transcription requires deliberate approval', () => { assert.equal(realizeHex(state('winterwane'), () => 1).temperature, 'Cool'); const s = state(); s.temperatureMode = 'book'; assert.throws(() => realizeHex(s, () => 1), /approval/); s.bookTemperatureApproved = true; assert.equal(realizeHex(s, () => 1).temperature, 'Hot'); assert.match(realizeHex(s, () => 6).temperatureProvenance, /not verified/); });
test('named date labels normalize offsets without Gregorian assumptions or double increments', () => { assert.equal(nextDate('12th of Stillfall, 1165'), '13th of Stillfall, 1165'); assert.equal(displayDate('12th of Stillfall, 1165 (+1 day)'), '13th of Stillfall, 1165'); assert.equal(nextDate('12th Stillfall, 1165 (+1 day)'), '14th Stillfall, 1165'); assert.equal(fantasyDayDistance('12th Stillfall, 1165 (+1 day)', '13th Stillfall, 1165'), 0); assert.equal(nextDate('45th Stillfall, 1165'), '45th Stillfall, 1165 (+1 day)');assert.equal(dateKey('12th of Stillfall, 1165 (+1 day)'),dateKey('13th Stillfall, 1165')); });
test('confirmed phase lengths control month/year boundaries and explicit aliases', () => { const calendar = { phases: [{ name: 'Stillfall', days: 45 }, { name: 'Winterrise', days: 46 }], source: 'Table GM festival declaration', reason: 'The actual phase boundaries were explicitly agreed for this campaign year.' }; assert.equal(nextDate('45th Stillfall, 1165', calendar), '1st Winterrise, 1165'); assert.equal(nextDate('46th Winterrise, 1165', calendar), '1st Stillfall, 1166'); assert.equal(fantasyDayDistance('45th Stillfall, 1165', '1st Winterrise, 1165', calendar), 1); assert.equal(dateDistance('45th Stillfall, 1165', '1st Winterrise, 1165', calendar), 1); });
