import {mutationDenial} from '@/server/mutation-authority';
import {consequenceReceipt} from '@/server/consequences/service';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {AIService} from '@/server/ai/service';
import {aiBody,aiFailure} from '@/server/ai/http';
import {AIError} from '@/server/ai/config';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,campaignId=z.string().uuid().parse(p.get('campaignId')),requestId=z.string().uuid().parse(p.get('requestId')),row=getLocalRepository().db.prepare("SELECT response_json FROM ai_requests WHERE campaign_id=? AND id=? AND status='completed'").get(campaignId,requestId);if(!row)throw new AIError('not_found','GM reply not found',404);const reply=JSON.parse(row.response_json as string).reply,record=getLocalRepository().get(campaignId),obsolete=reply.actions.map((a:{entryId?:string;type:string})=>!!a.entryId&&!!record?.session.chatJourney?.updates.some(u=>u.entryId===a.entryId&&u.kind==='completed'));return NextResponse.json({reply,obsolete},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const c=z.object({campaignId:z.string().uuid(),requestId:z.string().uuid(),index:z.number().int().min(0).max(3),confirmed:z.literal(true)}).strict().parse(await aiBody(request));return NextResponse.json(confirmProposedAction(request,c))}catch(e){return aiFailure(e)}}

function confirmProposedAction(request:Request,c:{campaignId:string;requestId:string;index:number}){const repo=getLocalRepository(),row=repo.db.prepare('SELECT payload FROM ai_requests WHERE campaign_id=? AND id=?').get(c.campaignId,c.requestId),actor=row?JSON.parse(row.payload as string).characterId:undefined;const principal=gameplayPrincipal(request,c.campaignId,actor);requireCharacterAccess(principal,c.campaignId,actor);const result=new AIService(repo,undefined,principal).confirmAction(c.campaignId,c.requestId,c.index);return 'consequence' in result?consequenceReceipt(result):result;}
