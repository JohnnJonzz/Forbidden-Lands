import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {AIError} from './ai/config';
export interface CharacterPrincipal {playerId:string;grants:{campaignId:string;characterIds:string[]}[]}
const grantsSchema=z.array(z.object({playerId:z.string().min(1).max(100),tokenHash:z.string().regex(/^[a-f0-9]{64}$/),grants:z.array(z.object({campaignId:z.string().uuid(),characterIds:z.array(z.string().min(1).max(100)).min(1).max(100)}).strict()).max(100)}).strict()).max(100).refine(records=>new Set(records.map(record=>record.tokenHash)).size===records.length,'Player credentials must be unique');
export const playerCookie='ravenland_player_access';
export function principalForToken(token:string|null|undefined):CharacterPrincipal|null{
 if(!token||token.length<32||token.length>512)return null;
 let records:z.infer<typeof grantsSchema>;try{records=grantsSchema.parse(JSON.parse(process.env.RAVENLAND_PLAYER_GRANTS??'[]'))}catch{throw new AIError('player_config','Player access configuration requires administrator review.',503)}
 const hash=createHash('sha256').update(token).digest();const match=records.find(r=>timingSafeEqual(hash,Buffer.from(r.tokenHash,'hex')));
 return match?{playerId:match.playerId,grants:match.grants}:null;
}
export function requestPrincipal(request:Request){const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1],cookie=request.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(playerCookie+'='))?.slice(playerCookie.length+1);return principalForToken(bearer??cookie)}
export function mayReadCharacter(principal:CharacterPrincipal|null|undefined,campaignId:string,characterId:string){return !!principal?.grants.some(g=>g.campaignId===campaignId&&g.characterIds.includes(characterId))}
export function requireCharacterAccess(principal:CharacterPrincipal|null|undefined,campaignId:string,characterId:string){if(!principal)throw new AIError('player_authentication','Connect player access before preparing an action.',401);if(!mayReadCharacter(principal,campaignId,characterId))throw new AIError('character_forbidden','This player is not authorized for that campaign character.',403)}
