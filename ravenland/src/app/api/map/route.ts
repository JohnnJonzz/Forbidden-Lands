import {NextResponse} from 'next/server';
import {getMapStore} from '@/server/map/store';
import {mapFailure} from '@/server/map/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const id=new URL(request.url).searchParams.get('campaignId');if(!id)return NextResponse.json({error:'Campaign ID required'},{status:400});return NextResponse.json(getMapStore().publicMap(id),{headers:{'Cache-Control':'no-store'}})}catch(e){return mapFailure(e)}}
