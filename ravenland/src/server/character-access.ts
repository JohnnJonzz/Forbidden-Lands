import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {AIError} from './ai/config';
export interface CharacterPrincipal {playerId:string;grants:{campaignId:string;characterIds:string[]}[]}
const grantsSchema=z.array(z.object({playerId:z.string().min(1).max(100),tokenHash:z.string().regex(/^[a-f0-9]{64}$/),grants:z.array(z.object({campaignId:z.string().uuid(),characterIds:z.array(z.string().min(1).max(100)).min(1).max(100)}).strict()).max(100)}).strict()).max(100).refine(records=>new Set(records.map(record=>record.tokenHash)).size===records.length,'Player credentials must be unique');
export const playerCookie='ravenland_player_access';
function configuredGrants(){try{return grantsSchema.parse(JSON.parse(process.env.RAVENLAND_PLAYER_GRANTS?.trim()||'[]'))}catch{throw new AIError('player_config','Player access configuration requires administrator review. Check RAVENLAND_PLAYER_GRANTS on the server.',503)}}
export function playerAccessConfigured(){return configuredGrants().some(record=>record.grants.some(grant=>grant.characterIds.length>0))}
export function principalForToken(token:string|null|undefined):CharacterPrincipal|null{
 if(!token||token.length<32||token.length>512)return null;
 const records=configuredGrants();
 const hash=createHash('sha256').update(token).digest();const match=records.find(r=>timingSafeEqual(hash,Buffer.from(r.tokenHash,'hex')));
 return match?{playerId:match.playerId,grants:match.grants}:null;
}
export function requestPrincipal(request:Request){const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1],cookie=request.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(playerCookie+'='))?.slice(playerCookie.length+1);return principalForToken(bearer??cookie)}
export function mayReadCharacter(principal:CharacterPrincipal|null|undefined,campaignId:string,characterId:string){return !!principal?.grants.some(g=>g.campaignId===campaignId&&g.characterIds.includes(characterId))}
export function requireCharacterAccess(principal:CharacterPrincipal|null|undefined,campaignId:string,characterId:string){if(!principal)throw new AIError('player_authentication',playerAccessConfigured()?'Connect player access in Campaign Settings → Player access for action preparation, then retry.':'Connect player access after server setup. No character grants are configured. Open Campaign Settings → Player access for action preparation for the actual campaign IDs and setup steps.',401);if(!mayReadCharacter(principal,campaignId,characterId))throw new AIError('character_forbidden','This player is not authorized for that campaign character. Choose an assigned character or ask the administrator to review ownership.',403)}
