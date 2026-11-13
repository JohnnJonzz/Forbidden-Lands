import {NextResponse} from 'next/server';
import {prepareAction,preparationSchema} from '@/server/action-preparation';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {getLocalRepository} from '@/server/sqlite';
import {aiBody,aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=preparationSchema.parse(await aiBody(request)),principal=gameplayPrincipal(request,input.campaignId,input.characterId);requireCharacterAccess(principal,input.campaignId,input.characterId);return NextResponse.json({preparation:prepareAction(getLocalRepository(),input,principal)},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
