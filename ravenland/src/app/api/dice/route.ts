import {NextResponse} from 'next/server';
import {executeDice} from '@/server/dice/service';
import {mapBody} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){try{return NextResponse.json({...executeDice(await mapBody(request)),campaigns:await getRepository().list()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Dice operation failed'},{status:400})}}
