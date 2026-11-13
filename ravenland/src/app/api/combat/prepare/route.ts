import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal} from '@/server/character-access';
import {attackPreparation,prepareAttack} from '@/server/combat/prepare-attack';
import {aiFailure,aiBody} from '@/server/ai/http';
export const runtime='nodejs';
const scope=z.object({campaignId:z.string().uuid(),characterId:z.string().min(1).max(100)});
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,v=scope.parse(Object.fromEntries(q)),principal=gameplayPrincipal(request,v.campaignId,v.characterId);return NextResponse.json(attackPreparation(getLocalRepository(),v.campaignId,v.characterId,principal),{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const v=scope.extend({requestId:z.string().uuid(),weaponIndex:z.number().int().min(0).max(99),identity:z.string().regex(/^[a-f0-9]{64}$/),targetId:z.string().min(1).max(100),type:z.enum(['slash','stab','shoot'])}).strict().parse(await aiBody(request));return NextResponse.json(await prepareAttack(getLocalRepository(),v,gameplayPrincipal(request,v.campaignId,v.characterId)))}catch(e){return aiFailure(e)}}
