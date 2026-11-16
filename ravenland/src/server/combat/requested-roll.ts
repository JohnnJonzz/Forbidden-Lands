import type {CombatEncounter} from '../../lib/combat/types';
import type {Character} from '../../lib/types';
import type {RequestedCombatRoll} from '../../lib/combat/requested-roll';
import {combatWorkflow} from './workflow';
import {armorRating,defensePool} from './defensive-rolls';

export function requestedCombatRoll(e:CombatEncounter|null,characters:Character[],characterId:string):RequestedCombatRoll|null{
 if(e?.status!=='active'||!e.pending)return null;const p=e.pending,ch=characters.find(c=>c.id===characterId),response=combatWorkflow(e,characters).responses.find(r=>r.characterId===characterId);if(!ch||!response||!['defense','armor'].includes(response.step))return null;
 const context={encounterId:e.id,actionId:p.id,round:e.round,turnId:e.combatants[e.turn].id,step:response.step as 'defense'|'armor'};
 if(response.step==='defense'){
  const defense=p.defenses[characterId];if(!defense||defense==='none')return null;const pool=p.defensePools?.[characterId]??defensePool(e,ch,defense);if(!pool)return null;
  return {context,...pool,purpose:defense==='dodge'?'Dodge':'Parry',isArmor:false,instructions:`${defense==='dodge'?'Dodge':'Parry'}: ${pool.label} · ${pool.base} Base + ${pool.skill} Skill ${pool.modifier>=0?'+':''}${pool.modifier} modifier + ${pool.gear} Gear. Roll, optionally push, attach and Send.`};
 }
 const monster=e.combatants.find(a=>a.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey),gear=armorRating(ch,monster?.ignoreArmor??0);if(gear===null)return null;
 return {context,label:'Armor',purpose:'Armor',attribute:null,base:0,skill:0,gear,modifier:0,isArmor:true,instructions:`Armor required · recorded rating ${gear}. Stage Armor, roll, attach and Send. Armor cannot be pushed. Custom Roll and Move cannot replace Armor.`};
}
