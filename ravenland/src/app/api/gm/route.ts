import {gmTurnSchema,type GMStreamEvent} from '@/lib/ai/schema';
import {AIService} from '@/server/ai/service';
import {aiBody,aiFailure} from '@/server/ai/http';
import {publicAIError} from '@/server/ai/config';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request){try{const input=gmTurnSchema.parse(await aiBody(request)),encoder=new TextEncoder();let closed=false;const stream=new ReadableStream({start(controller){const emit=(event:GMStreamEvent)=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'))}catch{closed=true}};void new AIService().run(input,emit).catch(error=>{const safe=publicAIError(error);emit({type:'error',error:safe.message,code:safe.code})}).finally(()=>{if(!closed){closed=true;controller.close()}})},cancel(){closed=true}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}})}catch(e){return aiFailure(e)}}
