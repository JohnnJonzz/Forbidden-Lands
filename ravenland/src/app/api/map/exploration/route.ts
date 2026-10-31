import {NextResponse} from 'next/server';
import {executeExploration} from '@/server/map/exploration';
import {mapBody,mapFailure} from '@/server/map/http';
export const runtime='nodejs';
export async function POST(request:Request){try{return NextResponse.json(executeExploration(await mapBody(request)))}catch(e){return mapFailure(e)}}
