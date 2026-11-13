import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {rollGMStatuses} from '@/server/dice/gm-submission';
import {AIError} from '@/server/ai/config';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const campaignId=z.string().uuid().parse(new URL(request.url).searchParams.get('campaignId')),repo=getLocalRepository();if(!repo.get(campaignId))throw new AIError('not_found','Campaign not found',404);return NextResponse.json({submissions:rollGMStatuses(repo,campaignId)},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
