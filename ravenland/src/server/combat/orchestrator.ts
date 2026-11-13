import {createHash} from 'node:crypto';
import type {GMTurn} from '../../lib/ai/schema';
import type {CombatEncounter} from '../../lib/combat/types';
import type {SqliteCampaignRepository} from '../sqlite';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import {AIError} from '../ai/config';
import {combatTurn,type CombatChooser,type CombatTurnResult} from './service';
import {activeCombat,publicCombat} from './store';
import {secureDie,type Die} from './engine';
import {combatNarrative,type CombatNarrative} from './narrative';

export interface OrchestratedCombat extends CombatTurnResult {packet:CombatNarrative|null;decisionUsage:NonNullable<CombatTurnResult['usage']>[]}
export function combatStepId(requestId:string,step:string){const h=createHash('sha256').update('combat-orchestration:'+requestId+':'+step).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
const fingerprint=(c:GMTurn)=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
const receipt=(repo:SqliteCampaignRepository,c:GMTurn,id:string)=>repo.db.prepare('SELECT fingerprint,result_json FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,id);

// Bounded orchestration around the existing command service. A player turn is
// never ended here. Every subcommand has a stable receipt before narration runs.
export async function orchestrateCombat(repo:SqliteCampaignRepository,c:GMTurn,roll:VerifiedRollSubmission|null|undefined,principal:CharacterPrincipal|null,choose?:CombatChooser,die:Die=secureDie,onDecision?:(usage:NonNullable<CombatTurnResult['usage']>)=>void):Promise<OrchestratedCombat|null>{
 const envelopeId=combatStepId(c.requestId,'narrative'),saved=receipt(repo,c,envelopeId);
 if(saved){requireCharacterAccess(principal,c.campaignId,c.characterId);if(saved.fingerprint!==fingerprint(c))throw new AIError('combat_duplicate','Combat request parameters changed.',409);return {...JSON.parse(saved.result_json as string),decisionUsage:[],usage:null,replayed:true}}
 let decisions=0;const usages:NonNullable<CombatTurnResult['usage']>[]=[];
 const boundedChoose:CombatChooser|undefined=choose?async input=>{if(++decisions>2)return {choiceId:input.choices[0].id,inputTokens:0,outputTokens:0,model:'application-legal-policy'};return choose(input)}:undefined;
 let first:CombatTurnResult|null;try{first=await combatTurn(repo,c,roll,principal,boundedChoose,die,{singleStep:true})}catch(error){if(c.kind==='chat'&&error instanceof AIError&&['combat_target','combat_weapon','combat_melee','combat_resource','combat_stance','combat_action'].includes(error.code)){requireCharacterAccess(principal,c.campaignId,c.characterId);const e=activeCombat(repo,c.campaignId);return {narration:error.message,encounter:publicCombat(e,repo.get(c.campaignId)?.session.characters??[]),setup:null,usage:null,replayed:false,packet:null,decisionUsage:[]}}throw error}if(!first)return null;
 if(!first.checkpoint)return {...first,packet:null,decisionUsage:[]};
 if(first.replayed&&first.usage&&first.usage.model!=='application-legal-policy')decisions++;
 if(first.usage&&!first.replayed){usages.push(first.usage);onDecision?.(first.usage)}
 let cursor=first,steps=0;
 while(cursor.encounter?.status==='active'&&!cursor.encounter.pending&&!cursor.encounter.workflow.blocker){
  const view=cursor.encounter,foes=view.combatants.filter(a=>a.side==='enemy'),active=view.combatants.find(a=>a.id===view.activeId);
  const done=foes.length>0&&foes.every(a=>a.broken||a.withdrawn);
  if(!done&&active?.side!=='enemy')break;
  if(steps>=24)break;
  const next={...c,kind:'chat' as const,action:done?'/combat end':'/combat next',requestId:combatStepId(c.requestId,'step:'+steps++)};
  // On a retry replay earlier substeps before consulting today's mutable state.
  if(!receipt(repo,next,next.requestId)){
   const live=activeCombat(repo,c.campaignId);if(live?.id!==view.id||(cursor.revision!==undefined&&live.revision!==cursor.revision))throw new AIError('combat_conflict','The encounter changed after this request paused. Use the current combat state.',409);
  }
  const previous=cursor;cursor=(await combatTurn(repo,next,null,principal,boundedChoose,die,{singleStep:true}))!;
  if(cursor.replayed&&cursor.usage&&cursor.usage.model!=='application-legal-policy')decisions++;
  if(cursor.usage&&!cursor.replayed){usages.push(cursor.usage);onDecision?.(cursor.usage)}
  // Out of range or unsupported choice: no invented movement or busy loop.
  if(!done&&cursor.encounter?.activeId===previous.encounter?.activeId&&!cursor.encounter?.pending&&cursor.encounter?.round===previous.encounter?.round&&/No supported attack/.test(cursor.narration))break;
 }
 const row=cursor.encounter?repo.db.prepare('SELECT state_json FROM combat_encounters WHERE id=? AND campaign_id=?').get(cursor.encounter.id,c.campaignId):null;
 const encounter=row?JSON.parse(row.state_json as string) as CombatEncounter:null;
 const packet=encounter?combatNarrative(encounter,first.checkpoint,roll,cursor.narration,steps>=24,cursor.encounter?.workflow,first.drawnWeapon):null;
 const result:OrchestratedCombat={...cursor,setup:first.setup,packet,decisionUsage:usages,usage:null,replayed:first.replayed};
 // The immutable verified packet survives an upstream narration failure. Retrying
 // cannot regenerate initiative, defense, armor, critical dice or push effects.
 repo.db.prepare('INSERT INTO combat_commands VALUES (?,?,?,?,?,?)').run(c.campaignId,envelopeId,fingerprint(c),cursor.encounter?.id??null,JSON.stringify(result),new Date().toISOString());
 return result;
}
