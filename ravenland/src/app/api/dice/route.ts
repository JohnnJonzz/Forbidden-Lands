import {gameplayPrincipal} from '@/server/character-access';
import {diceCommandSchema} from '@/lib/dice/schema';
import {getLocalRepository} from '@/server/sqlite';
import {NextResponse} from 'next/server';
import {executeDice} from '@/server/dice/service';
import {mapBody} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){try{return NextResponse.json({...executeDiceCommand(request,await mapBody(request)),campaigns:await getRepository().list()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Dice operation failed'},{status:400})}}

function executeDiceCommand(request:Request,raw:unknown){const c=diceCommandSchema.parse(raw),repo=getLocalRepository(),actor=c.type==='create'?c.roll.characterId:'rollId' in c?repo.get(c.campaignId)?.session.dice?.find(d=>d.id===c.rollId)?.characterId:undefined;return executeDice(c,repo,gameplayPrincipal(request,c.campaignId,actor));}
