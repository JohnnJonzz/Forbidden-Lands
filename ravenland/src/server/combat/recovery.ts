import type {CombatEncounter,CombatRange} from '../../lib/combat/types';
import type {Session} from '../../lib/types';
import type {CharacterPrincipal} from '../character-access';
import {AIError} from '../ai/config';
import {combatWorkflow} from './workflow';
import {fastCost,spend,recordAction} from './action-economy';

export function recoveryPreview(e:CombatEncounter,session?:Session){
 const p=e.pending,rolled=!!p&&!!(Object.keys(p.attackRolls).length>0||Object.keys(p.defenseRolls).length>0||Object.keys(p.armorRolls).length>0||p.results.length>0||p.playerRolls.length>0||e.rolls.some(r=>r.actionId===p.id&&r.type!=='table')||session?.dice?.some(d=>d.combatContext?.encounterId===e.id&&d.combatContext.actionId===p.id));
 const rangeOnly=!!p&&p.phase==='adjudication'&&p.notes.length===1&&p.notes[0].startsWith('Confirm targets are within');
 return {encounterId:e.id,round:e.round,actor:e.combatants[e.turn]?.name,attackId:p?.id??null,phase:p?.phase??null,targets:p?.targets.map(id=>e.combatants.find(c=>c.id===id)?.name),range:e.range,defenses:p?.defenses??{},rolled,rangeOnly,canSupersede:!!p&&!rolled&&!Object.values(p.defenses).some(d=>d!==null),audit:(e.recoveryAudit??[]).map(({before,...a})=>({...a,originalPhase:before.phase}))};
}
// Runs inside the existing combat command transaction and receipt. Never clears
// rolled attacks, refunds actions or rewrites historical dice.
export function recoverPending(e:CombatEncounter,attackId:string,operation:string,reason:string,principal:CharacterPrincipal|null,session?:Session){
 if(principal?.mode!=='trusted-local')throw new AIError('combat_controller','Pending-action corrections require the trusted local encounter controller.',403);
 if(reason.trim().length<12)throw new AIError('combat_recovery','Record a specific reason for this correction (at least 12 characters).',400);
 const p=e.pending,preview=recoveryPreview(e,session);if(!p||p.id!==attackId)throw new AIError('combat_conflict','The pending attack changed. Review the current attack before correcting it.',409);
 if(preview.rolled)throw new AIError('combat_recovery','This attack has saved dice or consequences. Complete its defense, Armor and damage procedure; it cannot be superseded or reopened.',409);
 const before=structuredClone(p),from=e.range;
 if(operation==='supersede'){
  if(!preview.canSupersede)throw new AIError('combat_recovery','A defensive choice is already committed. It cannot be discarded.',409);
  e.pending=null;
 }else{
  if(!preview.rangeOnly)throw new AIError('combat_recovery','Only a pending range-only adjudication can reopen its pre-roll defense window. Special monster procedures need their own adjudication.',409);
  const monster=e.combatants.find(a=>a.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey);
  if(!monster||monster.review.length)throw new AIError('combat_recovery','The source-backed attack still requires special adjudication.',409);
  if(operation==='move'){
   const actor=e.combatants[e.turn];
   if(actor.id!==p.actorId||!e.mobilityRules||e.movementCondition&&e.movementCondition!=='clear'||e.range!=='Near'||monster.range!=='Arm'||actor.prone||actor.broken||actor.withdrawn)throw new AIError('combat_recovery','A legal ordinary NEAR to ARM’S LENGTH move is not established. Review positioning; no range or action changed.',409);
   // Controller confirms the relative position of all targets. No PC decision
   // or free attack is inferred. The actual fast-action cost remains recorded.
   const cost=fastCost(actor);spend(actor,'fast');e.range='Arm';recordAction(e,{actorId:actor.id,targetId:p.targets[0],kind:'run',cost,from,to:'Arm',note:reason});
  }else if(operation!=='range')throw new AIError('combat_recovery','Choose a supported correction.',400);
  if(operation==='range'&&(['Arm','Near','Short','Long'] as CombatRange[]).indexOf(e.range)>(['Arm','Near','Short','Long'] as CombatRange[]).indexOf(monster.range))throw new AIError('combat_recovery','The recorded range remains outside this attack’s reach. Use the legal movement option or supersede the unrolled invalid action; a verbal confirmation cannot move the party.',409);
  p.notes=[];p.phase='declaration';
 }
 (e.recoveryAudit??=[]).push({at:new Date().toISOString(),attackId,operation,reason:reason.trim(),before,from,to:e.range});
 return operation==='supersede'?'Invalid unrolled declaration superseded; spent actions and table draw retained.':combatWorkflow(e).summary;
}
