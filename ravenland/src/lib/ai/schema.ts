import {z} from 'zod';
export const memoryCategories=['NPC','Location','Quest','Faction','Relationship','Discovery','Significant Event','Rumor','Secret','Unresolved Story Thread'] as const;
export const visibilities=['Party Known','Character Specific','GM Only'] as const;
export const memoryStatuses=['proposed','approved','corrected','archived'] as const;
export const memoryContentSchema=z.object({
 category:z.enum(memoryCategories),title:z.string().trim().min(1).max(160),summary:z.string().trim().min(1).max(4000),
 characterIds:z.array(z.string().min(1).max(100)).max(20),npcIds:z.array(z.string().min(1).max(100)).max(20),
 hexIds:z.array(z.string().min(1).max(50)).max(20),faction:z.string().max(200),quest:z.string().max(200),
 visibility:z.enum(visibilities),importance:z.number().int().min(1).max(5),storyState:z.enum(['active','resolved','historical'])
}).strict();
export type MemoryContent=z.infer<typeof memoryContentSchema>;
export interface Memory extends MemoryContent {id:string;campaignId:string;day:string;quarter:string;source:{kind:'chat'|'journal'|'request';id:string}|null;status:typeof memoryStatuses[number];locked:boolean;revision:number;targetMemoryId:string|null;createdAt:string;updatedAt:string}
export const aiSettingsSchema=z.object({style:z.enum(['Concise','Balanced','Descriptive']),autonomy:z.enum(['Guided','Autonomous Narrative'])}).strict();
export type AISettings=z.infer<typeof aiSettingsSchema>;
// All structured-output properties are required; nullable values mean no action.
export const aiActionSchema=z.object({type:z.enum(['request_quarter_day','ask_quarter_question','narrate_quarter_day','propose_quarter_resolution']),entryId:z.string().nullable(),text:z.string().max(5000),resolution:z.object({endingHex:z.string().max(50),quarterDays:z.literal(1),nextWeather:z.string().max(300),adjudication:z.string().max(5000),narrative:z.string().max(5000)}).strict().nullable()}).strict();
export const gmOutputSchema=z.object({narration:z.string().min(1).max(18000),memoryProposals:z.array(memoryContentSchema.extend({targetMemoryId:z.string().nullable()}).strict()).max(6),actions:z.array(aiActionSchema).max(4),selectedImageId:z.string().nullable()}).strict();
export type GMOutput=z.infer<typeof gmOutputSchema>;
export const gmTurnSchema=z.object({campaignId:z.string().uuid(),requestId:z.string().uuid(),kind:z.enum(['chat','quarter','recap']),action:z.string().trim().max(3000).default(''),characterId:z.string().max(100).default(''),entryId:z.string().uuid().optional()}).strict().refine(v=>v.kind!=='chat'||!!v.action&&!!v.characterId,'Choose a character and enter an action').refine(v=>v.kind!=='quarter'||!!v.entryId,'Quarter-day entry required');
export type GMTurn=z.infer<typeof gmTurnSchema>;
export interface AIReply {requestId:string;provider:'openai'|'mock';narration:string;actions:GMOutput['actions'];selectedImageId:string|null;partyProposals:number;recapId?:string;replayed?:boolean}
export type GMStreamEvent={type:'text';text:string}|{type:'done';reply:AIReply}|{type:'error';error:string;code:string};
