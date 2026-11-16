import {weaponInRange} from './enemy-choices';
import type {CombatIntent} from '../../lib/combat/action-intents';
import type {CombatEncounter} from '../../lib/combat/types';
import type {CampaignRecord} from '../../lib/types';
import type {CharacterPrincipal} from '../character-access';
import type {SqliteCampaignRepository} from '../sqlite';
import {AIError} from '../ai/config';
import {loadCombatRules} from './sources';
import {verifiedMobilityRules} from './mobility-rules';
import {verifiedAttackRules} from './attack-rules';
import {weaponAttackOptions} from '../../lib/combat/attack-rules';
import {beginPlayerAttack,declareDefense,declareRetreat,nextTurn,rollEnemyAttack,resolveAttack,type Die} from './engine';
import {runMovement} from './movement';
import {fastCost,interruptReadiness,needsLoad,needsReady,recordAction,spend} from './action-economy';
import {handlePlayerWeapon,playerWeaponState,requireAmmunition,requireHeld,resolvePlayerWeapon} from './player-weapons';
import {combatWorkflow,defenseOptions} from './workflow';
import {mechanicalCharacter} from '../mechanical-character';

export function executePlayerIntent(repo:SqliteCampaignRepository,record:CampaignRecord,e:CombatEncounter,actorId:string,intent:CombatIntent,principal:CharacterPrincipal|null,die:Die){
 const character=record.session.characters.find(c=>c.id===actorId),actor=e.combatants.find(c=>c.id===actorId&&c.side==='player');
 if(!character||!actor||actor.withdrawn)throw new AIError('combat_actor','The selected character is not an active encounter participant.',409);
 const attributes=mechanicalCharacter(character).attributes;
 actor.current=Object.fromEntries(Object.entries(attributes).flatMap(([key,v])=>v.current===null?[]:[[key,v.current]]));
 actor.broken=Object.values(actor.current).some(v=>v===0);
 if(intent.type==='clarify')return {waiting:true,message:intent.question};
 if(e.combatants.some(a=>a.side==='enemy'&&a.critical?.status==='required'))throw new AIError('combat_adjudication','A required critical injury still needs source-backed adjudication. Use Recheck critical evidence before continuing.',409);
 if(intent.type==='declare_defense'){
  const rules=loadCombatRules(repo,record.id);if(e.pending)e.pending.rules=verifiedAttackRules(rules.handbook);
  if(!defenseOptions(e,actorId,character).includes(intent.defense)||!e.pending||e.pending.phase!=='declaration')throw new AIError('combat_defense','No matching pre-roll defensive decision is available for this character.',409);
  declareDefense(e,character,intent.defense);rollEnemyAttack(e,die);resolveAttack(e,record.session,die);
  return {waiting:!!e.pending,message:combatWorkflow(e,record.session.characters).summary};
 }
 if(e.pending){
  if(intent.type==='prepare_attack'&&e.pending.actorId===actorId){
   const p=e.pending,index=p.kind==='punch'?-1:p.weaponIndex;
   const w=resolvePlayerWeapon(repo,record,actorId,intent.weaponRef,loadCombatRules(repo,record.id).handbook,principal);
   if(w.index===index&&p.targets[0]===intent.targetId&&(intent.attackType===null||p.kind===intent.attackType))return {waiting:true,message:combatWorkflow(e,record.session.characters).summary};
  }
  throw new AIError('combat_pending','Resolve the recorded decision or roll first. It cannot be replaced or bypassed by another action.',409);
 }
 if(e.combatants[e.turn].id!==actorId)throw new AIError('combat_turn',`${e.combatants[e.turn].name} owns the initiative. Your declared actions have not occurred.`,409);
 if(actor.broken||actor.withdrawn)throw new AIError('combat_actor','A Broken or withdrawn character cannot take this action.',409);
 const rules=loadCombatRules(repo,record.id);e.mobilityRules=verifiedMobilityRules(rules.handbook);
 if(intent.type==='end_turn'){nextTurn(e);return {waiting:false,message:`${actor.name} ends the turn.`};}
 if(intent.type==='stand'){
  if(!actor.prone)throw new AIError('combat_stance','The character is already standing; no action was spent.',409);
  const cost=fastCost(actor);spend(actor,'fast');interruptReadiness(actor);actor.prone=false;recordAction(e,{actorId,kind:'stand',cost});return {waiting:false,message:`${actor.name} stands up.`};
 }
 if(intent.type==='move'){
  const target=e.combatants.find(c=>c.id===intent.targetId&&c.side==='enemy'&&!c.broken&&!c.withdrawn);
  if(!target)throw new AIError('combat_target','Choose an actual active enemy reference for this movement.',409);
  if(e.range===intent.to)throw new AIError('combat_range','The target is already at that range; no additional movement or action was recorded.',409);
  if(e.range==='Arm'&&intent.to==='Near'){const message=declareRetreat(e,actorId,target.id);e.pending!.rules=verifiedAttackRules(rules.handbook);return {waiting:true,message};}
  return {waiting:false,message:runMovement(e,actorId,target.id,intent.to)};
 }
 const w=resolvePlayerWeapon(repo,record,actorId,intent.weaponRef,rules.handbook,principal);
 if(intent.type!=='prepare_attack')return {waiting:false,message:handlePlayerWeapon(e,actor,character,w.index,w.weapon,intent.type)};
 const target=e.combatants.find(c=>c.id===intent.targetId&&c.side==='enemy'&&!c.broken&&!c.withdrawn);
 if(!target)throw new AIError('combat_target','That target is not an active enemy in this encounter.',409);
 if(!weaponInRange(w.weapon,e.range))throw new AIError('combat_range','That target is outside the verified weapon range. Completed earlier actions remain recorded.',409);
 if(!actor.slow)throw new AIError('combat_actions','No slow action remains for the requested attack. Completed earlier actions remain recorded.',409);
 const options=weaponAttackOptions(w.weapon);
 if(w.index===-1&&!verifiedAttackRules(rules.handbook).unarmed)throw new AIError('combat_equipment_evidence','The source-backed unarmed procedure is unavailable.',409);
 requireHeld(actor,character,w.index);
 const kind=intent.attackType??(options.length===1?options[0].type:null);
 if(kind===null){
  // Validate the existing attack procedure on a copy before holding its choice.
  const preview=structuredClone(e);beginPlayerAttack(preview,actorId,target.id,w.index,character,w.weapon,options[0].type);
  e.actionDraft={characterId:actorId,targetId:target.id,weaponIndex:w.index,weaponName:w.weapon.name,declaration:'Player requested an attack; choose its type before rolling.'};
  return {waiting:true,message:combatWorkflow(e,record.session.characters).summary};
 }
 if(!options.some(o=>o.type===kind))throw new AIError('combat_melee','The selected weapon does not support that attack type.',409);
 if(kind==='shoot'){
  const state=playerWeaponState(actor,character,w.index);requireAmmunition(character,w.weapon);
  if(needsReady(w.weapon)&&!state.ready||needsLoad(w.weapon)&&!state.loaded)throw new AIError('combat_weapon_not_ready',needsLoad(w.weapon)?'Load this crossbow before preparing its shot.':'Ready this bow or sling before preparing its shot.',409);
 }
 const wasProne=target.prone,message=beginPlayerAttack(e,actorId,target.id,w.index,character,w.weapon,kind);
 e.pending!.rules=verifiedAttackRules(rules.handbook);e.pending!.attackModifier=kind==='shoot'?e.pending!.rules!.rangedModifiers[e.range]:wasProne?e.pending!.rules!.modifiers.proneTarget:0;
 // Actual verified shot submission consumes readiness/loading in bindPlayerRoll.
 if(kind!=='shoot')interruptReadiness(actor);
 delete e.actionDraft;return {waiting:true,message};
}
