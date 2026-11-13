import {randomUUID} from 'node:crypto';
import type {GMTurn} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {AIError} from '../ai/config';
import {encounterRequest,legacySetup,parseEncounterSetup,setupQuestion,type EncounterSetup} from './setup';
import {setupCancelled,setupNegative,setupAffirmed,setupContinue,setupUseCurrent,setupInquiry} from './setup-intent';
import {sceneMatches} from './setup-scene';
import {pendingSetup,latestSetup,setupSnapshot,saveSetup,setupReceipt,saveSetupReceipt,setupById,hasSetupAction,type PendingSetup} from './setup-store';
export type SetupDecision={kind:'respond';narration:string;setup:EncounterSetup|null}|{kind:'start';proposalId:string;revision:number;setup:EncounterSetup};
function insert(repo:SqliteCampaignRepository,c:GMTurn,proposal:EncounterSetup,originId=c.requestId):PendingSetup{
 const record=repo.get(c.campaignId)!,id=randomUUID(),now=new Date().toISOString(),snapshot=setupSnapshot(repo,record,c.characterId,proposal);
 if(proposal.scene){snapshot.location=proposal.scene.location;snapshot.hex=proposal.scene.hex}
 repo.db.prepare("UPDATE combat_setup_proposals SET status='superseded',resolved_request_id=?,updated_at=? WHERE campaign_id=? AND character_id=? AND status='pending'").run(c.requestId,now,c.campaignId,c.characterId);
 repo.db.prepare('INSERT INTO combat_setup_proposals VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?)').run(id,c.campaignId,c.characterId,originId,'pending',1,JSON.stringify(proposal),JSON.stringify(snapshot),now,now);
 return {id,campaignId:c.campaignId,characterId:c.characterId,originRequestId:originId,status:'pending',revision:1,proposal,snapshot,encounterId:null};
}
export function prepareEncounterSetup(repo:SqliteCampaignRepository,c:GMTurn,principal:CharacterPrincipal|null):SetupDecision|null{
 if(c.kind!=='chat'||/^\/combat\b/i.test(c.action))return null;
 if(hasSetupAction(repo,c)){requireCharacterAccess(principal,c.campaignId,c.characterId);return setupReceipt(repo,c) as SetupDecision}
 const existing=pendingSetup(repo,c.campaignId,c.characterId),legacy=!existing?legacySetup(repo,c.campaignId,c.characterId):null,last=latestSetup(repo,c.campaignId,c.characterId);
 if(!existing&&!legacy&&!encounterRequest(c.action)&&!(last&&(setupAffirmed(c.action)||setupContinue(c.action))))return null;
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const saved=setupReceipt(repo,c) as SetupDecision|null;if(saved){db.exec('COMMIT');return saved}
  const record=repo.get(c.campaignId);if(!record)throw new AIError('not_found','Campaign not found',404);
  let pending=pendingSetup(repo,c.campaignId,c.characterId);if(!pending&&legacy)pending=insert(repo,c,legacy.proposal,legacy.requestId);
  if(!pending&&last&&(!encounterRequest(c.action)||setupAffirmed(c.action)||setupContinue(c.action))){const result:SetupDecision={kind:'respond',narration:last.status==='resumed'?'That setup has already been used. Its encounter is recorded; describe a new encounter if you want another.':'That setup is no longer pending. Describe a new encounter when you are ready.',setup:null};saveSetupReceipt(repo,c,last.id,result);db.exec('COMMIT');return result}
  if(pending&&setupCancelled(c.action)){db.prepare("UPDATE combat_setup_proposals SET status='cancelled',resolved_request_id=?,updated_at=? WHERE id=?").run(c.requestId,new Date().toISOString(),pending.id);const result:SetupDecision={kind:'respond',narration:'All right, that encounter is cancelled. Nothing has moved and no initiative was drawn.',setup:null};saveSetupReceipt(repo,c,pending.id,result);db.exec('COMMIT');return result}
  const replace=!!pending&&/\b(?:new encounter|replace (?:the|that|this) (?:encounter|proposal)|start over)\b/i.test(c.action),negative=!!pending&&setupNegative(c.action),affirmative=setupAffirmed(c.action)||setupContinue(c.action);
  const inquiry=!!pending&&!encounterRequest(c.action)&&setupInquiry(c.action);
  let proposal=inquiry?null:parseEncounterSetup(c.action,record.session,c.characterId,pending&&!replace?pending.proposal:null,pending&&!replace?'revise':'auto');
  const relevant=!!proposal&&(!pending||replace||affirmative||setupUseCurrent(c.action)||JSON.stringify(proposal)!==JSON.stringify(pending.proposal));if(!proposal&&pending)proposal=structuredClone(pending.proposal);if(!proposal){db.exec('COMMIT');return null}
  let consistencyChanged=false;
  if(!pending||replace)pending=insert(repo,c,proposal);
  else {
   const now=setupSnapshot(repo,record,c.characterId,proposal);now.actorWeapons=pending.snapshot.actorWeapons;now.declaredEquipment=pending.snapshot.declaredEquipment;const positionChanged=pending.snapshot.hex!==now.hex||pending.snapshot.location!==now.location,otherEncounter=pending.snapshot.latestEncounterId!==now.latestEncounterId;
   const matchesNewPlace=positionChanged&&pending.snapshot.hex===now.hex&&!!proposal.scene&&sceneMatches(proposal.scene.description,now.location);
   consistencyChanged=otherEncounter||positionChanged&&!matchesNewPlace;
   if(consistencyChanged){now.confirmationReason='position_or_encounter_changed';if(proposal.scene)proposal.scene={...proposal.scene,location:now.location,hex:now.hex,confirmed:false}}
   else if(pending.snapshot.confirmationReason&&!affirmative)now.confirmationReason=pending.snapshot.confirmationReason;
   pending.proposal=proposal;pending.snapshot=now;pending.revision++;saveSetup(repo,pending);
  }
  const ids=new Set(record.session.characters.map(ch=>ch.id));if(proposal.participants.some(id=>!ids.has(id))||new Set(proposal.participants).size!==proposal.participants.length){proposal.participants=proposal.participants.filter(id=>ids.has(id));proposal.participantsKnown=false;pending.proposal=proposal;pending.revision++;saveSetup(repo,pending)}
  const question=setupQuestion(proposal,record.session),mustConfirm=!!pending.snapshot.confirmationReason;
  let result:SetupDecision;
  if(consistencyChanged)result={kind:'respond',narration:`Our situation changed while we were planning. We're now at ${record.session.campaign.location} (${record.session.campaign.hex}). Shall we still begin with the same participants, enemies and range here?`,setup:proposal};
  else if(negative)result={kind:'respond',narration:'All right. What scene or part of the encounter should we change? I am holding the rest of your plan.',setup:proposal};
  else if(!relevant)result={kind:'respond',narration:'I am holding your encounter plan. '+(question??'Shall we begin, or would you like to change or cancel it?'),setup:proposal};
  else if(mustConfirm&&!affirmative&&!setupUseCurrent(c.action))result={kind:'respond',narration:'Shall we begin the held encounter at the current location? The participants, enemies and range are still saved.',setup:proposal};
  else if(question)result={kind:'respond',narration:question,setup:proposal};
  else result={kind:'start',proposalId:pending.id,revision:pending.revision,setup:proposal};
  saveSetupReceipt(repo,c,pending.id,result);db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error}
}
export function validateReadySetup(repo:SqliteCampaignRepository,c:GMTurn,decision:Extract<SetupDecision,{kind:'start'}>,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,c.campaignId,c.characterId);const p=setupById(repo,c.campaignId,decision.proposalId),record=repo.get(c.campaignId);
 if(!p||p.characterId!==c.characterId||p.status!=='pending'||p.revision!==decision.revision)throw new AIError('combat_setup_changed','That encounter plan changed or was cancelled. Answer its current clarification before starting.',409);
 if(!record||p.snapshot.campaignId!==c.campaignId||p.snapshot.hex!==record.session.campaign.hex||p.snapshot.location!==record.session.campaign.location)throw new AIError('combat_setup_changed','The location changed after this confirmation. Confirm the encounter in the current scene.',409);
 if(setupSnapshot(repo,record,c.characterId,p.proposal).latestEncounterId!==p.snapshot.latestEncounterId)throw new AIError('combat_setup_changed','Another encounter occurred after this plan was confirmed. Confirm the held encounter again before starting.',409);
 const question=setupQuestion(p.proposal,record.session);if(question)throw new AIError('combat_setup_changed',question,409);
 if(p.proposal.participants.some(id=>!record.session.characters.some(ch=>ch.id===id)))throw new AIError('combat_setup_changed','An encounter participant is no longer in the campaign. Revise the held plan.',409);
 return p;
}
export function consumeSetup(repo:SqliteCampaignRepository,c:GMTurn,encounterId:string,decision?:Extract<SetupDecision,{kind:'start'}>|null){
 if(decision)repo.db.prepare("UPDATE combat_setup_proposals SET status='resumed',encounter_id=?,resolved_request_id=?,updated_at=? WHERE id=? AND status='pending'").run(encounterId,c.requestId,new Date().toISOString(),decision.proposalId);
 repo.db.prepare("UPDATE combat_setup_proposals SET status='superseded',resolved_request_id=?,updated_at=? WHERE campaign_id=? AND status='pending'").run(c.requestId,new Date().toISOString(),c.campaignId);
}
