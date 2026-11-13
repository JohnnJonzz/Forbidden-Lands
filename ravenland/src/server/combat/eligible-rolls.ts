import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {requireCharacterAccess} from '../character-access';
import type {CombatEncounter} from '../../lib/combat/types';
import {verifiedRollSubmission,rollRequestId,savedRollFingerprint} from '../dice/gm-submission';
import {checkCombatRoll,combatWorkflow,compatibleCombatCard} from './workflow';
import {AIError} from '../ai/config';
import type {PendingDice} from '../../lib/dice/schema';

export function eligibleCombatRolls(repo:SqliteCampaignRepository,campaignId:string,characterId:string,e:CombatEncounter|null,principal:CharacterPrincipal|null){
 return combatRollReview(repo,campaignId,characterId,e,principal).eligibleRolls;
}
export function combatRollReview(repo:SqliteCampaignRepository,campaignId:string,characterId:string,e:CombatEncounter|null,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,campaignId,characterId);
 const record=repo.get(campaignId),eligibleRolls:PendingDice[]=[],unavailableRolls:{id:string;label:string;createdAt:string;reason:string}[]=[];
 if(!record||e?.status!=='active')return {eligibleRolls,unavailableRolls};
 const cards=(record.session.dice??[]).filter(card=>card.characterId===characterId&&card.status!=='Ready'&&!e.consumedPlayerRolls.includes(card.id)),response=combatWorkflow(e,record.session.characters).responses.find(r=>r.characterId===characterId&&r.step!=='decision');
 const first=response?cards.find(c=>c.createdAt>=e.pending!.openedAt&&compatibleCombatCard(e,c,response,record.session.characters)):undefined,recent=cards.slice(-12),review=first&&!recent.some(c=>c.id===first.id)?[first,...recent]:recent;
 for(const card of review){
  try{const status=repo.db.prepare('SELECT status FROM ai_requests WHERE campaign_id=? AND id=?').get(campaignId,rollRequestId(campaignId,card.id))?.status;if(status==='completed'||status==='running')throw new AIError('combat_roll','This roll has already been submitted or is being processed. Use its existing result or retry a failed request.',409);const packet=verifiedRollSubmission(repo,record,{campaignId,characterId,kind:'roll',action:'',requestId:rollRequestId(campaignId,card.id),rollId:card.id,rollFingerprint:savedRollFingerprint(card)},principal);checkCombatRoll(e,packet,record.session);eligibleRolls.push(card)}catch(error){if(!(error instanceof AIError))throw error;unavailableRolls.push({id:card.id,label:card.result.skill,createdAt:card.createdAt,reason:error.message})}
 }
 return {eligibleRolls,unavailableRolls};
}
