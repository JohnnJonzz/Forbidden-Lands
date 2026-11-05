import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {aiRecaps,saveRecap,aiConfig} from '@/server/ai/store';
import {aiBody,aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const id=z.string().uuid().parse(new URL(request.url).searchParams.get('campaignId')),repo=getLocalRepository();aiConfig(repo,id);return NextResponse.json({recaps:aiRecaps(repo,id)},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const c=z.object({campaignId:z.string().uuid(),id:z.string().uuid(),revision:z.number().int().positive(),text:z.string().trim().min(1).max(18000),confirmed:z.literal(true)}).strict().parse(await aiBody(request));return NextResponse.json({journalEntryId:saveRecap(getLocalRepository(),c.campaignId,c.id,c.revision,c.text)})}catch(e){return aiFailure(e)}}
