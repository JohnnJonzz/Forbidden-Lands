import {z} from 'zod';
const line=z.string().trim().max(1800);
export const foundationSchema=z.object({name:z.string().trim().min(1).max(100),description:line,npcs:z.array(line).max(8),relationships:z.array(line).max(12),motivations:z.array(z.object({characterId:z.string().min(1).max(100),text:line}).strict()).max(20),purpose:line,opening:line,tone:line,initiative:z.enum(['Active','Balanced','Reactive']),rumors:z.array(line).max(8)}).strict();
export const genesisDecisionSchema=z.object({intent:z.enum(['discuss','modify_village','retry_village','accept_village','review','confirm']),villageId:z.string().uuid().nullable(),draft:foundationSchema,narration:z.string().min(1).max(8000),openingScene:z.string().max(6000)}).strict();
export type Foundation=z.infer<typeof foundationSchema>;
export type GenesisDecision=z.infer<typeof genesisDecisionSchema>;
export type GenesisChooser=(input:unknown)=>Promise<GenesisDecision>;
