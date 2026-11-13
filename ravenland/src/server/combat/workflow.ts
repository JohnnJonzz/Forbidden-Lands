import type {CombatEncounter,Defense,CombatResponse,CombatWorkflow} from '../../lib/combat/types';
import type {Session,Character} from '../../lib/types';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import {countSuccesses} from '../../lib/dice/engine';
import {mechanicalCharacter,exactInteger} from '../mechanical-character';
import {AIError} from '../ai/config';
export function defenseOptions(e:CombatEncounter,targetId:string,character?:Character):Defense[]{
 const p=e.pending,t=e.combatants.find(c=>c.id===targetId);if(!p||!t||!p.targets.includes(targetId)||!t.fast&&!t.slow||t.broken||t.withdrawn)return ['none'];
 const attack=e.combatants.find(c=>c.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey);let parry=!attack||attack.parry;
 if(character){const mc=mechanicalCharacter(character),s=character.sheet,shield=s?.['shield-worn']===true&&exactInteger(s['shield-bonus'],1,12)!==null,weapon=character.sheet?.weapons?.some(w=>w.skill==='melee'),exception=character.sheet?.weapons?.some(w=>/parrying/i.test(w.feat??'')&&mc.talents.some(t=>(t.rank??0)>=2&&['sword','axe','spear','hammer','knife'].some(k=>t.name.toLowerCase().includes(k)&&(w.name??'').toLowerCase().includes(k))));parry=parry&&(p.kind==='shoot'?!!(shield||exception):!!(shield||weapon))}
 return ['none',...(!attack||attack.dodge?['dodge' as const]:[]),...(parry?['parry' as const]:[])];
}
export function combatWorkflow(e:CombatEncounter,characters:Character[]=[]):CombatWorkflow{
 const active=e.combatants[e.turn],p=e.pending,names=(ids:string[])=>ids.map(id=>e.combatants.find(c=>c.id===id)?.name??id),responses:CombatResponse[]=[];
 const critical=e.combatants.filter(a=>a.side==='enemy'&&a.critical?.status==='required');
 if(e.status==='active'&&critical.length){const blocker='The required critical injury for '+critical.map(a=>a.name).join(', ')+' is not established by the available source table. Restore the evidence and recheck the critical before continuing.';return {blocker,headline:'Critical injury requires adjudication',action:null,targetNames:critical.map(a=>a.name),responses:[],summary:blocker,initiative:'The existing initiative order is preserved.'}}
 if(p){const attacker=e.combatants.find(c=>c.id===p.actorId)!,weapon=p.playerWeapon??(p.weaponIndex===null?null:attacker.enemy?.weapons[p.weaponIndex]),monster=attacker.enemy?.attacks.find(a=>a.key===p.monsterKey),action=monster?.name??weapon?.name??p.kind;
  for(const id of p.targets){const target=e.combatants.find(t=>t.id===id)!;if(target.side!=='player')continue;
   let step:CombatResponse['step']|null=null,skill:string|null=null,instruction='';
   if(p.phase==='declaration'&&p.defenses[id]===null){step='decision';instruction='Choose a legal defense or No Defense before '+attacker.name+' rolls the attack.'}
   else if(p.phase==='defense_roll'&&['dodge','parry'].includes(p.defenses[id]??'')&&!p.defenseRolls[id]&&e.rolls.some(r=>r.id===p.attackRolls[id]&&r.result&&countSuccesses(r.result)>0)){step='defense';skill=p.defenses[id]==='dodge'?'Move':'Melee';instruction='Roll '+skill+' for your recorded '+p.defenses[id]+' on the character sheet, push if desired, then Submit to GM.'+(p.defenses[id]==='dodge'&&p.kind==='slash'?' Add the official +2 Skill Dice against Slash.':p.defenses[id]==='parry'&&p.kind==='stab'?' Against Stab: +2 Skill Dice with a shield or −2 with a weapon; a non-Parrying weapon also has its separate −2 penalty.':'')}
   else if(p.phase==='armor_roll'&&p.results.some(r=>r.targetId===id&&r.beforeArmor>0&&r.afterArmor===null)&&!p.armorRolls[id]){step='armor';skill='Armor';instruction='Roll the requested armor on your character sheet, then Submit to GM. Armor cannot be pushed.'}
   if(step)responses.push({characterId:id,name:target.name,step,skill,instruction,options:step==='decision'?defenseOptions(e,id,characters.find(c=>c.id===id)):[]});
  }
  if(p.phase==='attack_roll'&&attacker.side==='player')responses.push({characterId:attacker.id,name:attacker.name,step:'attack',skill:p.kind==='shoot'?'Marksmanship':'Melee',instruction:'Roll '+action+' on your character sheet, optionally push, then Submit to GM.',options:[]});
  const facts=p.results.filter(r=>r.afterArmor===null&&r.beforeArmor>0).map(r=>names([r.targetId])[0]+': '+r.beforeArmor+' damage before armor.').join(' ');
  const declaration=p.phase==='declaration'?attacker.name+' declares '+action+'. ':p.phase==='attack_roll'?p.targets.map(id=>p.defenses[id]&&p.defenses[id]!=='none'?names([id])[0]+' declares '+(p.defenses[id]==='dodge'?'Dodge':'Parry')+' before your roll.':'').filter(Boolean).join(' '):'';
  const headline='Round '+e.round+' — '+attacker.name+' attacks '+names(p.targets).join(', ')+'.';
  return {headline,action,targetNames:names(p.targets),responses,summary:headline+' '+declaration+facts+' '+(responses.length?responses.map(r=>'Awaiting '+r.name+': '+r.instruction).join(' '):p.phase==='adjudication'?p.notes.join(' '):'Resolving the recorded attack.'),initiative:'Numbered cards 1–10, lowest first; the existing order persists across rounds.'};
 }
 const headline='Round '+e.round+' — '+active.name+"'s turn.";return {headline,action:null,targetNames:[],responses,summary:headline+' '+(active.side==='player'?'Awaiting '+active.name+': declare your action or end your turn.':'Continue the GM turn to let '+active.name+' act.'),initiative:'Numbered cards 1–10, lowest first; the existing order persists across rounds.'};
}
export function checkCombatRoll(e:CombatEncounter,packet:VerifiedRollSubmission,session:Session){
 const p=e.pending,w=combatWorkflow(e,session.characters),expected=w.responses.filter(r=>r.step!=='decision');
 const need=expected.map(r=>r.name+"'s "+r.skill+' '+r.step+' roll').join(' or ')||w.summary;
 function fail(reason:string):never{throw new AIError('combat_roll',reason+' Waiting for '+need+(p?' against '+(e.combatants.find(a=>a.id===p.actorId)?.name??'the recorded attacker'):'')+'. Submitted '+packet.label+' belongs to '+packet.character.name+'. The roll was not consumed.',409)}
 if(e.consumedPlayerRolls.includes(packet.rollId))fail('That roll already resolved a combat step.');if(!p)fail('No combat action is waiting for a player roll.');
 if(packet.createdAt<p.openedAt)fail('This roll predates the pending attack.');
 const response=expected.find(r=>r.characterId===packet.character.id);if(!response)fail('This character is not the requested responder.');
 if(response.step==='attack'){if(packet.metadata.isArmor||packet.metadata.utility||packet.weapon?.recorded?.skill!==(p.kind==='shoot'?'marksmanship':'melee')||packet.metadata.weaponIndex!==p.weaponIndex||packet.weapon?.recorded?.name!==p.playerWeapon?.name||packet.weapon?.recorded?.damage!==p.playerWeapon?.damage)fail('Use the matching recorded weapon attack.');return {slot:'attackRolls' as const,target:p.targets[0]}}
 if(response.step==='defense'){if(packet.metadata.isArmor||packet.metadata.utility||packet.label!==response.skill&&!(response.skill==='Melee'&&/^Shield Parry:/.test(packet.label)))fail('Use the recorded '+response.skill+' defensive skill.');return {slot:'defenseRolls' as const,target:response.characterId}}
 if(response.step==='armor'){const s=session.characters.find(c=>c.id===response.characterId)?.sheet,body=s?.['armor-worn']===true?exactInteger(s['armor-rating'],0,100):s?.['armor-worn']===false?0:null,helmet=s?.['helmet-worn']===true?exactInteger(s['helmet-rating'],0,100):s?.['helmet-worn']===false?0:null,monster=e.combatants.find(a=>a.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey);if(!packet.metadata.isArmor||packet.pushed||body===null||helmet===null||packet.result.attribute.length||packet.result.skillDice.length||packet.result.gear.length!==Math.max(0,body+helmet-(monster?.ignoreArmor??0)))fail('Use an unpushed roll matching the recorded armor rating.');return {slot:'armorRolls' as const,target:response.characterId}}
 return fail('The declared defense decision is still required before an attack roll.');
}
