import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {assembleContext} from '@/server/ai/context';
import {SqliteMemoryRepository} from '@/server/ai/memory';
import {isGM} from '@/server/ai/config';
import {AIError} from '@/server/ai/config';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,id=z.string().uuid().parse(p.get('campaignId'));const requestId=p.get('requestId'),repo=getLocalRepository();let context:unknown;if(requestId){z.string().uuid().parse(requestId);const row=repo.db.prepare('SELECT context_json FROM ai_requests WHERE campaign_id=? AND id=?').get(id,requestId);if(!row?.context_json)throw new AIError('not_found','Saved request context not found',404);context=JSON.parse(row.context_json as string);if(!isGM(request.headers.get('x-ravenland-gm-token'))){const snapshot=context as {memories?:{id:string}[]};snapshot.memories=snapshot.memories?.filter(m=>!!new SqliteMemoryRepository(repo).get(id,m.id))}}else context=assembleContext(repo,id,(p.get('query')??'').slice(0,3000));return NextResponse.json({context,privateInformation:'GM-only and character-specific memories are excluded from public AI context.'},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
