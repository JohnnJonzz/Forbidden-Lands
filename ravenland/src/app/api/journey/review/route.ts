import {NextResponse} from 'next/server';
import {reviewQuarter} from '@/server/journey/review';
import {getLocalRepository} from '@/server/sqlite';
import {isTrustedLocalRequest} from '@/server/local-play';
import {aiFailure} from '@/server/ai/http';
import {AIError} from '@/server/ai/config';
export const runtime='nodejs';
export async function GET(request:Request){try{if(!isTrustedLocalRequest(request))throw new AIError('controller','Quarter-day review requires the local controller.',403);const q=new URL(request.url).searchParams;return NextResponse.json(reviewQuarter(getLocalRepository(),q.get('campaignId')??'',q.get('entryId')??''))}catch(e){return aiFailure(e)}}
