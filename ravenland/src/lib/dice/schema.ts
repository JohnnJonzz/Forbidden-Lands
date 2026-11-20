import {activityContextSchema} from '../activities';
import {journeyDiceContextSchema} from '../journey/expedition';
import {procedureContextSchema} from '../consequences/schema';
import {standardAttributeIds} from '../rules/character-registry';
import {z} from 'zod';
import {rollSchema} from '../journey/quarter-schema';
const id=z.string().min(1).max(100);
export const metadataSchema=z.object({attribute:z.enum(standardAttributeIds).nullable(),isArmor:z.boolean(),weaponIndex:z.number().int().min(0).max(99).nullable(),weaponDamage:z.number().min(0).max(100).nullable(),utility:z.discriminatedUnion('kind',[z.object({kind:z.literal('Procedure'),sides:z.literal(6),faces:z.array(z.number().int().min(1).max(6)).min(1).max(3)}).strict(),z.object({kind:z.literal('D66'),faces:z.tuple([z.number().int().min(1).max(6),z.number().int().min(1).max(6)])}).strict(),z.object({kind:z.literal('Resource'),resource:z.enum(['food','water','torches','arrows']),sides:z.union([z.literal(6),z.literal(8),z.literal(10),z.literal(12)]),value:z.number().int().min(1).max(12)}).strict()]).optional()}).strict();
export const combatRollContextSchema=z.object({encounterId:z.string(),actionId:z.string().nullable(),round:z.number().int(),turnId:z.string(),step:z.enum(['attack','defense','armor','movement','critical','helmet']).nullable()}).strict();
export type CombatRollContext=z.infer<typeof combatRollContextSchema>;
export const pendingDiceSchema=z.object({activityContext:activityContextSchema.optional(),creatureContext:z.object({creatureId:z.string().uuid(),ownerId:z.string(),name:z.string(),skill:z.string(),sourceFingerprint:z.string()}).strict().optional(),narrativeRequestId:z.string().uuid().optional(),journeyContext:journeyDiceContextSchema.optional(),encumbranceScope:z.string().max(500).optional(),id:z.string().uuid(),characterId:id,original:rollSchema,result:rollSchema,metadata:metadataSchema,status:z.enum(['Pending','Ready','Submitted']),createdAt:z.string().datetime(),submittedAt:z.string().datetime().nullable(),equipmentId:z.string().min(1).max(100).optional(),weaponSnapshot:z.string().max(200000).nullable().default(null),procedureContext:procedureContextSchema.optional(),combatContext:combatRollContextSchema.optional(),gearDamageApplied:z.number().int().min(0),gearDamageManual:z.number().int().min(0)}).strict().refine(r=>r.id===r.original.id&&r.id===r.result.id&&r.characterId===r.original.characterId&&r.characterId===r.result.characterId&&!r.original.pushed,'Inconsistent dice identity');
export type PendingDice=z.infer<typeof pendingDiceSchema>;
export type RollMetadata=z.infer<typeof metadataSchema>;
const envelope={campaignId:z.string().uuid(),actionId:z.string().uuid()};
export const diceCommandSchema=z.discriminatedUnion('type',[
 z.object({...envelope,type:z.literal('create'),expectedActivityContext:activityContextSchema.optional(),expectedNarrativeRequestId:z.string().uuid().optional(),expectedJourneyContext:journeyDiceContextSchema.optional(),roll:rollSchema,metadata:metadataSchema,expectedCombatContext:combatRollContextSchema.optional(),expectedProcedureContext:procedureContextSchema.optional()}).strict(),
 z.object({...envelope,type:z.literal('push'),additionalEffectConfirmed:z.literal(true).optional(),rollId:z.string().uuid()}).strict(),
 z.object({...envelope,type:z.literal('ready'),rollId:z.string().uuid(),requestId:id,actorId:id}).strict(),
 z.object({...envelope,type:z.literal('unready'),rollId:z.string().uuid(),actorId:id}).strict(),
 z.object({...envelope,type:z.literal('submit-group'),planId:id,actorId:id}).strict(),
 z.object({...envelope,type:z.literal('group-coordinator'),coordinatorId:id,actorId:id}).strict(),
 z.object({...envelope,type:z.literal('submit'),rollId:z.string().uuid(),requestId:id.nullable()}).strict()
]);
export type DiceCommand=z.infer<typeof diceCommandSchema>;
export type DiceInput=DiceCommand extends infer T?T extends DiceCommand?Omit<T,'campaignId'|'actionId'>:never:never;
