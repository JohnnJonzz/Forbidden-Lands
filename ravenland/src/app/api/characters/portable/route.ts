import {repairWeapon} from '@/server/weapon-repair';
import {mutationDenial} from '@/server/mutation-authority';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {getLocalRepository} from '@/server/sqlite';
import {exportCharacter} from '@/lib/character-portable';
import {importCharacter} from '@/server/campaign-lifecycle';
import {aiBody} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,campaignId=q.get('campaignId')??'',characterId=q.get('characterId')??'';requireCharacterAccess(gameplayPrincipal(request,campaignId,characterId),campaignId,characterId);const ch=getLocalRepository().get(campaignId)?.session.characters.find(c=>c.id===characterId);if(!ch)throw Error('Character not found');return Response.json(exportCharacter(ch),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:(e as Error).message},{status:403});}}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const repo=getLocalRepository(),raw=await aiBody(request),record=raw.operation==='repair_weapon'?repairWeapon(repo,((({operation,...input})=>input)(raw)),gameplayPrincipal(request,raw.campaignId,raw.characterId)):importCharacter(repo,raw);return Response.json({record,campaigns:repo.list()},{status:201});}catch(e){return Response.json({error:(e as Error).message},{status:409});}}
