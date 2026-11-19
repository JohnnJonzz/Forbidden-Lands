import {NextResponse} from 'next/server';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {nextRequiredAction} from '@/server/next-action';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,id=q.get('campaignId')??'',actor=q.get('characterId')??'',principal=gameplayPrincipal(request,id,actor);requireCharacterAccess(principal,id,actor);return NextResponse.json(nextRequiredAction(getLocalRepository(),id,principal),{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
