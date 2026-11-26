import {NextResponse} from 'next/server';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {tableGM} from '@/server/narrative/authority';
import {mutationDenial} from '@/server/mutation-authority';
import {mapBody} from '@/server/map/http';
import {privateCharacterRecord} from '@/server/creatures/context';
import {previewCalendar,applyCalendar,calendarCommand,calendarReceipts} from '@/server/calendar/service';
export const runtime='nodejs';
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,id=q.get('campaignId')??'',actor=q.get('actorId')??'',p=gameplayPrincipal(request,id,actor);requireCharacterAccess(p,id,actor);const repo=getLocalRepository(),isTableGM=tableGM(repo,id,p).isTableGM;return NextResponse.json({isTableGM,receipts:isTableGM?calendarReceipts(repo,id):[]},{headers:{'Cache-Control':'no-store'}})}catch(e){return NextResponse.json({error:(e as Error).message},{status:403})}}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const {action,previewHash,confirmed,...body}=await mapBody(request) as Record<string,unknown>;const c=calendarCommand.parse(body),repo=getLocalRepository(),p=gameplayPrincipal(request,c.campaignId,c.actorId);if(action==='preview'){const {preview,previewHash}=previewCalendar(repo,c,p);return NextResponse.json({preview,previewHash})}if(action!=='apply'||confirmed!==true||typeof previewHash!=='string')throw Error('Review and explicitly confirm the current correction preview.');const result=applyCalendar(repo,c,previewHash,p);return NextResponse.json({...result,record:privateCharacterRecord(request,result.record)});}catch(e){return NextResponse.json({error:(e as Error).message},{status:409})}}
