import type { Calendar } from './environment';
export const ordinal = (n: number) => n + ([11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
export function namedDate(value: string) { const m = /^(\d+)(?:st|nd|rd|th)( of)? ([^,]+), (\d+)(?: \(\+(\d+) days?\))?$/.exec(value); return m ? { day: Number(m[1]), of: m[2] ?? '', phase: m[3], year: Number(m[4]), offset: Number(m[5] ?? 0) } : null; }
export function resolveNamedDate(value: string, calendar?: Calendar | null, extra = 0): string | null { const d = namedDate(value); if (!d)
    return null; let day = d.day + d.offset + extra, phase = d.phase, year = d.year; const index = calendar?.phases.findIndex(p => p.name.toLowerCase() === phase.toLowerCase()) ?? -1; if (index >= 0) {
    let i = index;
    for (let count = 0; day > calendar!.phases[i].days && count < 10000; count++) {
        day -= calendar!.phases[i].days;
        i++;
        if (i === calendar!.phases.length) {
            i = 0;
            year++;
        }
    }
    phase = calendar!.phases[i].name;
}
else if (day > 45 || day < 1)
    return null; return `${ordinal(day)}${d.of} ${phase}, ${year}`; }
export function displayDate(value: string, calendar?: Calendar | null) { return resolveNamedDate(value, calendar) ?? value; }
export function fantasyDayDistance(before: string, after: string, calendar?: Calendar | null): number | null { const a = namedDate(before), b = namedDate(after); if (!a || !b)
    return null; if (a.phase.toLowerCase() === b.phase.toLowerCase() && a.year === b.year)
    return b.day + b.offset - a.day - a.offset; if (!calendar)
    return null; const index = (p: string) => calendar.phases.findIndex(x => x.name.toLowerCase() === p.toLowerCase()), i = index(a.phase), j = index(b.phase); if (i < 0 || j < 0)
    return null; const yearDays = calendar.phases.reduce((n, p) => n + p.days, 0), absolute = (d: typeof a, k: number) => d.year * yearDays + calendar.phases.slice(0, k).reduce((n, p) => n + p.days, 0) + d.day + d.offset; return absolute(b, j) - absolute(a, i); }
// Stable period identity ignores optional "of" and legacy elapsed-day spelling.
export function dateKey(value: string, calendar?: Calendar | null) {
    const resolved=displayDate(value,calendar), parsed=namedDate(resolved);
    return parsed ? `${parsed.year}:${parsed.phase.toLowerCase()}:${parsed.day+parsed.offset}` : resolved;
}
