import {NextResponse} from 'next/server';
import {ImageLibrary} from '@/server/images/library';
import {mapBody} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function PATCH(request:Request){try{return NextResponse.json({record:new ImageLibrary().assign(await mapBody(request)),campaigns:await getRepository().list()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Portrait could not be saved'},{status:400})}}
