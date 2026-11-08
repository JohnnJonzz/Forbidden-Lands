import type {RetrievalPlan} from '../rules/planner';
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
export interface CoverageSubject {topic:string;label:string;status:'covered'|'limited'|'missing';documentIds:string[]}
export type SelectionDecision='selected'|'ranking'|'deduplication'|'token_budget'|'section_limit'|'unrelated';
export interface CandidateDiagnostic {documentId:string;chunkId:string;title:string;sourceType:string;headingPath:string[];score:number|null;subjects:string[];metadataFields?:string[];decision:SelectionDecision}
export interface IndexHealth {id:string;title:string;type:string;sections:number;indexedSections:number;state:'indexed'|'incomplete'|'missing';titleSearchable:boolean;metadataIndexed?:boolean}
export interface RetrievalSearchTrace {stage:'initial'|'targeted';source:'pdf'|'curated';query:string;scope:string;documentIds?:string[];hits:{documentId:string;chunkId:string;physicalPage?:number}[]}
export interface RetrievalAudit {searches?:RetrievalSearchTrace[];documents?:{documentId:string;title:string;sourceType:string;consideredChunks:number;selectedChunks:number;matchedMetadataFields:string[];matchedSections:string[];omittedReasons:SelectionDecision[]}[];availability?:{status:string;documentId?:string}[];candidates:CandidateDiagnostic[];curatedDocuments:{id:string;title:string;consideredSections:number;selectedSections:number;omittedReasons:SelectionDecision[]}[];index:IndexHealth[];candidatesTruncated:boolean}
export interface PlannerDiagnostics {plan:RetrievalPlan;coverage:{id:string;label:string;role:string;status:'covered'|'limited'|'missing';documentIds:string[]}[];missingTopics:string[];targetedRetries:number;retriedRequirements:string[];estimatedContextTokens:number}
export interface RuleRetrieval {planner?:PlannerDiagnostics;audit?:RetrievalAudit;selection?:{topics:string[];relatedProcedureApplied:boolean;duplicatesRemoved:number;applicableHouseRule:boolean;omittedPotentialOverride?:boolean;coverage?:CoverageSubject[]};interpretation?:{explanationOnly:boolean;procedureRequested:boolean};requested:boolean;used:boolean;estimatedTokens:number;budgetTokens:number;passages:RulePassage[];notice:string}

export function sourceLabel(source:SourceCitation){if(source.sourceType==='curated'||source.sourceType==='house-rule')return `Source: ${source.title} · ${source.sourceType==='house-rule'?'Campaign House Rule':'Curated Official Rules Summary'}${source.sourceReference?' · Administrator reference: '+source.sourceReference:''}`;return `Source: ${source.title}, PDF p. ${source.startPage}${source.endPage!==source.startPage?'–'+source.endPage:''}`}
