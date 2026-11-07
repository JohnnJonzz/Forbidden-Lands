import {randomUUID} from 'node:crypto';
import {gmTurnSchema,type GMStreamEvent} from '@/lib/ai/schema';
import {AIService} from '@/server/ai/service';
import {AIRequestDiagnostics} from '@/server/ai/diagnostics';
import {aiBody,aiFailure} from '@/server/ai/http';
import {publicAIError,requestErrorMessage,serverAIConfig} from '@/server/ai/config';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request){let requestId:string=randomUUID();
 try{const raw=await aiBody(request),candidate=gmTurnSchema.shape.requestId.safeParse(raw?.requestId);if(candidate.success)requestId=candidate.data;const input=gmTurnSchema.parse(raw),encoder=new TextEncoder();let closed=false;
 const stream=new ReadableStream({start(controller){const emit=(event:GMStreamEvent)=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'))}catch{closed=true}};
  void Promise.resolve().then(()=>new AIService().run(input,emit)).catch(error=>{const safe=publicAIError(error);if(!safe.requestId){const d=new AIRequestDiagnostics(requestId,serverAIConfig());d.data.errorCategory=safe.code;d.finish()}safe.requestId=requestId;emit({type:'error',error:requestErrorMessage(safe),code:safe.code,requestId})}).finally(()=>{if(!closed){closed=true;controller.close()}})
 },cancel(){closed=true}});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Request-ID':requestId}})
 }catch(e){const response=aiFailure(e),d=new AIRequestDiagnostics(requestId,serverAIConfig());d.data.errorCategory=response.status===400?'validation':'unexpected';d.finish();response.headers.set('X-Request-ID',requestId);return response}
}
