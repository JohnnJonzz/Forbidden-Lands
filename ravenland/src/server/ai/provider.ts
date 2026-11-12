import {combatProseSchema,type CombatProse} from '../combat/narrative';
import {z} from 'zod';
import type {CombatChooser} from '../combat/service';
import type {ProviderDiagnostics} from './diagnostics';
import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {gmOutputSchema,type GMOutput} from '../../lib/ai/schema';
import {narrationPrefix} from '../../lib/ai/stream';
import {AIError,serverAIConfig,publicAIError} from './config';
import {gmInstructions,instructionVersion} from './instructions-v1';
import {defaultGMInstructions} from './default-instructions';
export interface ProviderResult {combatProse?:CombatProse;output:GMOutput;inputTokens:number|null;outputTokens:number|null;model:string;provider:'openai'|'mock'|'application'}
export interface GMProvider {narrateCombat?:(input:unknown,settings:{style:string;autonomy:string;instructions?:string;onDiagnostics?:(patch:ProviderDiagnostics)=>void})=>Promise<ProviderResult>;chooseCombat?:CombatChooser;generate(input:unknown,settings:{style:string;autonomy:string;instructions?:string;onDiagnostics?:(patch:ProviderDiagnostics)=>void},onText:(text:string)=>void):Promise<ProviderResult>;test():Promise<{inputTokens:number|null;outputTokens:number|null;model:string}>}
// Tests inject an SDK client/fetch transport; production uses only OPENAI_API_KEY
// and the official API endpoint. There is no browser-controlled base URL.
export class OpenAIProvider implements GMProvider {
 constructor(private readonly suppliedClient?:OpenAI){}
 private client(){if(this.suppliedClient)return this.suppliedClient;if(!process.env.OPENAI_API_KEY)throw new AIError('missing_key','OPENAI_API_KEY is missing. Add it to the server .env.local and restart.',503);return new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:serverAIConfig().timeoutMs,logLevel:'off'})}
 async chooseCombat(input:Parameters<CombatChooser>[0]){
  const config=serverAIConfig(),schema=z.object({choiceId:z.string()}).strict();
  const response=await this.client().responses.create({model:config.model,instructions:'You control only the active Forbidden Lands enemy. Choose exactly one choiceId from the application-provided legal choices. Never invent an action, statistic, roll, target, damage or outcome. Monster attack tables are rolled by the server. Return only the structured choice.',input:JSON.stringify(input),text:{format:zodTextFormat(schema,'combat_decision')},max_output_tokens:256,store:false},{signal:AbortSignal.timeout(Math.min(config.timeoutMs,15000))});
  if(response.status!=='completed')throw new AIError('combat_decision','The GM combat decision did not complete. Retry the same request; no dice were rolled.',502);
  let decision:z.infer<typeof schema>;try{decision=schema.parse(JSON.parse(response.output_text??response.output.flatMap(item=>item.type==='message'?item.content.flatMap(part=>part.type==='output_text'?[part.text]:[]):[]).join('')))}catch{const error=new AIError('invalid_output','AI combat decision processing failed. No enemy dice or state changes were applied.',502);error.stage='processing';error.usage={inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null,model:response.model};throw error}return {...decision,inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null,model:response.model};
 }
 async narrateCombat(input:unknown,settings:{style:string;autonomy:string;instructions?:string;onDiagnostics?:(patch:ProviderDiagnostics)=>void}):Promise<ProviderResult>{
  const config=serverAIConfig(),report=settings.onDiagnostics??(()=>{});
  const instructions=gmInstructions+'\nFor this request the combat_narration schema replaces the ordinary GM output schema: return beats only. Narrate only the supplied verified combat events. Return one short beat per eventId. The application appends the next player prompt. Do not choose player actions, request another attack roll, change state, add reinforcements or invent canon. Match the confirmed encounter location and scene description; those override stale scene narration. Never place absentCharacters in this scene or add combatants not in verifiedCombat.combatants. Use the recorded attack.weapon and structured attack/push fields; never infer a dagger, damage or Willpower from a generic Melee label. Match current scene and approved NPC personalities. Bystanders may speak without joining initiative. An attempt is not an outcome. Unresolved attacks cannot hit, wound, displace or defeat anyone. Broken is not dead. A miss grants no mechanical advantage. Never expose hidden enemy attributes or sourcebook text. Keep numbers and dice breakdowns in the combat panel. No new memory proposals or quarter-day prompts. Do not use an event as a pretext to resolve another event.\n'+(settings.instructions??defaultGMInstructions)+'\nNarration style: '+settings.style;
  const body={model:config.model,instructions,input:JSON.stringify(input),text:{format:zodTextFormat(combatProseSchema,'combat_narration')},max_output_tokens:Math.min(config.maxOutputTokens,1600),store:false};
  report({stage:'api',estimatedInputTokens:Math.ceil(Buffer.byteLength(JSON.stringify(body))/3)});
  const response=await this.client().responses.create(body,{signal:AbortSignal.timeout(Math.min(config.timeoutMs,90000))});
  const usage={inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null,model:response.model};
  if(response.status!=='completed'){const error=new AIError('incomplete','Combat narration did not complete. Retry the same request; its verified combat results are saved.',502);error.usage=usage;throw error}
  let prose:CombatProse;try{prose=combatProseSchema.parse(JSON.parse(response.output_text??response.output.flatMap(item=>item.type==='message'?item.content.flatMap(part=>part.type==='output_text'?[part.text]:[]):[]).join('')))}catch{const error=new AIError('invalid_output','Combat narration failed validation. Retry the same request; no dice will be rerolled.',502);error.stage='processing';error.usage=usage;throw error}
  report({stage:'processing',responseStatus:'completed'});
  return {...usage,provider:'openai',combatProse:prose,output:{narration:'',memoryProposals:[],actions:[],selectedImageId:null}};
 }
 async generate(input:unknown,settings:{style:string;autonomy:string;instructions?:string;onDiagnostics?:(patch:ProviderDiagnostics)=>void},onText:(text:string)=>void):Promise<ProviderResult>{
  const config=serverAIConfig(),report=settings.onDiagnostics??(()=>{}),signal=AbortSignal.timeout(config.timeoutMs);let text='',lastNarration='',final:OpenAI.Responses.Response|undefined,phase:'prompt'|'api'|'processing'='prompt';
  try {
   report({stage:'prompt'});
   const body={model:config.model,instructions:gmInstructions+`\nProtected instruction version: ${instructionVersion}.`,input:[{role:'developer' as const,content:[{type:'input_text' as const,text:(settings.instructions??defaultGMInstructions)+`\nCampaign narration preference: ${settings.style}. Autonomy: ${settings.autonomy}. Guided mode offers meaningful player choices and clarifications when needed; neither mode delegates ordinary GM duties to the administrator. Autonomous Narrative may take more narrative initiative. Both modes retain all protected application boundaries.`}]},{role:'user' as const,content:[{type:'input_text' as const,text:JSON.stringify(input)}]}],text:{format:zodTextFormat(gmOutputSchema,'ravenland_gm_turn')},max_output_tokens:config.maxOutputTokens,stream:true as const,store:false};
   report({estimatedInputTokens:Math.ceil(Buffer.byteLength(JSON.stringify(body))/3)});const client=this.client();phase='api';report({stage:'api'});
   const stream=await client.responses.create(body,{signal});
   for await(const event of stream){
    if(event.type==='response.output_text.delta'){text+=event.delta;if(text.length>262144)throw new AIError('invalid_output','AI response processing failed: response exceeded the safe output size.',502);const prefix=narrationPrefix(text);if(prefix&&prefix!==lastNarration){lastNarration=prefix;onText(prefix)}}
    else if(event.type==='response.completed'){final=event.response;report({responseStatus:'completed'})}
    else if(event.type==='response.failed'||event.type==='response.incomplete'){
     const reason=event.response.incomplete_details?.reason;report({responseStatus:event.type==='response.failed'?'failed':'incomplete',incompleteReason:reason==='max_output_tokens'||reason==='content_filter'?reason:'other'});
     const error=new AIError(reason==='max_output_tokens'?'output_limit':event.type==='response.failed'?'api_error':'incomplete',reason==='max_output_tokens'?'AI response reached the configured output-token limit. Ask for a shorter response or have the administrator adjust the response budget.':'OpenAI did not complete a valid response. Retry the existing request.',502);error.stage='api';error.usage={inputTokens:event.response.usage?.input_tokens??null,outputTokens:event.response.usage?.output_tokens??null,model:event.response.model};throw error;
    }else if(event.type==='error'){report({responseStatus:'error'});throw new AIError('api_error','OpenAI returned a streaming API error. Retry the existing request.',502)}
   }
   if(signal.aborted)throw new AIError('timeout','OpenAI request timed out. Retry the existing request.',504);
   phase='processing';report({stage:'processing',outputCharacters:text.length});
   if(!final||final.status!=='completed'){report({responseStatus:'interrupted'});throw new AIError('incomplete','AI response processing failed: the stream ended before completion. Retry this request.',502)}
   let output:GMOutput;try{output=gmOutputSchema.parse(JSON.parse(text))}catch{const error=new AIError('invalid_output','AI response processing failed: the response did not pass validation. No proposals or actions were applied.',502);error.usage={inputTokens:final.usage?.input_tokens??null,outputTokens:final.usage?.output_tokens??null,model:final.model};throw error}
   return {output,inputTokens:final.usage?.input_tokens??null,outputTokens:final.usage?.output_tokens??null,model:final.model,provider:'openai'};
  }catch(error){const safe=signal.aborted&&phase==='api'?new AIError('timeout','OpenAI request timed out. Retry the existing request.',504):(phase==='processing'||error instanceof SyntaxError)&&!(error instanceof AIError)?new AIError('processing_failed','AI response processing failed. Retry the existing request.',502):publicAIError(error);safe.stage??=error instanceof SyntaxError?'processing':phase;if(safe.upstreamStatus)report({upstreamStatus:safe.upstreamStatus});if(!final)report({outputCharacters:text.length});throw safe}
 }

 async test(){const config=serverAIConfig(),response=await this.client().responses.create({model:config.model,input:'Reply with OK only. This is a connectivity test.',max_output_tokens:32,store:false},{signal:AbortSignal.timeout(config.timeoutMs)});if(response.status!=='completed')throw new AIError('connection','OpenAI connection did not return a completed response',502);return {inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null,model:response.model}}
}
