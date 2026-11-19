import {mutationDenial} from '@/server/mutation-authority';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {NextResponse} from 'next/server';
import {saveCharacter} from '@/server/character-service';
import {mapBody} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function PATCH(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{return NextResponse.json({record:saveOwnedCharacter(request,await mapBody(request)),campaigns:await getRepository().list()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Character save failed'},{status:409})}}

function saveOwnedCharacter(request:Request,c:{campaignId:string;characterId:string}){requireCharacterAccess(gameplayPrincipal(request,c.campaignId,c.characterId),c.campaignId,c.characterId);return saveCharacter(c)}
