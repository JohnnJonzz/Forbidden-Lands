import {synchronizeCombatConversation} from './conversation';
import type {CombatEncounter} from '../../lib/combat/types';
import {createHash} from 'node:crypto';
import {actionInterpretationSchema,type ActionInterpretation,type IntentOutcome} from '../../lib/combat/action-intents';
import type {GMTurn} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {AIError} from '../ai/config';
import {activeCombat,publicCombat,saveCombat} from './store';
import {executePlayerIntent} from './player-actions';
import {secureDie,type Die} from './engine';
import {combatNarrative,fallbackCombatNarration} from './narrative';
import type {OrchestratedCombat} from './orchestrator';

export interface DispatchResult extends OrchestratedCombat {outcomes:IntentOutcome[];stopReason:string|null}
// No text parsing and no model calls. Both chat and sheet controls enter here.
export function dispatchActions(repo:SqliteCampaignRepository,c:GMTurn,raw:ActionInterpretation,principal:CharacterPrincipal|null,die:Die=secureDie):DispatchResult{
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const plan=actionInterpretationSchema.parse(raw);
 if(plan.actorId!==c.characterId)throw new AIError('character_forbidden','The interpretation cannot change the selected acting character.',403);
 const fingerprint=createHash('sha256').update(JSON.stringify({c,plan})).digest('hex');
 const receiptId=createHash('sha256').update('typed-dispatch:'+c.requestId).digest('hex');
 const db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const saved=db.prepare('SELECT fingerprint,result_json FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,receiptId);
  if(saved){if(saved.fingerprint!==fingerprint)throw new AIError('combat_duplicate','This action request was reused with different intentions.',409);db.exec('COMMIT');return {...JSON.parse(saved.result_json as string),replayed:true};}
  const existing=activeCombat(repo,c.campaignId);const record=repo.get(c.campaignId);
  if(!existing||existing.id!==plan.encounterId||!record)throw new AIError('combat_conflict','That encounter is no longer active. Refresh before declaring another action.',409);
  let e:CombatEncounter=existing;
  if(e.sceneHex!==record.session.campaign.hex||e.sceneLocation!==record.session.campaign.location)throw new AIError('combat_scene','The campaign location changed. Resolve this encounter before acting in another scene.',409);
  const checkpoint={pendingId:e.pending?.id??null,actions:e.actions?.length??0,encounterId:e.id,rolls:e.rolls.length,attacks:e.history.length,round:e.round,activeId:e.combatants[e.turn].id,revision:e.revision};
  const safePrompt=(text:string)=>{const guarded=synchronizeCombatConversation(e,text,record.session.characters);return guarded.startsWith(text.trim()+'\n\n')?text:'That outcome has not been verified. '+guarded};
  const outcomes:IntentOutcome[]=[];let stopReason:string|null=null;
  if(plan.disposition!=='actions')stopReason=plan.message?safePrompt(plan.message):'Specify the intended action or use the deterministic Combat controls.';
  else for(const [index,intent] of plan.actions.entries()){
   const candidate:CombatEncounter=structuredClone(e);
   try{const result=executePlayerIntent(repo,record,candidate,c.characterId,intent,principal,die);if(intent.type==='clarify')result.message=safePrompt(result.message);e=candidate;outcomes.push({index,type:intent.type,status:result.waiting?'awaiting_input':'completed',code:null,message:result.message});if(result.waiting){stopReason=result.message;break;}}
   catch(error){const safe=error instanceof AIError?error:new AIError('action_dispatch_failed','Action dispatch failed internally. Earlier completed actions remain recorded; use the Combat controls or retry the same request.',500);outcomes.push({index,type:intent.type,status:'blocked',code:safe.code,message:safe.message});stopReason=safe.message;break;}
  }
  // The whole completed prefix and its receipt commit together. A failed step's
  // clone is discarded; its mutations cannot undo or contaminate that prefix.
  if(outcomes.some(o=>o.status!=='blocked'))saveCombat(repo,e);
  const packet=combatNarrative(e,checkpoint,null,'',false,publicCombat(e,record.session.characters)!.workflow);
  if(stopReason)packet.nextPrompt=stopReason;
  else if(!packet.events.length&&outcomes.length)packet.nextPrompt=outcomes.map(o=>o.message).join(' ')+' '+packet.nextPrompt;
  const result:DispatchResult={outcomes,stopReason,checkpoint,revision:e.revision,command:'typed-actions',packet,narration:fallbackCombatNarration(packet),encounter:publicCombat(e,record.session.characters),setup:null,usage:null,decisionUsage:[],replayed:false};
  db.prepare('INSERT INTO combat_commands VALUES (?,?,?,?,?,?)').run(c.campaignId,receiptId,fingerprint,e.id,JSON.stringify(result),new Date().toISOString());db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
