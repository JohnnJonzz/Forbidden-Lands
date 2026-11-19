import {z} from 'zod';
const id=z.string().min(1).max(160),ref=z.object({documentId:id,chunkId:id,page:z.number().int().positive(),title:z.string()}).strict();
export const urgencyLevels=['life','mandatory','threat','time_sensitive','decision','routine'] as const;
export const sourceRefSchema=z.object({kind:z.enum(['combat_injury','combat_outcome','journal','memory','ai_request']),id,encounterId:id.nullable(),procedureId:id.nullable()}).strict();
export const procedureContextSchema=z.object({consequenceId:id,procedureId:id,step:z.enum(['deadline','treatment'])}).strict();
export type ProcedureContext=z.infer<typeof procedureContextSchema>;
export const treatmentAttemptSchema=z.object({id,healerId:id,patientId:id,kind:z.enum(['player','npc']),status:z.enum(['prepared','succeeded','failed','cancelled']),actionRound:z.number().int().nonnegative().nullable(),actionWindow:z.string(),cost:z.literal('slow'),pool:z.object({attribute:z.literal('empathy'),base:z.number().int().nonnegative(),skill:z.number().int().nonnegative(),gear:z.literal(0),modifier:z.number().int()}),rollId:id.nullable(),successes:z.number().int().nonnegative().nullable(),createdAt:z.string(),reason:z.string().max(1000)}).strict();
export const consequenceSchema=z.object({id,campaignId:z.string().uuid(),source:sourceRefSchema,category:z.enum(['lethal_injury','mandatory_review','aftermath','narrative']),description:z.string().max(1600),characterIds:z.array(id),npcIds:z.array(id),urgency:z.enum(urgencyLevels),visibility:z.enum(['Party Known','Character Specific','GM Only']),status:z.enum(['pending','awaiting_roll','awaiting_input','awaiting_adjudication','resolved','superseded']),nextProcedure:z.string().max(1600),rules:z.array(ref),revision:z.number().int().nonnegative(),createdAt:z.string(),updatedAt:z.string(),state:z.object({
 deadline:z.object({unit:z.enum(['rounds','hours','days']),dice:z.number().int().min(1).max(3),modifier:z.number().int(),value:z.number().int().positive().nullable(),rollId:id.nullable(),elapsed:z.number().int().nonnegative(),observedRound:z.number().int().nonnegative(),clockDate:z.string(),clockQuarter:z.string(),clockReviewRequired:z.boolean()}).nullable(),
 sceneAccess:z.object({healerIds:z.array(id),safe:z.boolean(),evidence:id,hex:z.string().default(''),location:z.string().default(''),date:z.string().default(''),quarter:z.string().default('')}).nullable(),attempts:z.array(treatmentAttemptSchema),resolution:z.enum(['survived_critical','death_verified','narrative_resolved','superseded']).nullable(),resolutionEvidence:id.nullable(),notes:z.array(z.string().max(1600)),
 })}).strict();
export type Consequence=z.infer<typeof consequenceSchema>;
export type TreatmentAttempt=z.infer<typeof treatmentAttemptSchema>;
export interface RequestedConsequenceRoll {context:ProcedureContext;label:string;purpose:string;attribute:'empathy'|null;base:number;skill:number;gear:number;modifier:number;isArmor:false;instructions:string;utility?:{dice:number;sides:6}}
export const narrativeConsequenceSchema=z.object({source:sourceRefSchema,description:z.string().trim().min(1).max(1600),urgency:z.enum(urgencyLevels),characterIds:z.array(id).max(20),npcIds:z.array(id).max(20),nextProcedure:z.string().max(1600)}).strict();
export const worldActionSchema=z.object({kind:z.enum(['npc_treatment','npc_intent','resolve_narrative']),consequenceId:id,actorId:id,intent:z.string().min(1).max(1000)}).strict();
export const consequenceCommandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('prepare_treatment'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,consequenceId:id,healerId:id,confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('elapsed'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,consequenceId:id,unit:z.enum(['rounds','hours','days']),amount:z.number().int().min(0).max(10000),reason:z.string().min(1).max(1000),confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('scene_access'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,consequenceId:id,healerId:id,reason:z.string().min(1).max(1000),confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('adjudication'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,consequenceId:id,note:z.string().min(1).max(1600),confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('record_narrative'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,proposal:narrativeConsequenceSchema,confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('resolve_narrative'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,consequenceId:id,reason:z.string().min(1).max(1000),supersede:z.boolean(),confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('world_action'),campaignId:z.string().uuid(),requestId:z.string().uuid(),characterId:id,proposal:worldActionSchema,confirmed:z.literal(true)}).strict(),
]);
export type ConsequenceCommand=z.infer<typeof consequenceCommandSchema>;
