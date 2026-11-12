import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {requireCharacterAccess} from '../character-access';
import type {CombatEncounter} from '../../lib/combat/types';
import {verifiedRollSubmission,rollRequestId,savedRollFingerprint} from '../dice/gm-submission';
import {checkCombatRoll} from './workflow';
import {AIError} from '../ai/config';

export function eligibleCombatRolls(repo:SqliteCampaignRepository,campaignId:string,characterId:string,e:CombatEncounter|null,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,campaignId,characterId);
 const record=repo.get(campaignId);if(!record||e?.status!=='active'||!e.pending)return [];
 return (record.session.dice??[]).filter(card=>card.characterId===characterId&&card.status==='Pending'&&!e.consumedPlayerRolls.includes(card.id)).filter(card=>{
  try{const packet=verifiedRollSubmission(repo,record,{campaignId,characterId,kind:'roll',action:'',requestId:rollRequestId(campaignId,card.id),rollId:card.id,rollFingerprint:savedRollFingerprint(card)},principal);checkCombatRoll(e,packet,record.session);return true}catch(error){if(error instanceof AIError)return false;throw error}
 }).slice(-5).reverse();
}
