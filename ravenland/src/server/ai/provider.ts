import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {gmOutputSchema,type GMOutput} from '../../lib/ai/schema';
import {narrationPrefix} from '../../lib/ai/stream';
import {AIError,serverAIConfig} from './config';
import {gmInstructions,instructionVersion} from './instructions-v1';
import {defaultGMInstructions} from './default-instructions';
export interface ProviderResult {output:GMOutput;inputTokens:number|null;outputTokens:number|null;model:string;provider:'openai'|'mock'|'application'}
export interface GMProvider {generate(input:unknown,settings:{style:string;autonomy:string;instructions?:string},onText:(text:string)=>void):Promise<ProviderResult>;test():Promise<{inputTokens:number|null;outputTokens:number|null;model:string}>}
// Tests inject an SDK client/fetch transport; production uses only OPENAI_API_KEY
// and the official API endpoint. There is no browser-controlled base URL.
export class OpenAIProvider implements GMProvider {
 constructor(private readonly suppliedClient?:OpenAI){}
 private client(){if(this.suppliedClient)return this.suppliedClient;if(!process.env.OPENAI_API_KEY)throw new AIError('missing_key','OPENAI_API_KEY is missing. Add it to the server .env.local and restart.',503);return new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:serverAIConfig().timeoutMs,logLevel:'off'})}
 async generate(input:unknown,settings:{style:string;autonomy:string;instructions?:string},onText:(text:string)=>void):Promise<ProviderResult>{const config=serverAIConfig(),client=this.client();let text='',lastNarration='',final:OpenAI.Responses.Response|undefined;
  const stream=await client.responses.create({model:config.model,instructions:gmInstructions+`\nProtected instruction version: ${instructionVersion}.`,input:[{role:'developer',content:[{type:'input_text',text:(settings.instructions??defaultGMInstructions)+`\nCampaign narration preference: ${settings.style}. Autonomy: ${settings.autonomy}. Guided mode offers meaningful player choices and clarifications when needed; neither mode delegates ordinary GM duties to the administrator. Autonomous Narrative may take more narrative initiative. Both modes retain all protected application boundaries.`}]},{role:'user',content:[{type:'input_text',text:JSON.stringify(input)}]}],text:{format:zodTextFormat(gmOutputSchema,'ravenland_gm_turn')},max_output_tokens:config.maxOutputTokens,stream:true,store:false},{signal:AbortSignal.timeout(config.timeoutMs)});
  for await(const event of stream){if(event.type==='response.output_text.delta'){text+=event.delta;const prefix=narrationPrefix(text);if(prefix&&prefix!==lastNarration){lastNarration=prefix;onText(prefix)}}else if(event.type==='response.completed')final=event.response;else if(event.type==='response.failed'||event.type==='response.incomplete'){const error=new AIError('incomplete','The AI did not complete a valid reply. Retry or adjust the server response limit.',502);error.usage={inputTokens:event.response.usage?.input_tokens??null,outputTokens:event.response.usage?.output_tokens??null,model:event.response.model};throw error}else if(event.type==='error')throw new AIError('provider_error','OpenAI could not complete this request.',502)}
  if(!final||final.status!=='completed')throw new AIError('incomplete','The AI stream ended before completion. Retry this request.',502);
  let output:GMOutput;try{output=gmOutputSchema.parse(JSON.parse(text))}catch{const error=new AIError('invalid_output','The AI response did not pass validation. No proposals or actions were applied.',502);error.usage={inputTokens:final.usage?.input_tokens??null,outputTokens:final.usage?.output_tokens??null,model:final.model};throw error}return {output,inputTokens:final.usage?.input_tokens??null,outputTokens:final.usage?.output_tokens??null,model:final.model,provider:'openai'};
 }
 async test(){const config=serverAIConfig(),response=await this.client().responses.create({model:config.model,input:'Reply with OK only. This is a connectivity test.',max_output_tokens:32,store:false},{signal:AbortSignal.timeout(config.timeoutMs)});if(response.status!=='completed')throw new AIError('connection','OpenAI connection did not return a completed response',502);return {inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null,model:response.model}}
}
