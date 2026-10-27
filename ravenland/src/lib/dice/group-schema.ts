import {z} from 'zod';
import {assignmentSchema,requestSchema,rollSchema} from '../journey/quarter-schema';
const id=z.string().min(1).max(100);
export const batchSchema=z.object({id:z.string().uuid(),planId:id,coordinatorId:id,submittedAt:z.string().datetime(),context:z.object({date:z.string().max(100),quarter:z.enum(['Morning','Day','Evening','Night']),hex:z.string().max(50),location:z.string().max(200),terrain:z.string().max(200),weather:z.string().max(300),traveling:z.boolean(),destination:z.string().max(50),direction:z.string().max(30),travelApproved:z.boolean(),travelRuling:z.string().max(5000),party:z.array(z.object({id,name:z.string().max(100)}).strict()).max(20),assignments:z.array(assignmentSchema).max(20)}).strict(),results:z.array(rollSchema).max(20),resolvedRequests:z.array(requestSchema).max(20),narration:z.object({status:z.literal('Not connected'),summary:z.string().max(20000)}).strict()}).strict();
export const diceGroupsSchema=z.object({coordinatorId:id.nullable(),batches:z.array(batchSchema).max(5000)}).strict().refine(g=>new Set(g.batches.map(b=>b.planId)).size===g.batches.length&&new Set(g.batches.map(b=>b.id)).size===g.batches.length,'Duplicate quarter-day batches');
export type DiceGroups=z.infer<typeof diceGroupsSchema>;
export type DiceBatch=z.infer<typeof batchSchema>;
