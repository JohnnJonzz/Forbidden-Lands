import {performance} from 'node:perf_hooks';
export type AIStage='claim'|'retrieval'|'prompt'|'api'|'processing'|'persistence';
export interface ProviderDiagnostics {stage?:AIStage;estimatedInputTokens?:number;responseStatus?:'completed'|'incomplete'|'failed'|'error'|'interrupted';upstreamStatus?:number;incompleteReason?:'max_output_tokens'|'content_filter'|'other';outputCharacters?:number;providerRequestId?:string}
export interface RequestDiagnostics extends ProviderDiagnostics {event:'ravenland.ai.request';requestId:string;model:string;attempt:number;outcome:'completed'|'failed'|'replayed';stage:AIStage;durationMs:number;retrievalMs:number;apiMs:number;processingMs:number;passages:number;estimatedRetrievalTokens:number;timeoutMs:number;maxOutputTokens:number;timedOut:boolean;errorCategory?:string;failureRecordingFailed?:boolean}
export class AIRequestDiagnostics {
 readonly started=performance.now();private stageStarted=this.started;
 readonly data:RequestDiagnostics;
 constructor(requestId:string,config:{model:string;timeoutMs:number;maxOutputTokens:number}){this.data={event:'ravenland.ai.request',requestId,model:/^[\w.:/-]{1,120}$/.test(config.model)&&!/^sk-/i.test(config.model)&&config.model!==process.env.OPENAI_API_KEY?config.model:'invalid_model_identifier',attempt:0,outcome:'failed',stage:'claim',durationMs:0,retrievalMs:0,apiMs:0,processingMs:0,passages:0,estimatedRetrievalTokens:0,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,timedOut:false}}
 stage(stage:AIStage){this.accrue();this.data.stage=stage}
 private accrue(){const now=performance.now(),elapsed=now-this.stageStarted;if(this.data.stage==='retrieval')this.data.retrievalMs+=elapsed;if(this.data.stage==='api')this.data.apiMs+=elapsed;if(this.data.stage==='processing')this.data.processingMs+=elapsed;this.stageStarted=now}
 provider=(patch:ProviderDiagnostics)=>{if(patch.stage)this.stage(patch.stage);Object.assign(this.data,patch)};
 finish(){this.accrue();this.data.durationMs=performance.now()-this.started;for(const key of ['durationMs','retrievalMs','apiMs','processingMs'] as const)this.data[key]=Math.round(this.data[key]);try{console.info(JSON.stringify(this.data))}catch{/* Logging must never fail a game request. */}}
}
