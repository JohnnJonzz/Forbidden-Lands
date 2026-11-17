import {treatmentRules} from './rules';
import type {SqliteCampaignRepository} from '../sqlite';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import type {PendingDice} from '../../lib/dice/schema';
import {createHash} from 'node:crypto';
import type {CharacterPrincipal} from '../character-access';
import {requireCharacterAccess} from '../character-access';
import {AIError} from '../ai/config';
import {findConsequence} from './service';
import {readConsequences,saveConsequence} from './store';
import {requestedConsequenceRoll} from './context';
import {applyTreatmentResult} from './treatment';
import {nextConsequenceStep,syncConsequences} from './registry';
export function consequenceRollIntended(roll:VerifiedRollSubmission){return !!roll.procedureContext&&(roll.procedureContext.step==='deadline'&&roll.metadata.utility?.kind==='Procedure'||roll.procedureContext.step==='treatment'&&roll.label==='Healing'&&!roll.metadata.utility);}
export function compatibleProcedureRoll(card:PendingDice,request:NonNullable<ReturnType<typeof requestedConsequenceRoll>>){
 if(card.procedureContext?.consequenceId!==request.context.consequenceId||card.procedureContext.procedureId!==request.context.procedureId||card.procedureContext.step!==request.context.step)return false;
 if(request.utility)return card.metadata.utility?.kind==='Procedure'&&card.metadata.utility.faces.length===request.utility.dice&&!card.result.pushed;
 const r=card.original;return card.result.skill==='Healing'&&!card.metadata.utility&&!card.metadata.isArmor&&card.metadata.attribute==='empathy'&&card.metadata.weaponIndex===null&&!r.artifacts.length&&r.attribute.length===request.base&&r.skillDice.length===Math.abs(request.skill+request.modifier)&&r.negativeSkill===(request.skill+request.modifier<0)&&r.gear.length===0;
}
export function checkConsequenceRoll(repo:SqliteCampaignRepository,campaignId:string,roll:VerifiedRollSubmission,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,campaignId,roll.character.id);const ctx=roll.procedureContext;if(!ctx)throw new AIError('consequence_roll','This saved roll has no consequence procedure binding.',409);const c=findConsequence(repo,campaignId,ctx.consequenceId,principal),request=requestedConsequenceRoll(repo,campaignId,roll.character.id,principal),record=repo.get(campaignId)!;
 const card=record.session.dice?.find(d=>d.id===roll.rollId);if(!card||!request||!compatibleProcedureRoll(card,request))throw new AIError('consequence_roll','This roll does not match the current deadline or treatment request. It was not consumed. Use the requested procedure on the correct character’s sheet.',409);
 const first=record.session.dice?.find(d=>d.characterId===roll.character.id&&compatibleProcedureRoll(d,request));if(first?.id!==roll.rollId)throw new AIError('consequence_roll','Use the first compatible saved roll for this procedure; known later outcomes cannot replace it.',409);
 return {c,request};
}
export function executeConsequenceRoll(repo:SqliteCampaignRepository,campaignId:string,requestId:string,roll:VerifiedRollSubmission,principal:CharacterPrincipal|null){
 const db=repo.db,hash=createHash('sha256').update(JSON.stringify({rollId:roll.rollId,result:roll.result,metadata:roll.metadata,context:roll.procedureContext})).digest('hex');db.exec('BEGIN IMMEDIATE');try{
 const saved=db.prepare('SELECT fingerprint,result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?').get(campaignId,requestId);if(saved){if(saved.fingerprint!==hash)throw new AIError('consequence_duplicate','The submitted procedure result changed after processing.',409);requireCharacterAccess(principal,campaignId,roll.character.id);db.exec('COMMIT');return {...JSON.parse(saved.result_json as string),replayed:true};}
 syncConsequences(repo,campaignId);treatmentRules(repo,campaignId);const {c,request}=checkConsequenceRoll(repo,campaignId,roll,principal),d=c.state.deadline!;let summary:string;
 if(request.context.step==='deadline'){const utility=roll.metadata.utility;if(utility?.kind!=='Procedure')throw new AIError('consequence_roll','Use the requested D6 deadline.',409);d.value=utility.faces.reduce((a,b)=>a+b,0);d.rollId=roll.rollId;summary='Recorded lethal deadline: '+d.value+' '+d.unit+' from the actual saved '+d.dice+'D6 result. The critical injury was not rerolled. '+d.elapsed+' '+d.unit+' of verified time has elapsed.';}
 else {const attempt=c.state.attempts.find(a=>a.id===request.context.procedureId)!;applyTreatmentResult(c,attempt,roll.rollId,roll.successes!);summary='Recorded lifesaving Healing: '+roll.successes+' successes; '+(attempt.status==='succeeded'?'the lethal threat is resolved. The critical injury and current attributes remain recorded.':'this healer’s single attempt failed. Another eligible person may try; no successful treatment or death is assumed.');}
 nextConsequenceStep(c);saveConsequence(repo,c);const result={consequenceId:c.id,status:c.status,resolution:c.state.resolution,rollId:roll.rollId,summary,nextProcedure:c.nextProcedure,replayed:false};db.prepare('INSERT INTO consequence_commands VALUES (?,?,?,?,?)').run(campaignId,requestId,hash,JSON.stringify(result),new Date().toISOString());db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
