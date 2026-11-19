import {z} from 'zod';
const ref=z.string().min(1).max(160),text=z.string().trim().min(1).max(1200),count=z.number().int().positive().max(10000);
export const stockSchema=z.object({hex:z.string().min(1).max(50),eventId:ref.nullable(),kind:z.enum(['gear','resource','water_source']),name:text,weight:z.enum(['Heavy','Normal','Light','Tiny']),quantity:z.number().int().nonnegative().max(10000),resource:z.enum(['food','water','arrows','torches']).nullable(),unitsVerified:z.boolean(),priceSilver:z.number().int().nonnegative().max(10000).nullable(),cashSilver:z.number().int().nonnegative().max(100000),waterScope:z.enum(['stronghold_well','reviewed_equivalent']).nullable(),sourceMessageId:ref,reason:text}).strict();
export const allocationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('gear'),fromCharacterId:ref.nullable(),stockId:ref.nullable(),area:z.enum(['gear','weapons']),index:z.number().int().nonnegative().nullable(),expectedName:text,toCharacterId:ref.nullable(),quantity:count,trade:z.enum(['give','buy','sell'])}).strict(),
 z.object({kind:z.literal('resource'),trade:z.enum(['give','buy']),resource:z.enum(['food','water','arrows','torches']),fromCharacterId:ref.nullable(),stockId:ref.nullable(),toCharacterId:ref,steps:count}).strict(),
 z.object({kind:z.literal('refill'),stockId:ref,toCharacterIds:z.array(ref).min(1).max(20)}).strict()
]);
export const inventoryProposalSchema=z.object({revision:z.number().int().positive(),reason:text,allocations:z.array(allocationSchema).min(1).max(30)}).strict();
export const arrangementSchema=z.object({description:text,location:text,hex:z.string().min(1).max(50),participants:z.array(ref).max(30),organizer:ref,timing:text,unit:z.enum(['minutes','hours','days','quarter_days']).nullable(),duration:count.nullable(),commitments:z.array(text).max(20),sourceMessageId:ref}).strict();
export const logisticsActionSchema=z.union([
 z.object({type:z.literal('propose_event'),entryId:z.null(),text:text,resolution:z.null(),eventId:ref,revision:z.number().int().positive(),operation:z.enum(['start','wait','complete','cancel'])}).strict(),
 z.object({type:z.literal('propose_inventory'),entryId:z.null(),text:text,resolution:z.null(),inventory:inventoryProposalSchema}).strict(),
 z.object({type:z.literal('propose_arrangement'),entryId:z.null(),text:text,resolution:z.null(),arrangement:arrangementSchema}).strict(),
 z.object({type:z.literal('propose_stock'),entryId:z.null(),text:text,resolution:z.null(),stock:stockSchema}).strict()
]);
export type InventoryProposal=z.infer<typeof inventoryProposalSchema>;
