import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {AIService} from '@/server/ai/service';
import {aiBody,aiFailure} from '@/server/ai/http';
import {AIError} from '@/server/ai/config';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,campaignId=z.string().uuid().parse(p.get('campaignId')),requestId=z.string().uuid().parse(p.get('requestId')),row=getLocalRepository().db.prepare("SELECT response_json FROM ai_requests WHERE campaign_id=? AND id=? AND status='completed'").get(campaignId,requestId);if(!row)throw new AIError('not_found','GM reply not found',404);return NextResponse.json({reply:JSON.parse(row.response_json as string).reply},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const c=z.object({campaignId:z.string().uuid(),requestId:z.string().uuid(),index:z.number().int().min(0).max(3),confirmed:z.literal(true)}).strict().parse(await aiBody(request));return NextResponse.json(new AIService().confirmAction(c.campaignId,c.requestId,c.index))}catch(e){return aiFailure(e)}}
