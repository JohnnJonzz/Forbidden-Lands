import {AIError} from '@/server/ai/config';
import {JourneyInputError} from '@/server/journey/service';
import {afterNarrativeDice} from '@/server/narrative/journey';
import {mutationDenial} from '@/server/mutation-authority';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {diceCommandSchema} from '@/lib/dice/schema';
import {getLocalRepository} from '@/server/sqlite';
import {NextResponse} from 'next/server';
import {executeDice} from '@/server/dice/service';
import {mapBody} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{return NextResponse.json({...executeDiceCommand(request,await mapBody(request)),campaigns:await getRepository().list()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Dice operation failed'},{status:400})}}

function executeDiceCommand(request:Request,raw:unknown){const c=diceCommandSchema.parse(raw),repo=getLocalRepository(),actor=c.type==='create'?c.roll.characterId:'rollId' in c?repo.get(c.campaignId)?.session.dice?.find(d=>d.id===c.rollId)?.characterId:undefined;const actualActor=actor??('actorId' in c?c.actorId:undefined),principal=gameplayPrincipal(request,c.campaignId,actualActor);requireCharacterAccess(principal,c.campaignId,actualActor??'');if(actor&&'actorId' in c&&c.actorId!==actor)requireCharacterAccess(principal,c.campaignId,c.actorId);const result=executeDice(c,repo,principal);let narrativeError:string|null=null;try{if(c.type==='create'||c.type==='push')afterNarrativeDice(repo,c.campaignId,principal,c.type==='create'?c.roll.id:c.rollId);}catch(error){narrativeError=error instanceof AIError||error instanceof JourneyInputError?error.message:'Your roll is saved. Travel has paused; continue in chat to review the next step.';const current=repo.get(c.campaignId)!,messageId='narrative-hold:'+c.actionId;if(!current.session.messages.some(m=>m.id===messageId)){current.session.messages.push({id:messageId,role:'gm',author:'Game Master',text:narrativeError,provider:'application'});repo.update(current.id,current.revision,current.session);}}return {...result,record:repo.get(c.campaignId)!,narrativeError};}
