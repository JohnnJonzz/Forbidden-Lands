import type {AIStage} from './diagnostics';
import {timingSafeEqual} from 'node:crypto';
import type {AISettings} from '../../lib/ai/schema';
export class AIError extends Error {requestId?:string;stage?:AIStage;upstreamStatus?:number;usage?:{inputTokens:number|null;outputTokens:number|null;model:string};constructor(readonly code:string,message:string,readonly status=400){super(message)}}
const bounded=(value:string|undefined,fallback:number,min:number,max:number)=>Math.max(min,Math.min(max,Number(value)||fallback));
export function serverAIConfig(){return {provider:(process.env.RAVENLAND_AI_MODE==='mock'||!process.env.OPENAI_API_KEY&&process.env.RAVENLAND_AI_MODE!=='openai'?'mock':'openai') as 'mock'|'openai',model:process.env.OPENAI_MODEL||'gpt-4.1-mini',maxOutputTokens:bounded(process.env.OPENAI_MAX_OUTPUT_TOKENS,2400,256,8192),timeoutMs:bounded(process.env.OPENAI_TIMEOUT_MS,90000,1000,120000),configured:!!process.env.OPENAI_API_KEY}}
export const defaultAISettings:AISettings={style:'Balanced',autonomy:'Guided'};
export function requireGM(token:string|null|undefined){const configured=process.env.RAVENLAND_GM_REVIEW_TOKEN;if(!configured||configured.length<24)throw new AIError('gm_disabled','Privileged review is disabled. Configure a server-side RAVENLAND_GM_REVIEW_TOKEN of at least 24 characters.',403);const a=Buffer.from(configured),b=Buffer.from(token??'');if(a.length!==b.length||!timingSafeEqual(a,b))throw new AIError('forbidden','Privileged development GM access required.',403)}
export function isGM(token:string|null|undefined){try{requireGM(token);return true}catch{return false}}
export function publicAIError(error:unknown):AIError {if(error instanceof AIError)return error;const e=error as {status?:number;name?:string;code?:string};let safe:AIError;
 if(e?.status===401||e?.status===403)safe=new AIError('credentials','API configuration error: OpenAI rejected the server credentials or model access. Check .env.local.',502);
 else if(e?.status===429)safe=new AIError('rate_limit','OpenAI rate limit or quota reached. Wait, then retry the same request.',429);
 else if(e?.name?.includes('Timeout')||['AbortError','APIUserAbortError'].includes(e?.name??''))safe=new AIError('timeout','OpenAI request timed out. Retry the existing request.',504);
 else if(e?.status===400&&e?.code==='context_length_exceeded')safe=new AIError('input_limit','OpenAI input context limit reached. Ask the administrator to review request diagnostics.',502);
 else if([400,404,422].includes(e?.status??0))safe=new AIError('configuration','API configuration error: OpenAI rejected the model or request configuration.',502);
 else if(e?.status&&e.status>=500)safe=new AIError('upstream_unavailable','OpenAI is temporarily unavailable. Retry the same request.',502);
 else if(['APIConnectionError','APIError'].includes(e?.name??''))safe=new AIError('api_error','OpenAI API request failed. Retry the existing request.',502);
 else safe=new AIError('unexpected','Unexpected server error. Retry the same request; ask the administrator to check its identifier.',500);
 if(typeof e?.status==='number'&&e.status>=100&&e.status<=599)safe.upstreamStatus=e.status;return safe;
}
export function stagedAIError(error:unknown,stage:AIStage){const mapped=publicAIError(error);if(error instanceof AIError||stage==='api'){mapped.stage??=stage;return mapped}const safe=stage==='retrieval'?new AIError('retrieval_failed','Rules retrieval failed. Ask the administrator to check the library and request identifier.',500):stage==='processing'?new AIError('processing_failed','AI response processing failed. Retry the existing request.',502):stage==='prompt'?new AIError('configuration','API configuration error while preparing the AI request.',500):mapped;safe.stage=stage;return safe}
export function requestErrorMessage(error:AIError){return error.message+(error.requestId?` Request ID: ${error.requestId}`:'')}

export function estimatedCost(input:number|null,output:number|null){const a=process.env.OPENAI_INPUT_USD_PER_MILLION,b=process.env.OPENAI_OUTPUT_USD_PER_MILLION;if(!a||!b||input===null||output===null||!Number.isFinite(Number(a))||!Number.isFinite(Number(b))||Number(a)<0||Number(b)<0)return null;return (input*Number(a)+output*Number(b))/1_000_000}
