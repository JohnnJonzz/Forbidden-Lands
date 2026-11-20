import { z } from 'zod';
import type { Session, Quarter } from './types';
const id = z.string().min(1).max(100), quarter = z.enum(['Morning', 'Day', 'Evening', 'Night']);
export const activityContextSchema = z.object({ entryId: id, assignmentId: id, requestId: z.string().uuid(), date: z.string().max(100), quarter, step: z.string().max(100) }).strict();
export const activityRequestSchema = z.object({ context: activityContextSchema, characterId: id, skill: z.string().max(100), attribute: z.enum(['strength', 'agility', 'wits', 'empathy']).nullable(), base: z.number().int(), skillDice: z.number().int(), modifier: z.number().int(), gear: z.number().int(), dice: z.number().int().min(1).max(3).default(1), artifactAllowed: z.boolean().default(false), utility: z.enum(['D6', 'D66', 'Resource']).nullable(), resource: z.enum(['food', 'water', 'arrows', 'torches']).nullable(), sides: z.number().int().nullable(), evidence: z.array(z.string()).max(20), rollId: z.string().uuid().nullable() }).strict();
export type ActivityRequest = z.infer<typeof activityRequestSchema>;
export const activitySchema = z.object({ assignmentId: id, characterId: id, activity: z.string(), stage: z.string(), status: z.enum(['Awaiting roll', 'Awaiting Push/keep decision', 'Awaiting mishap', 'Awaiting preparation or resource allocation', 'Resolved', 'Needs GM ruling']), summary: z.string().max(5000), request: activityRequestSchema.nullable(), rollIds: z.array(z.string()).max(30), prey: z.number().int().nullable(), preyOptions: z.array(z.number().int().min(1).max(6)).max(2).default([]), rerolls: z.number().int(), method: z.enum(['weapon', 'trap']).nullable(), target: z.enum(['food', 'water']).default('food'), choice: z.string().max(500), yield: z.number().int(), interrupted: z.boolean(), review: z.string().max(5000), sources: z.array(z.string()).max(20) }).strict();
export type RoutineActivity = z.infer<typeof activitySchema>;
export const activityStateSchema = z.object({ settings: z.object({ checkpoint: quarter, effectiveDate: z.string(), effectiveQuarter: quarter, season: z.enum(['Spring', 'Summer', 'Autumn', 'Winter']).nullable() }).strict(), entries: z.array(z.object({ entryId: id, date: z.string(), quarter, hex: z.string(), terrain: z.string(), completed: z.boolean(), activities: z.array(activitySchema).max(20) }).strict()).max(5000), provisions: z.array(z.object({ itemId: z.string().uuid(), ownerId: id, kind: z.enum(['Vegetables', 'Meat', 'Fish', 'Food', 'Water', 'Pelts']), date: z.string(), quarter, chefRank: z.number().int(), hazard: z.string().nullable() }).strict()).max(10000), needs: z.array(z.object({ date: z.string(), characterId: id, resource: z.enum(['food', 'water']), status: z.enum(['Pending', 'Awaiting a specific roll', 'Satisfied', 'Unmet', 'Needs GM review']), sourceId: id.nullable(), itemId: z.string().nullable(), request: activityRequestSchema.nullable(), rollId: z.string().nullable(), receiptId: z.string().nullable(), explanation: z.string().max(2000) }).strict()).max(30000) }).strict().superRefine((s, ctx) => {
    const unique = (values: string[], label: string) => {
        if (new Set(values).size !== values.length)
            ctx.addIssue({ code: 'custom', message: 'Duplicate ' + label });
    };
    unique(s.entries.map(e => e.entryId), 'activity entry');
    unique(s.provisions.map(p => p.itemId), 'provision identity');
    unique(s.needs.map(n => n.date + ':' + n.characterId + ':' + n.resource), 'daily need');
    for (const e of s.entries) {
        unique(e.activities.map(a => a.assignmentId), 'activity assignment');
        unique(e.activities.map(a => a.characterId), 'assigned character');
    }
});
export type ActivityState = z.infer<typeof activityStateSchema>;
export const routineSkill = (activity: string) => ['Make Camp', 'Forage', 'Hunt', 'Fish'].includes(activity) ? 'Survival' : activity === 'Keep Watch' ? 'Scouting' : null;
export const supportedActivities = ['Make Camp', 'Keep Watch', 'Forage', 'Hunt', 'Cook', 'Rest', 'Sleep', 'Other', 'Fish', 'Explore'];
export function currentRoutine(s: Session) { return s.activityState?.entries.find(e => !e.completed && e.date === s.campaign.date && e.quarter === s.campaign.quarter) ?? null; }
export function dueNeeds(s: Session) {
    const st = s.activityState;
    if (!st)
        return false;
    const quarters: Quarter[] = ['Morning', 'Day', 'Evening', 'Night'];
    if (s.campaign.date !== st.settings.effectiveDate) {
        const root = (d: string) => d.replace(/ \(\+\d+ days?\)$/, '');
        if (root(s.campaign.date) === root(st.settings.effectiveDate)) {
            const off = (d: string) => Number(d.match(/\(\+(\d+) days?\)$/)?.[1] ?? 0);
            return off(s.campaign.date) > off(st.settings.effectiveDate) && quarters.indexOf(s.campaign.quarter) >= quarters.indexOf(st.settings.checkpoint);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s.campaign.date))
            return s.campaign.date > st.settings.effectiveDate && quarters.indexOf(s.campaign.quarter) >= quarters.indexOf(st.settings.checkpoint);
        return false;
    }
    return quarters.indexOf(s.campaign.quarter) >= Math.max(quarters.indexOf(st.settings.checkpoint), quarters.indexOf(st.settings.effectiveQuarter));
}
export function needsSummary(s: Session) { return s.characters.map(ch => { const status = (resource: 'food' | 'water') => s.activityState?.needs.find(n => n.date === s.campaign.date && n.characterId === ch.id && n.resource === resource) ?? { status: dueNeeds(s) ? 'Pending' : 'Not yet due', explanation: 'Daily checkpoint ' + (s.activityState?.settings.checkpoint ?? 'Night') }; return { characterId: ch.id, name: ch.name, food: status('food'), water: status('water') }; }); }
