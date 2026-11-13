import {enemyChoices} from './enemy-choices';
import type {CombatEncounter,Defense,CombatResponse,CombatWorkflow} from '../../lib/combat/types';
import type {Session,Character} from '../../lib/types';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import {countSuccesses} from '../../lib/dice/engine';
import {mechanicalCharacter,exactInteger} from '../mechanical-character';
import {AIError} from '../ai/config';
import type {PendingDice} from '../../lib/dice/schema';
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
 if(!p&&e.actionDraft){const d=e.actionDraft,target=names([d.targetId]);return {headline:active.name+' is preparing an attack.',action:d.weaponName,targetNames:target,responses:[],declarationOptions:['slash','stab'],summary:`${active.name}, Slash or Stab with ${d.weaponName} against ${target.join(', ')}? Choose before rolling; no attack or defense has been committed.`,initiative:'The existing initiative order is preserved.'}}
 if(p){const attacker=e.combatants.find(c=>c.id===p.actorId)!,weapon=p.playerWeapon??(p.weaponIndex===null?null:attacker.enemy?.weapons[p.weaponIndex]),monster=attacker.enemy?.attacks.find(a=>a.key===p.monsterKey),action=monster?.name??weapon?.name??p.kind;
  for(const id of p.targets){const target=e.combatants.find(t=>t.id===id)!;if(target.side!=='player')continue;
   let step:CombatResponse['step']|null=null,skill:string|null=null,instruction='';
   if(p.phase==='declaration'&&p.defenses[id]===null){step='decision';instruction='Choose a legal defense or No Defense before '+attacker.name+' rolls the attack.'}
   else if(p.phase==='defense_roll'&&['dodge','parry'].includes(p.defenses[id]??'')&&!p.defenseRolls[id]&&e.rolls.some(r=>r.id===p.attackRolls[id]&&r.result&&countSuccesses(r.result)>0)){step='defense';skill=p.defenses[id]==='dodge'?'Move':'Melee';instruction='Roll '+skill+' for your recorded '+p.defenses[id]+' on the character sheet, push if desired, then attach the result to chat and Send (or use Submit to GM).'+(p.defenses[id]==='dodge'&&p.kind==='slash'?' Add the official +2 Skill Dice against Slash.':p.defenses[id]==='parry'&&p.kind==='stab'?' Against Stab: +2 Skill Dice with a shield or −2 with a weapon; a non-Parrying weapon also has its separate −2 penalty.':'')}
   else if(p.phase==='armor_roll'&&p.results.some(r=>r.targetId===id&&r.beforeArmor>0&&r.afterArmor===null)&&!p.armorRolls[id]){step='armor';skill='Armor';instruction='Roll the requested armor on your character sheet, then attach the result to chat and Send (or use Submit to GM). Armor cannot be pushed.'}
   if(step)responses.push({characterId:id,name:target.name,step,skill,instruction,options:step==='decision'?defenseOptions(e,id,characters.find(c=>c.id===id)):[]});
  }
  if(p.phase==='attack_roll'&&attacker.side==='player')responses.push({characterId:attacker.id,name:attacker.name,step:'attack',skill:p.kind==='shoot'?'Marksmanship':'Melee',instruction:'Roll '+action+' on your character sheet, optionally push, then attach the result to chat and Send (or use Submit to GM).',options:[]});
  const facts=p.results.filter(r=>r.afterArmor===null&&r.beforeArmor>0).map(r=>names([r.targetId])[0]+': '+r.beforeArmor+' damage before armor.').join(' ');
  const declaration=p.phase==='declaration'?attacker.name+' declares '+action+'. ':p.phase==='attack_roll'?p.targets.map(id=>p.defenses[id]&&p.defenses[id]!=='none'?names([id])[0]+' declares '+(p.defenses[id]==='dodge'?'Dodge':'Parry')+' before your roll.':'').filter(Boolean).join(' '):'';
  const headline='Round '+e.round+' — '+attacker.name+' attacks '+names(p.targets).join(', ')+'.';
  return {headline,action,targetNames:names(p.targets),responses,summary:headline+' '+declaration+facts+' '+(responses.length?responses.map(r=>'Awaiting '+r.name+': '+r.instruction).join(' '):p.phase==='adjudication'?p.notes.join(' '):'Resolving the recorded attack.'),initiative:'Numbered cards 1–10, lowest first; the existing order persists across rounds.'};
 }
 if(e.status==='active'&&active.side==='enemy'&&!enemyChoices(e).length)return {positionRequired:true,headline:'Awaiting positioning or adjudication',action:null,targetNames:[],responses:[],summary:'No supported enemy action is available in range. Confirm positioning before continuing.',initiative:'The existing initiative order is preserved.'};
 const headline='Round '+e.round+' — '+active.name+"'s turn.";return {headline,action:null,targetNames:[],responses,summary:headline+' '+(active.side==='player'?'Awaiting '+active.name+': declare your action or end your turn.':'Continue the GM turn to let '+active.name+' act.'),initiative:'Numbered cards 1–10, lowest first; the existing order persists across rounds.'};
}
export function checkCombatRoll(e:CombatEncounter,packet:VerifiedRollSubmission,session:Session){
 const p=e.pending,w=combatWorkflow(e,session.characters),expected=w.responses.filter(r=>r.step!=='decision');
 const need=expected.map(r=>r.name+"'s "+r.skill+' '+r.step+' roll').join(' or ')||w.summary;
 function fail(reason:string):never{throw new AIError('combat_roll',reason+' Waiting for '+need+(p?' against '+(e.combatants.find(a=>a.id===(p.actorId===packet.character.id?p.targets[0]:p.actorId))?.name??'the recorded participant'):'')+'. Submitted '+packet.label+' belongs to '+packet.character.name+'. The roll was not consumed.',409)}
 if(e.consumedPlayerRolls.includes(packet.rollId))fail('That roll already resolved a combat step.');if(!p)fail('No combat action is waiting for a player roll.');
 if(packet.createdAt<p.openedAt)fail('This roll predates the pending attack.');
 const response=expected.find(r=>r.characterId===packet.character.id);if(!response)fail('This character is not the requested responder.');
 if(!packet.combatContext&&response.step!=='attack'){const gates=e.rolls.filter(r=>Object.values(p.attackRolls).includes(r.id)||response.step==='armor'&&Object.values(p.defenseRolls).includes(r.id));if(gates.some(r=>packet.createdAt<=r.createdAt))fail('This legacy roll cannot establish that the required pre-roll decisions and preceding result were recorded first.');}
 const ctx=packet.combatContext;if(ctx&&(ctx.encounterId!==e.id||ctx.actionId!==p.id||ctx.round!==e.round||ctx.turnId!==e.combatants[e.turn].id||ctx.step!==response.step))fail('This roll was saved before the required action/defense step was ready, or belongs to another encounter or turn.');
 const first=(session.dice??[]).find(card=>card.characterId===packet.character.id&&!e.consumedPlayerRolls.includes(card.id)&&card.createdAt>=p.openedAt&&compatibleCombatCard(e,card,response,session.characters));
 const selection=()=>{if(first&&first.id!==packet.rollId)fail('Use the first compatible saved roll for this step ('+first.id+'). Later known outcomes cannot replace it; push the first roll if eligible.')};
 if(response.step==='attack'){const generic=!!ctx&&packet.label===response.skill&&packet.metadata.weaponIndex===null&&packet.metadata.attribute===(p.kind==='shoot'?'agility':'strength')&&packet.original.gear.length===p.playerWeapon?.bonus; if(packet.metadata.isArmor||packet.metadata.utility||!generic&&(packet.weapon?.recorded?.skill!==(p.kind==='shoot'?'marksmanship':'melee')||packet.metadata.weaponIndex!==p.weaponIndex||packet.weapon?.recorded?.name!==p.playerWeapon?.name||packet.weapon?.recorded?.damage!==p.playerWeapon?.damage))fail('Use the matching recorded weapon attack, or a bound '+response.skill+' pool including its verified weapon Gear Bonus.');selection();return {slot:'attackRolls' as const,target:p.targets[0]}}
 if(response.step==='defense'){if(packet.metadata.isArmor||packet.metadata.utility||packet.label!==response.skill&&!(response.skill==='Melee'&&/^Shield Parry:/.test(packet.label)))fail('Use the recorded '+response.skill+' defensive skill.');selection();return {slot:'defenseRolls' as const,target:response.characterId}}
 if(response.step==='armor'){const s=session.characters.find(c=>c.id===response.characterId)?.sheet,body=s?.['armor-worn']===true?exactInteger(s['armor-rating'],0,100):s?.['armor-worn']===false?0:null,helmet=s?.['helmet-worn']===true?exactInteger(s['helmet-rating'],0,100):s?.['helmet-worn']===false?0:null,monster=e.combatants.find(a=>a.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey);if(!packet.metadata.isArmor||packet.pushed||body===null||helmet===null||packet.result.attribute.length||packet.result.skillDice.length||packet.result.gear.length!==Math.max(0,body+helmet-(monster?.ignoreArmor??0)))fail('Use an unpushed roll matching the recorded armor rating.');selection();return {slot:'armorRolls' as const,target:response.characterId}}
 return fail('The declared defense decision is still required before an attack roll.');
}
// Stable save order, not highest successes or latest roll. Does not consume or
// modify anything; the full saved-roll verifier still runs before submission.
export function compatibleCombatCard(e:CombatEncounter,card:PendingDice,response:CombatResponse,characters:Character[]=[]){
 const p=e.pending;if(!p||card.metadata.utility||card.status==='Ready')return false;const ctx=card.combatContext;
 if(ctx&&(ctx.encounterId!==e.id||ctx.actionId!==p.id||ctx.round!==e.round||ctx.turnId!==e.combatants[e.turn].id||ctx.step!==response.step))return false;
 if(!ctx&&response.step!=='attack'&&e.rolls.some(r=>(Object.values(p.attackRolls).includes(r.id)||response.step==='armor'&&Object.values(p.defenseRolls).includes(r.id))&&card.createdAt<=r.createdAt))return false;
 if(response.step==='armor'){const s=characters.find(c=>c.id===response.characterId)?.sheet,body=s?.['armor-worn']===true?exactInteger(s['armor-rating'],0,100):s?.['armor-worn']===false?0:null,helmet=s?.['helmet-worn']===true?exactInteger(s['helmet-rating'],0,100):s?.['helmet-worn']===false?0:null,monster=e.combatants.find(a=>a.id===p.actorId)?.enemy?.attacks.find(a=>a.key===p.monsterKey);return card.metadata.isArmor&&!card.result.pushed&&body!==null&&helmet!==null&&!card.result.attribute.length&&!card.result.skillDice.length&&card.result.gear.length===Math.max(0,body+helmet-(monster?.ignoreArmor??0))}
 if(card.metadata.isArmor)return false;
 if(response.step==='defense')return card.result.skill===response.skill||response.skill==='Melee'&&/^Shield Parry:/.test(card.result.skill);
 if(response.step==='attack'){if(ctx&&card.result.skill===response.skill&&card.metadata.weaponIndex===null)return card.metadata.attribute===(p.kind==='shoot'?'agility':'strength')&&card.original.gear.length===p.playerWeapon?.bonus;
  try{const w=JSON.parse(card.weaponSnapshot??'null');return card.metadata.weaponIndex===p.weaponIndex&&w?.name===p.playerWeapon?.name&&Number(w?.dmg)===p.playerWeapon?.damage&&card.result.skill==='Attack: '+w.name}catch{return false}}
 return false;
}
