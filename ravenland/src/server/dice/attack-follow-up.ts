import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import type {GMTurn} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {verifiedRollSubmission,pendingActionReferences} from './gm-submission';
import {isRangedAttack} from './attack-interpretation';
import {mergeAdjudication,type AttackAdjudication} from './attack-adjudication';

// Reuses saved request contexts and current verified dice; no combat/NPC state store.
export function attackFollowUp(repo:SqliteCampaignRepository,c:GMTurn,manual:AttackAdjudication,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const record=repo.get(c.campaignId)!,attempt=manual.defense.attempt;
 if((attempt==='dodge'||attempt==='parry')&&manual.defense.declaredBeforeAttack!==false){
  const pending=pendingActionReferences(repo,record,c.characterId).filter(p=>p.rollRequested&&p.skill==='marksmanship');
  if(pending.length===1){
   const action=pending[0],alreadyRolled=record.session.dice?.some(d=>d.characterId===c.characterId&&d.createdAt>=action.startedAt&&!d.metadata.isArmor&&!d.metadata.utility&&(d.result.skill==='Marksmanship'||d.result.skill.startsWith('Attack:')));
   if(alreadyRolled)return {packet:null,manual,declaration:null,message:'That attack has already been rolled. A new defensive reaction cannot be declared after the attack roll.'};
   const declaration={actionId:action.id,characterId:c.characterId,recordedAt:new Date().toISOString(),manual:{...manual,defense:{...manual.defense,declaredBeforeAttack:true}}};
   return {packet:null,manual,declaration,message:'The '+attempt+' declaration is recorded before the pending attack roll. Report its actual result when available; no NPC dice or actions were generated.'};
  }
  if(pending.length>1)return {packet:null,manual,declaration:null,message:'Which pending attack is this defense declared against? Clarify before rolling the attack.'};
 }
 const rows=repo.db.prepare("SELECT payload,context_json FROM ai_requests WHERE campaign_id=? AND kind IN ('chat','roll') AND status='completed' AND context_json IS NOT NULL ORDER BY updated_at DESC,id DESC LIMIT 30").all(c.campaignId).map(r=>({input:JSON.parse(r.payload as string),ctx:JSON.parse(r.context_json as string)})).filter(r=>r.input.characterId===c.characterId);
 const candidates=rows.filter(r=>r.input.kind==='roll'&&r.ctx.attackInterpretation),explicit=candidates.filter(r=>c.action.includes(r.input.rollId)),recent=rows[0]?.ctx.attackInterpretation?.rollId;
 const selected=explicit.length===1?explicit[0]:explicit.length>1?null:recent?candidates.find(r=>r.input.rollId===recent):candidates.length===1?candidates[0]:null;
 if(!selected)return {packet:null,manual,declaration:null,message:candidates.length?'Which submitted attack do these facts resolve? Include its roll ID from Recent Dice Rolls.':'Submit the matching saved attack through Recent Dice Rolls first. No new roll was created.'};
 const prior=rows.find(r=>r.ctx.attackInterpretation?.rollId===selected.input.rollId)?.ctx.attackInterpretation?.manual;
 const packet=verifiedRollSubmission(repo,repo.get(c.campaignId)!,selected.input,principal);
 if(!isRangedAttack(packet))return {packet:null,manual,declaration:null,message:'The selected saved result is not an ordinary ranged attack.'};
 return {packet,manual:mergeAdjudication(prior,manual),declaration:null,message:null};
}
