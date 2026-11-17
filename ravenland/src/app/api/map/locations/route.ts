import {mutationDenial} from '@/server/mutation-authority';
import {NextResponse} from 'next/server';
import {executeLocation} from '@/server/map/locations';
import {mapBody,mapFailure} from '@/server/map/http';
export const runtime='nodejs';
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{return NextResponse.json(executeLocation(await mapBody(request)))}catch(e){return mapFailure(e)}}
