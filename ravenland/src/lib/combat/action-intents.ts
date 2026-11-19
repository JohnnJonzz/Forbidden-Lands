import {z} from 'zod';
const ref=z.string().min(1).max(180);
export const combatIntentSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('move'),targetId:ref,to:z.enum(['Arm','Near','Short','Long'])}).strict(),
 z.object({type:z.literal('draw_weapon'),weaponRef:ref}).strict(),
 z.object({type:z.literal('ready_weapon'),weaponRef:ref}).strict(),
 z.object({type:z.literal('load_weapon'),weaponRef:ref}).strict(),
 z.object({type:z.literal('prepare_attack'),targetId:ref,weaponRef:ref,attackType:z.enum(['slash','stab','shoot','punch']).nullable()}).strict(),
 z.object({type:z.literal('end_turn')}).strict(),
 // Existing defensive and posture controls retain their deterministic paths.
 z.object({type:z.literal('declare_defense'),defense:z.enum(['none','dodge','parry'])}).strict(),
 z.object({type:z.literal('stand')}).strict(),
 z.object({type:z.literal('clarify'),question:z.string().min(1).max(400)}).strict()
]);
export const actionInterpretationSchema=z.object({
 encounterId:z.string().uuid(),actorId:ref,
 disposition:z.enum(['actions','conversation','clarification','unsupported']),
 actions:z.array(combatIntentSchema).max(4),
 message:z.string().max(400).nullable()
}).strict();
export type CombatIntent=z.infer<typeof combatIntentSchema>;
export type ActionInterpretation=z.infer<typeof actionInterpretationSchema>;
export interface IntentOutcome {index:number;type:CombatIntent['type'];status:'completed'|'awaiting_input'|'blocked';code:string|null;message:string}
