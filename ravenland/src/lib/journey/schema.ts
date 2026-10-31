import {chatCommandSchema} from './chat-schema';
import {quarterCommandSchema} from './quarter-schema';
import {z} from 'zod';
export const activityNames=['Hike','Lead the Way','Keep Watch','Make Camp','Forage','Hunt','Fish','Rest','Sleep','Explore'] as const;
const text=z.string().max(5000),id=z.string().min(1).max(100);
export const modeSchema=z.enum(['On foot','Mounted','Other (manual)']);
const assignments=z.object({leader:id.nullable(),watch:id.nullable()}).strict();
export const planSchema=z.object({id,from:z.string().max(50),to:z.string().max(50),terrain:z.string().nullable(),mode:modeSchema,modeDetails:text,leader:id,watch:id,cost:z.number().int().min(1).max(16),spent:z.number().int().min(0).max(16),adjudication:text.trim().min(1),capabilitiesReviewed:z.literal(true),status:z.enum(['planned','in-progress','completed','cancelled']),createdAt:text,completedAt:text.optional(),departure:z.object({date:text,quarter:z.string().max(20)}).strict().optional()}).strict().refine(plan=>plan.spent<=plan.cost&&(plan.status!=='completed'||plan.spent===plan.cost),'Inconsistent journey expenditure');
export const outcomeSchema=z.object({result:z.enum(['Success','Failure','Not required','Pending review']),successes:z.number().int().min(0).max(100).nullable(),notes:text}).strict();
export const activitySchema=z.object({id,type:z.enum(activityNames),characters:z.array(id).min(1).max(20),outcome:outcomeSchema,quarterDays:z.number().int().min(0).max(16),adjudication:text.trim().min(1),date:text,quarter:z.string().max(20),completedAt:text}).strict();
export const eventSchema=z.object({id,kind:z.enum(['plan','start','clock','travel','activity','cancel','weather','assignments']),summary:text,before:z.object({date:text,quarter:z.string().max(20),hex:z.string().max(50)}).strict(),after:z.object({date:text,quarter:z.string().max(20),hex:z.string().max(50)}).strict(),at:text}).strict();
export const weatherSchema=z.object({forDescription:z.string().max(300),source:z.enum(['Manual','Roll20 manual entry']),unverifiedEffects:text,updatedAt:text}).strict();
export const journeySchema=z.object({assignments,mode:modeSchema,modeDetails:text,activePlan:planSchema.nullable(),travelHistory:z.array(planSchema).max(2000),activities:z.array(activitySchema).max(5000),log:z.array(eventSchema).max(15000),weather:weatherSchema}).strict().refine(journey=>(!journey.activePlan||(['planned','in-progress'].includes(journey.activePlan.status)&&journey.activePlan.spent<journey.activePlan.cost))&&new Set(journey.log.map(event=>event.id)).size===journey.log.length&&new Set(journey.activities.map(activity=>activity.id)).size===journey.activities.length&&new Set(journey.travelHistory.map(plan=>plan.id)).size===journey.travelHistory.length,'Inconsistent active plan or duplicate journey records');
const envelope={campaignId:z.string().uuid(),revision:z.number().int().positive(),actionId:z.string().uuid()};
const legacyCommandSchema=z.discriminatedUnion('type',[
 z.object({...envelope,type:z.literal('plan'),to:z.string().min(1).max(50),leader:id,watch:id,mode:modeSchema,modeDetails:text,quarterDays:z.number().int().min(1).max(16),adjudication:text.trim().min(1),capabilitiesReviewed:z.literal(true)}).strict(),
 z.object({...envelope,type:z.literal('assignments'),assignments,mode:modeSchema,modeDetails:text}).strict(),
 z.object({...envelope,type:z.enum(['start','advance','complete','cancel']),planId:id,confirmed:z.literal(true)}).strict(),
 z.object({...envelope,type:z.literal('activity'),activity:z.enum(activityNames),characters:z.array(id).min(1).max(20),outcome:outcomeSchema,quarterDays:z.number().int().min(0).max(16),adjudication:text.trim().min(1),confirmed:z.literal(true)}).strict(),
 z.object({...envelope,type:z.literal('weather'),description:z.string().min(1).max(300),source:z.enum(['Manual','Roll20 manual entry']),unverifiedEffects:text}).strict()
]);
export const commandSchema=z.union([legacyCommandSchema,quarterCommandSchema,chatCommandSchema]);
export type JourneyState=z.infer<typeof journeySchema>;
export type JourneyCommand=z.infer<typeof commandSchema>;
export type JourneyInput=JourneyCommand extends infer T?T extends JourneyCommand?Omit<T,'campaignId'|'revision'|'actionId'>:never:never;
export type JourneyPlan=z.infer<typeof planSchema>;
