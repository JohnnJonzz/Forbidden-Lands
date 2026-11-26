import {z} from 'zod';
export const injuryRecordSchema=z.object({
 id:z.string().uuid(),name:z.string().max(300),sustainedDate:z.string().max(160),
 sustainedQuarter:z.enum(['','Morning','Day','Evening','Night']),
 duration:z.string().max(30).refine(v=>v===''||/^\d+(?:\.\d+)?$/.test(v)&&Number(v)>0&&Number(v)<=10000,'Record a positive established duration, or leave unknown.'),
 unit:z.enum(['days','hours','quarter_days','review']),permanent:z.boolean(),status:z.enum(['active','healed']),
 source:z.string().max(1600),treatment:z.string().max(1600),recordedAt:z.string().datetime(),
}).strict();
