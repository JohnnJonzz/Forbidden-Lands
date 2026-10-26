import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getMapStore} from '@/server/map/store';
import {mapBody,mapFailure} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){try{const data=z.object({campaignId:z.string().uuid(),revision:z.number().int().positive(),from:z.string().min(1).max(50),to:z.string().min(1).max(50),confirmed:z.literal(true)}).strict().parse(await mapBody(request));const record=getMapStore().travel(data.campaignId,data.revision,data.from,data.to);return NextResponse.json({record,campaigns:await getRepository().list()})}catch(e){return mapFailure(e)}}
