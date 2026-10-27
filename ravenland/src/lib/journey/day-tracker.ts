import {z} from 'zod';
import {assignmentSchema} from './quarter-schema';
const text=z.string().max(5000);
export const dayRecordSchema=z.object({id:z.string().uuid(),planId:z.string().max(100),date:z.string().max(100),quarter:z.enum(['Morning','Day','Evening','Night']),weather:z.string().max(300),from:z.string().max(50),destination:z.string().max(50),endingHex:z.string().max(50),direction:z.string().max(30),traveling:z.boolean(),travelRuling:text,assignments:z.array(assignmentSchema.extend({outcome:z.enum(['','Success','Fail']),characterName:z.string().max(100)})).max(20),submittedAt:z.string().datetime(),notes:text,narrative:text}).strict();
export type DayRecord=z.infer<typeof dayRecordSchema>;
// Public narration packet deliberately excludes all raw dice and private campaign secrets.
export function quarterNarration(record:DayRecord){return structuredClone(record)}

export const dayCorrectionSchema=z.object({id:z.string().uuid(),entryId:z.string().uuid(),actorId:z.string().max(100),notes:text.trim().min(1),at:z.string().datetime()}).strict();
export type DayCorrection=z.infer<typeof dayCorrectionSchema>;
