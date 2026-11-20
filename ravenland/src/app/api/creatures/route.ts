import {privateCharacterRecord} from '@/server/creatures/context';
import {NextResponse} from 'next/server';
import {getLocalRepository} from '@/server/sqlite';
import {creatureCommand,executeCreature} from '@/server/creatures/service';
import {gameplayPrincipal} from '@/server/character-access';
import {mutationDenial} from '@/server/mutation-authority';
import {aiBody,aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const c=creatureCommand.parse(await aiBody(request,5_000_000));const result=executeCreature(getLocalRepository(),c,gameplayPrincipal(request,c.campaignId,c.characterId));return NextResponse.json({...result,record:privateCharacterRecord(request,result.record!)});}catch(e){return aiFailure(e)}}
