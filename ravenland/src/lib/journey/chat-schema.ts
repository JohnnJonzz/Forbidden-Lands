import {routeReviewSchema,expeditionUpdateFields} from './expedition';
import {travelIntentSchema,sceneEstimateSchema,rumorSchema} from './workflow';
import {z} from 'zod';
import {assignmentSchema} from './quarter-schema';
const id=z.string().min(1).max(100),text=z.string().max(5000),quarter=z.enum(['Morning','Day','Evening','Night']);
export const chatDraftSchema=z.object({traveling:z.boolean(),destination:z.string().max(50),assignments:z.array(assignmentSchema).min(1).max(20),notes:text}).strict();
export const chatFormSchema=z.object({direction:z.string().max(30).optional(),id,date:z.string().max(100),quarter,from:z.string().max(50),location:z.string().max(200),terrain:z.string().max(200),weather:z.string().max(300),requestedAt:z.string().datetime(),entryId:z.string().uuid().nullable(),superseded:z.boolean(),draft:chatDraftSchema}).strict();
export const resolutionSchema=z.object({restConfirmed:z.boolean().optional(),endingHex:z.string().max(50),quarterDays:z.literal(1),nextWeather:z.string().trim().min(1).max(300),adjudication:text.trim().min(1),narrative:text}).strict();
export const chatUpdateSchema=z.object({...expeditionUpdateFields,restRecovery:z.array(z.object({characterId:z.string(),attribute:z.string(),before:z.number(),after:z.number()}).strict()).optional(),id:z.string().uuid(),entryId:z.string().uuid(),kind:z.enum(['question','response','narrative','proposal','completed','route','entered','expedition_review']),text,at:z.string().datetime(),resolution:resolutionSchema.optional(),date:z.string().max(100).optional(),quarter:quarter.optional()}).strict().refine(u=>!['proposal','completed'].includes(u.kind)||!!u.resolution,'Resolution required').refine(u=>u.kind!=='completed'||!!u.date&&!!u.quarter,'Completion clock required');
export const chatJourneySchema=z.object({forms:z.array(chatFormSchema).max(5000),updates:z.array(chatUpdateSchema).max(20000)}).strict().refine(s=>new Set(s.forms.map(f=>f.id)).size===s.forms.length&&new Set(s.updates.map(u=>u.id)).size===s.updates.length&&new Set(s.updates.filter(u=>u.kind==='completed').map(u=>u.entryId)).size===s.updates.filter(u=>u.kind==='completed').length,'Duplicate forms or completions');
const env={campaignId:z.string().uuid(),revision:z.number().int().positive(),actionId:z.string().uuid()};
export const chatCommandSchema=z.discriminatedUnion('type',[
 z.object({...env,type:z.literal('quarter-chat-plan-route'),entryId:z.string().uuid(),review:routeReviewSchema,confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-enter-hex'),entryId:z.string().uuid(),routeId:z.string().uuid(),step:z.number().int().min(0).max(2),navigationRollId:z.string().uuid().nullable(),adjudication:text.trim().min(1),confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-expedition-review'),entryId:z.string().uuid(),kind:z.enum(['encounter','interruption','resume','mishap']),result:z.enum(['none','encounter','resolved','stop','resume','adjudicate']),reason:text.trim().min(1),encounterId:z.string().nullable(),rollId:z.string().uuid().nullable(),navigationRollId:z.string().uuid().nullable(),confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-intent'),intent:travelIntentSchema,confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-estimate'),estimate:sceneEstimateSchema,confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-rumor'),rumor:rumorSchema,confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-prepare'),intentId:z.string().uuid(),destination:z.string().min(1).max(50),confirmed:z.literal(true)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-request')}).strict(),
 z.object({...env,type:z.literal('quarter-chat-draft'),formId:id,draft:chatDraftSchema}).strict(),
 z.object({...env,type:z.literal('quarter-chat-submit'),navigationNotRequired:z.literal(true).optional(),watchNotRequired:z.literal(true).optional(),formId:id,actorId:id,draft:chatDraftSchema}).strict(),
 z.object({...env,type:z.enum(['quarter-chat-question','quarter-chat-response','quarter-chat-narrative']),entryId:z.string().uuid(),text:text.trim().min(1)}).strict(),
 z.object({...env,type:z.literal('quarter-chat-propose'),entryId:z.string().uuid(),resolution:resolutionSchema}).strict(),
 z.object({...env,type:z.literal('quarter-chat-complete'),entryId:z.string().uuid(),actorId:id,resolution:resolutionSchema,confirmed:z.literal(true)}).strict()
]);
export type ChatDraft=z.infer<typeof chatDraftSchema>;
export type ChatForm=z.infer<typeof chatFormSchema>;
export type ChatJourney=z.infer<typeof chatJourneySchema>;
export type ChatCommand=z.infer<typeof chatCommandSchema>;
export type QuarterResolution=z.infer<typeof resolutionSchema>;
