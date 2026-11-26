import {isTrustedLocalRequest} from '@/server/local-play';
import {NextResponse} from 'next/server';
import {journeyStatus} from '@/server/journey/status';
import {getLocalRepository} from '@/server/sqlite';
import {requireMapAccess} from '@/server/map/exploration';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const id=new URL(request.url).searchParams.get('campaignId')??'',repo=getLocalRepository();requireMapAccess(id,'player',repo);return NextResponse.json(journeyStatus(repo,id,isTrustedLocalRequest(request)))}catch(e){return aiFailure(e)}}
