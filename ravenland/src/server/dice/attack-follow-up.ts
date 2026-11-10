import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import type {GMTurn} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {verifiedRollSubmission} from './gm-submission';
import {isRangedAttack} from './attack-interpretation';
import {mergeAdjudication,type AttackAdjudication} from './attack-adjudication';

// Reuses saved request contexts and current verified dice; no combat/NPC state store.
export function attackFollowUp(repo:SqliteCampaignRepository,c:GMTurn,manual:AttackAdjudication,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const rows=repo.db.prepare("SELECT payload,context_json FROM ai_requests WHERE campaign_id=? AND kind IN ('chat','roll') AND status='completed' AND context_json IS NOT NULL ORDER BY updated_at DESC,id DESC LIMIT 30").all(c.campaignId).map(r=>({input:JSON.parse(r.payload as string),ctx:JSON.parse(r.context_json as string)})).filter(r=>r.input.characterId===c.characterId);
 const candidates=rows.filter(r=>r.input.kind==='roll'&&r.ctx.attackInterpretation),explicit=candidates.filter(r=>c.action.includes(r.input.rollId)),recent=rows[0]?.ctx.attackInterpretation?.rollId;
 const selected=explicit.length===1?explicit[0]:explicit.length>1?null:recent?candidates.find(r=>r.input.rollId===recent):candidates.length===1?candidates[0]:null;
 if(!selected)return {packet:null,manual,message:candidates.length?'Which submitted attack do these facts resolve? Include its roll ID from Recent Dice Rolls.':'Submit the matching saved attack through Recent Dice Rolls first. No new roll was created.'};
 const prior=rows.find(r=>r.ctx.attackInterpretation?.rollId===selected.input.rollId)?.ctx.attackInterpretation?.manual;
 const packet=verifiedRollSubmission(repo,repo.get(c.campaignId)!,selected.input,principal);
 if(!isRangedAttack(packet))return {packet:null,manual,message:'The selected saved result is not an ordinary ranged attack.'};
 return {packet,manual:mergeAdjudication(prior,manual),message:null};
}
