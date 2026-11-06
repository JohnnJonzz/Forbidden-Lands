import {z} from 'zod';
export const ruleTopics=['Core Mechanics','Combat','Injuries & Recovery','Journeys','Survival','Magic','Talents','Equipment & Crafting','House Rules','Other'] as const;
export const ruleTypes=['Official Rules Summary','House Rule'] as const;
export const ruleVisibilities=['Player Visible','GM Only'] as const;
export const ruleInputSchema=z.object({title:z.string().trim().min(1).max(200),topic:z.enum(ruleTopics),documentType:z.enum(ruleTypes),visibility:z.enum(ruleVisibilities).default('GM Only'),body:z.string().min(1).max(160000).refine(s=>!!s.trim(),'Enter rule text'),sourceReference:z.string().max(500).default(''),overrideScope:z.string().trim().max(200).default('')}).strict().refine(v=>!v.overrideScope||v.documentType==='House Rule','Only house rules can declare an override');
export type RuleInput=z.infer<typeof ruleInputSchema>;
export interface CuratedRule extends RuleInput {id:string;campaignId:string;revision:number;createdAt:string;updatedAt:string}
export const librarySearchSchema=z.object({campaignId:z.string().uuid(),query:z.string().trim().max(400).default(''),topic:z.enum(ruleTopics).optional(),sourceType:z.enum(['All Sources','Curated Rules','Sourcebook PDFs','House Rules']).default('All Sources')}).strict();
export interface CuratedPassage {sourceType:'curated'|'house-rule';documentType:RuleInput['documentType'];topic:RuleInput['topic'];sourceReference:string;overrideScope:string;overrideApplicable?:boolean;chunkId:string;documentId:string;title:string;category:'Rules'|'House Rules';startPage:null;endPage:null;sequence:number;text:string;heading:string|null}
