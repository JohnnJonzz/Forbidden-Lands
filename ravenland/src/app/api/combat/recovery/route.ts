import {NextResponse} from 'next/server';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal} from '@/server/character-access';
import {readRecoveryInspection,executeCombatRecovery,combatRecoveryCommand} from '@/server/combat/administrative-recovery';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,id=q.get('campaignId')??'',actor=q.get('characterId')??'',e=q.get('encounterId')??'';return NextResponse.json(readRecoveryInspection(getLocalRepository(),id,e,actor,gameplayPrincipal(request,id,actor)),{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const c=combatRecoveryCommand.parse(await request.json());return NextResponse.json(executeCombatRecovery(getLocalRepository(),c,gameplayPrincipal(request,c.campaignId,c.characterId)),{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
