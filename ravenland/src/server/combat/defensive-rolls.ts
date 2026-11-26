import {currentWeaponGear} from '../../lib/character-data';
import type {Character} from '../../lib/types';
import type {CombatAttack,CombatEncounter,Defense} from '../../lib/combat/types';
import {countSuccesses} from '../../lib/dice/engine';
import {mechanicalCharacter,exactInteger} from '../mechanical-character';
import {heldPlayerWeapons} from './player-weapons';
import {catalogWeapon} from '../../lib/equipment-catalog';

import type {DefensePool} from '../../lib/combat/requested-roll';
export function attackScore(e:CombatEncounter,p:CombatAttack,id:string){const roll=e.rolls.find(r=>r.id===p.attackRolls[id]&&r.actionId===p.id&&r.combatantId===p.actorId&&r.type==='attack');return roll?.result?countSuccesses(roll.result):null}
export function defenseRecorded(e:CombatEncounter,p:CombatAttack,id:string){return e.rolls.some(r=>r.id===p.defenseRolls[id]&&r.actionId===p.id&&r.combatantId===id&&r.type==='defense'&&!!r.result)}
export function needsPlayerDefense(e:CombatEncounter,p:CombatAttack,id:string){return e.combatants.some(a=>a.id===id&&a.side==='player'&&!a.companion)&&(attackScore(e,p,id)??0)>0&&!!p.defenses[id]&&p.defenses[id]!=='none'&&!defenseRecorded(e,p,id)}

export function defensiveSequenceIssue(e:CombatEncounter){
 const p=e.pending;if(!p||!['defense_roll','armor_roll'].includes(p.phase))return null;
 if(p.targets.some(id=>attackScore(e,p,id)===null))return 'The pending attack dice cannot be verified. Review or restore its saved combat record; no roll or outcome can be substituted.';
 if(p.targets.some(id=>p.defenseRolls[id]&&!defenseRecorded(e,p,id)))return 'A recorded defensive roll is missing or inconsistent. Review or restore that saved result; do not roll a replacement.';
 if(p.targets.some(id=>needsPlayerDefense(e,p,id))&&Object.keys(p.armorRolls).length)return 'Armor is already recorded while a required defense is missing. This sequence requires adjudication from the saved audit; do not reroll either outcome.';
 return null;
}

// Capture before any push changes the sheet. A zero-success roll is still a
// recorded defense; the result's identity, not its success count, is the gate.
export function defensePool(e:CombatEncounter,character:Character,defense:Exclude<Defense,'none'>):DefensePool|null{
 const p=e.pending!,rules=p.rules;if(!rules)return null; // legacy records retain their pre-existing checks
 const mc=mechanicalCharacter(character),attribute=defense==='dodge'?'agility':'strength',base=mc.attributes[attribute].current,skill=mc.skills[defense==='dodge'?'skill-move':'skill-melee'];
 if(base===null||skill===null)return null;
 if(defense==='dodge')return {defense,label:'Move',attribute,base,skill,gear:0,modifier:p.kind==='slash'?rules.modifiers.slashDodge:0};
 const s=character.sheet!,shield=s['shield-worn']===true&&s['shield-carried']!=='No'&&exactInteger(s['shield-bonus'],1,12)!==null,actor=e.combatants.find(a=>a.id===character.id)!,held=heldPlayerWeapons(actor,character).filter(w=>w.skill==='melee'),active=s.weapons?.[actor.weaponHandling?.active??-1],weapon=held.includes(active!)?active:held.length===1?held[0]:null;
 const gear=shield?exactInteger(s['shield-bonus'],0,100):weapon?exactInteger(currentWeaponGear(weapon),0,100):null;if(gear===null)return null;
 const features=weapon?(catalogWeapon(weapon.name??'')?.features??weapon.feat??''):'';
 const misc=shield?exactInteger(s['shield-modifier']??'0',-100,100):0;if(misc===null)return null;
 let talentBonus=0;if(!shield&&weapon){const sword=['shortsword','broadsword','longsword','two-handed-sword','scimitar','falchion'].includes(catalogWeapon(weapon.name??'')?.id??''),talent=mc.talents.find(t=>t.name.toLowerCase()==='sword fighter');if(sword&&talent){if(talent.rank!==1||!rules.swordFighter)return null;talentBonus=rules.swordFighter.parryBonus;}if(weapon.destroyed||Number(currentWeaponGear(weapon))===0&&Number(weapon.gearBonus)>0)return null;}
 const modifier=talentBonus+misc+(p.kind==='stab'?(shield?rules.modifiers.stabShieldParry:rules.modifiers.stabWeaponParry):p.kind==='punch'?rules.unarmed?.parryBonus??0:0)+(!shield&&!/Parrying/i.test(features)?rules.modifiers.nonParryingWeapon:0);
 return {defense,label:shield?'Shield Parry: '+(s['shield-name']||'Shield'):'Melee',attribute,base,skill,gear,modifier};
}
export function armorRating(character:Character,ignore=0):number|null{
 const s=character.sheet;if(!s)return null;let total=0;
 for(const piece of ['armor','helmet'] as const){if(s[`${piece}-worn`]===false||s[`${piece}-carried`]==='No')continue;if(s[`${piece}-worn`]!==true)return null;const value=exactInteger(s[`${piece}-rating`],0,100),raw=s[`${piece}-modifier`],modifier=raw===undefined||raw===''?0:exactInteger(raw,-100,100);if(value===null||modifier===null)return null;total+=Math.max(0,value+modifier)}
 return Math.max(0,total-ignore);
}
