import type {CuratedPassage} from '../compendium/schema';
import {z} from 'zod';
export const sourceCategories=['Rules','Bestiary','Adventure','Campaign Reference','House Rules','Other'] as const;
export const sourceVisibilities=['Public Rules','GM Only'] as const;
export const sourceMetadataSchema=z.object({title:z.string().trim().min(1).max(200),category:z.enum(sourceCategories),visibility:z.enum(sourceVisibilities).default('GM Only')}).strict();
export type SourceMetadata=z.infer<typeof sourceMetadataSchema>;
export interface SourceDocument extends SourceMetadata {id:string;campaignId:string;originalFilename:string;fileSize:number;pageCount:number|null;processedPages:number;uploadedAt:string;status:'Uploaded'|'Processing'|'Indexed'|'Failed';error:string|null;revision:number}
export interface SourcePassage {chunkId:string;documentId:string;title:string;category:SourceMetadata['category'];startPage:number;endPage:number;sequence:number;text:string;heading:string|null}
export interface SourceCitation {documentId:string;chunkId:string;title:string;startPage:number|null;endPage:number|null;sourceType?:'curated'|'house-rule'|'pdf';sourceReference?:string;overrideApplicable?:boolean;headingPath?:string[]}
export type RulePassage=SourcePassage|CuratedPassage;
export interface RuleRetrieval {selection?:{topics:string[];relatedProcedureApplied:boolean;duplicatesRemoved:number;applicableHouseRule:boolean;omittedPotentialOverride?:boolean};interpretation?:{explanationOnly:boolean;procedureRequested:boolean};requested:boolean;used:boolean;estimatedTokens:number;budgetTokens:number;passages:RulePassage[];notice:string}

export function sourceLabel(source:SourceCitation){if(source.sourceType==='curated'||source.sourceType==='house-rule')return `Source: ${source.title} · ${source.sourceType==='house-rule'?'Campaign House Rule':'Curated Official Rules Summary'}${source.sourceReference?' · Administrator reference: '+source.sourceReference:''}`;return `Source: ${source.title}, PDF p. ${source.startPage}${source.endPage!==source.startPage?'–'+source.endPage:''}`}
