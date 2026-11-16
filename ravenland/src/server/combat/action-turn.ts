import type {GMTurn} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {AIError} from '../ai/config';
import {activeCombat,publicCombat} from './store';
import {encounterRequest} from './setup';
import {dispatchActions,type DispatchResult} from './action-dispatcher';
import {interpretedActions,type ActionInterpreter,type InterpretationResult} from './interpret-actions';
import {orchestrateCombat,combatStepId,type OrchestratedCombat} from './orchestrator';
import {combatNarrative,fallbackCombatNarration} from './narrative';
import type {CombatChooser} from './service';
import type {Die} from './engine';

export async function playerActionTurn(repo:SqliteCampaignRepository,c:GMTurn,principal:CharacterPrincipal|null,interpret?:ActionInterpreter,onUsage?:(value:Omit<InterpretationResult,'interpretation'>)=>void,choose?:CombatChooser,die?:Die):Promise<{handled:boolean;result:OrchestratedCombat|null}>{
 const e=activeCombat(repo,c.campaignId);
 // A narration retry of a pre-existing combat envelope must replay its already
 // committed mechanics before attempting a new interpretation.
 const existingEnvelope=repo.db.prepare('SELECT 1 FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,combatStepId(c.requestId,'narrative'));
 if(existingEnvelope)return {handled:false,result:null};
 if(c.kind!=='chat'||!e||!c.combatIntent&&(/^\/combat\b/i.test(c.action)||encounterRequest(c.action)))return {handled:false,result:null};
 let dispatched:DispatchResult;
 try{
  let plan=c.combatIntent;
  if(!plan){const receipt=await interpretedActions(repo,c,principal,interpret,onUsage);plan=receipt.plan;
   if(plan.disposition==='conversation')return {handled:true,result:null};
   const live=activeCombat(repo,c.campaignId);
   // Dispatch replays its saved prefix before consulting today's state. For a
   // new execution, changing state while the model thinks requires a new input.
   const dispatchedId=(await import('node:crypto')).createHash('sha256').update('typed-dispatch:'+c.requestId).digest('hex');
   const replay=repo.db.prepare('SELECT 1 FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,dispatchedId);
   if(!replay&&(live?.revision!==receipt.revision||repo.get(c.campaignId)?.revision!==receipt.campaignRevision))throw new AIError('combat_conflict','Combat or character data changed during interpretation. Send a new declaration using the current state; no action occurred.',409);
  }
  dispatched=dispatchActions(repo,c,plan,principal,die);
 }catch(error){
  if(error instanceof AIError&&['player_authentication','character_forbidden','combat_duplicate'].includes(error.code))throw error;
  const message=error instanceof AIError?error.message:'AI action interpretation failed. No actions occurred; use Combat controls or the character sheet.';
  return {handled:true,result:{narration:message,encounter:publicCombat(activeCombat(repo,c.campaignId),repo.get(c.campaignId)?.session.characters??[]),setup:null,usage:null,decisionUsage:[],packet:null,replayed:false}};
 }
 const live=activeCombat(repo,c.campaignId)!;
 const view=dispatched.encounter;
 if(view?.status==='active'&&!view.pending&&!view.workflow.blocker&&view.combatants.find(a=>a.id===view.activeId)?.side==='enemy'){
  const continuationId=combatStepId(c.requestId,'after-player-actions');
  const savedContinuation=repo.db.prepare('SELECT 1 FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,combatStepId(continuationId,'narrative'));
  if(!savedContinuation&&(live?.id!==view.id||live.revision!==dispatched.revision))throw new AIError('combat_conflict','The encounter changed after these actions completed. Use the current state; the saved actions will not repeat.',409);
  const continuation=await orchestrateCombat(repo,{...c,combatIntent:undefined,requestId:combatStepId(c.requestId,'after-player-actions'),action:'/combat next'},null,principal,choose,die,value=>{if(value.model!=='application-legal-policy')onUsage?.(value)});
  const after=activeCombat(repo,c.campaignId);
  if(after&&continuation){const packet=combatNarrative(after,dispatched.checkpoint,null,continuation.narration,false,continuation.encounter?.workflow);
   if(dispatched.stopReason)packet.events.unshift({fixed:true,id:c.requestId+':blocked',kind:'action',actor:'The acting player',outcome:'recorded',facts:dispatched.stopReason,fallback:dispatched.stopReason});
   return {handled:true,result:{...continuation,packet,narration:fallbackCombatNarration(packet)}};
  }
 }
 return {handled:true,result:dispatched};
}
