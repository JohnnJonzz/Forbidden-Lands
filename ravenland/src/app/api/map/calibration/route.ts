import {NextResponse} from 'next/server';
import {getMapStore} from '@/server/map/store';
import {mapBody,mapFailure} from '@/server/map/http';
export const runtime='nodejs';
export async function POST(request:Request){try{return NextResponse.json(getMapStore().calibrate(await mapBody(request)))}catch(e){return mapFailure(e)}}
