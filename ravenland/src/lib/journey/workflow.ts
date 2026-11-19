import {z} from 'zod';
import type {Session} from '../types';
const text=z.string().trim().min(1).max(1600),id=z.string().uuid();
export const travelIntentSchema=z.object({direction:text,destination:z.string().max(50).nullable(),afterQuarter:z.enum(['Morning','Day','Evening','Night']).nullable(),reason:text}).strict();
export const sceneEstimateSchema=z.object({description:text,minutes:z.number().int().min(1).max(1440).nullable(),confidence:z.enum(['approximate','uncertain']),sourceMessageId:z.string().min(1).max(160)}).strict();
export const rumorSchema=z.object({name:z.string().trim().min(1).max(100),description:text,direction:text,hex:z.string().max(50).nullable(),sourceMessageId:z.string().min(1).max(160)}).strict();
const clock=z.object({date:z.string(),quarter:z.string(),hex:z.string()});
export const workflowSchema=z.object({intents:z.array(travelIntentSchema.extend({id,at:z.string(),clock,status:z.enum(['pending','prepared','completed','cancelled']),formId:z.string().nullable(),entryId:z.string().nullable()})).max(500),estimates:z.array(sceneEstimateSchema.extend({id,at:z.string(),clock})).max(1000),rumors:z.array(rumorSchema.extend({id,at:z.string(),clock,locationId:z.string().nullable()})).max(1000)}).strict();
export type Workflow=z.infer<typeof workflowSchema>;
export const workflowFor=(s:Session):Workflow=>s.journey?.workflow??{intents:[],estimates:[],rumors:[]};
export const workflowActionSchema=z.object({type:z.enum(['propose_travel_intent','propose_scene_time','propose_rumor']),entryId:z.null(),text:z.string().max(5000),resolution:z.null(),travel:travelIntentSchema.nullable(),estimate:sceneEstimateSchema.nullable(),rumor:rumorSchema.nullable()}).strict();

// Only explicit player future-travel declarations are recorded; this never chooses a destination or advances time.
export function declaredTravel(action:string){const m=/\bafter (?:the )?(morning|day|evening|night)\b[\s\S]{0,100}?\b(?:travel|head|journey|go)\s+(north(?:east|west)?|south(?:east|west)?|east|west)\b/i.exec(action);return m?{direction:m[2],destination:null,afterQuarter:(m[1][0].toUpperCase()+m[1].slice(1).toLowerCase()) as 'Morning'|'Day'|'Evening'|'Night',reason:action.slice(0,1600)}:null;}
