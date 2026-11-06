import {z} from 'zod';
export const sourceCategories=['Rules','Bestiary','Adventure','Campaign Reference','House Rules','Other'] as const;
export const sourceVisibilities=['Public Rules','GM Only'] as const;
export const sourceMetadataSchema=z.object({title:z.string().trim().min(1).max(200),category:z.enum(sourceCategories),visibility:z.enum(sourceVisibilities).default('GM Only')}).strict();
export type SourceMetadata=z.infer<typeof sourceMetadataSchema>;
export interface SourceDocument extends SourceMetadata {id:string;campaignId:string;originalFilename:string;fileSize:number;pageCount:number|null;processedPages:number;uploadedAt:string;status:'Uploaded'|'Processing'|'Indexed'|'Failed';error:string|null;revision:number}
export interface SourcePassage {chunkId:string;documentId:string;title:string;category:SourceMetadata['category'];startPage:number;endPage:number;sequence:number;text:string;heading:string|null}
export interface SourceCitation {documentId:string;chunkId:string;title:string;startPage:number;endPage:number}
export interface RuleRetrieval {requested:boolean;used:boolean;estimatedTokens:number;budgetTokens:number;passages:SourcePassage[];notice:string}
