import type {PendingDice} from './schema';

// Excludes mutable delivery status; includes every authoritative roll input and
// saved consequence. Shared serialization keeps browser/server stale checks equal.
export function rollSubmissionSnapshot(card:PendingDice){return JSON.stringify([card.id,card.characterId,card.createdAt,card.original,card.result,card.metadata,card.weaponSnapshot,card.gearDamageApplied,card.gearDamageManual])}
export async function rollSubmissionFingerprint(card:PendingDice){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rollSubmissionSnapshot(card)));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}
export async function rollGMRequestId(campaignId:string,rollId:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ravenland:gm-roll:'+campaignId+':'+rollId));const hex=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`}
export interface RollGMStatus {rollId:string;requestId:string;status:'running'|'failed'|'completed';updatedAt:string}
