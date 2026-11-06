import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {requireGM} from '@/server/ai/config';
import {aiBody,aiFailure} from '@/server/ai/http';
import {changeGMInstructions,readGMInstructions} from '@/server/ai/instructions';
export const runtime='nodejs';
const privateHeaders={'Cache-Control':'private, no-store','Vary':'x-ravenland-gm-token'};
export async function GET(request:Request){try{
 requireGM(request.headers.get('x-ravenland-gm-token'));
 const campaignId=z.string().uuid().parse(new URL(request.url).searchParams.get('campaignId'));
 return NextResponse.json(readGMInstructions(getLocalRepository(),campaignId),{headers:privateHeaders});
}catch(error){const response=aiFailure(error);response.headers.set('Cache-Control','private, no-store');return response}}
export async function POST(request:Request){try{
 requireGM(request.headers.get('x-ravenland-gm-token'));
 const command=await aiBody(request,512000);
 return NextResponse.json(changeGMInstructions(getLocalRepository(),command),{headers:privateHeaders});
}catch(error){const response=aiFailure(error);response.headers.set('Cache-Control','private, no-store');return response}}
