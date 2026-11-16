import type {CombatEncounter,Combatant,CombatWeapon,CombatRange} from '../../lib/combat/types';
import type {WeaponHandling} from '../../lib/combat/mobility';
import {catalogWeapon} from '../../lib/equipment-catalog';
import {needsReady,needsLoad} from './action-economy';
const ranges:CombatRange[]=['Arm','Near','Short','Long'];
export function weaponInRange(w:CombatWeapon,range:CombatRange){return w.skill==='melee'?range==='Arm'||range==='Near'&&w.range==='Near':ranges.indexOf(range)<=ranges.indexOf(w.range as CombatRange)&&ranges.includes(w.range as CombatRange)}
const hands=(w:CombatWeapon)=>{const grip=w.grip??catalogWeapon(w.canonicalName??w.name)?.grip;return grip==='2H'?2:grip==='1H'?1:null};
export function handlingFor(e:CombatEncounter,a:Combatant):WeaponHandling{
 if(a.weaponHandling)return a.weaponHandling;
 const weapons=a.enemy?.weapons??[],last=e.pending?.actorId===a.id?e.pending.weaponIndex:e.pending?.defenses[a.id]==='parry'?weapons.findIndex(w=>w.skill==='melee'):[...e.history].reverse().find(p=>p.actorId===a.id)?.weaponIndex;
 const possible=weapons.map((w,i)=>({w,i})).filter(({w})=>(hands(w)??1)+(a.enemy?.shield?1:0)<=2),preferred=last!==null&&last!==undefined&&weapons[last]?last:(possible.find(({w})=>weaponInRange(w,e.range)&&(e.range==='Arm'?w.skill==='melee':w.skill==='marksmanship'))??possible[0])?.i??null;
 return {held:preferred===null?[]:[preferred],active:preferred};
}
export function heldParryWeapon(e:CombatEncounter,a:Combatant){return handlingFor(e,a).held.map(i=>a.enemy!.weapons[i]).filter(w=>w?.skill==='melee').sort((x,y)=>Number(/Parrying/.test(y.features))-Number(/Parrying/.test(x.features))||y.bonus-x.bonus)[0]}
export function canDraw(e:CombatEncounter,a:Combatant,index:number){const h=handlingFor(e,a),w=a.enemy?.weapons[index];if(!w||h.held.includes(index))return false;const required=hands(w),used=h.held.map(i=>a.enemy!.weapons[i]).map(hands);return required!==null&&!used.includes(null)&&used.reduce<number>((n,v)=>n+(v??0),a.enemy?.shield?1:0)+required<=2}
export interface EnemyChoice {id:string;label:string;targetId:string;weaponIndex:number|null;reason?:string}
export function ordinaryMove(e:CombatEncounter):{to:CombatRange;reason?:string}|null{
 if(!e.mobilityRules||e.movementCondition&&e.movementCondition!=='clear')return null;
 if(e.combatants.filter(a=>!a.broken&&!a.withdrawn&&a.side==='enemy').length!==1||e.combatants.filter(a=>!a.broken&&!a.withdrawn&&a.side==='player').length!==1)return null;
 return e.range==='Near'?{to:'Arm'}:e.range==='Short'?{to:'Near'}:null;
}
function plan(e:CombatEncounter,a:Combatant,index:number):('draw'|'ready'|'load'|'attack')[]|null{
 const w=a.enemy!.weapons[index],h=handlingFor(e,a);if(!weaponInRange(w,e.range))return null;const steps:('draw'|'ready'|'load'|'attack')[]=[];
 if(!h.held.includes(index)){if(!canDraw(e,a,index))return null;steps.push('draw')}
 if(needsLoad(w)&&!w.loaded)steps.push('load');else if(needsReady(w)&&(!w.ready||steps.length>0))steps.push('ready');steps.push('attack');return steps;
}
function fits(a:Combatant,steps:('draw'|'ready'|'load'|'attack')[]){let fast=a.fast,slow=a.slow;for(const step of steps){if(step==='load'||step==='attack'){if(!slow)return false;slow=false}else if(fast)fast=false;else if(slow)slow=false;else return false}return true}
// A deterministic, bounded policy over the actual verified encounter loadout.
// A model may only acknowledge the selected legal choice; it cannot add tactics.
export function enemyChoices(e:CombatEncounter):EnemyChoice[]{const a=e.combatants[e.turn];if(a.side!=='enemy'||a.broken||a.withdrawn)return [];const target=e.combatants.filter(t=>t.side==='player'&&!t.broken&&!t.withdrawn).sort((x,y)=>(x.current.strength??Infinity)-(y.current.strength??Infinity))[0];if(!target)return [];
 const end=(reason?:string):EnemyChoice[]=>[{id:'end',label:'End turn; preserve remaining actions for reactions',targetId:target.id,weaponIndex:null,reason}];
 if(a.prone)return a.fast||a.slow?[{id:'stand',label:'Stand up',targetId:target.id,weaponIndex:null}]:end();
 if(a.enemy!.kind==='monster')return a.slow?[{id:'monster',label:'Roll the published monster attack table',targetId:target.id,weaponIndex:null}]:end();
 const candidates=a.enemy!.weapons.map((w,i)=>({w,i,steps:plan(e,a,i)})).filter(c=>c.steps).sort((x,y)=>{const priority=(w:CombatWeapon)=>e.range==='Arm'?(w.skill==='melee'?0:1):(w.skill==='marksmanship'?0:1);return priority(x.w)-priority(y.w)||x.steps!.length-y.steps!.length||x.i-y.i});
 const complete=candidates.find(c=>fits(a,c.steps!));if(complete){const step=complete.steps![0],id=step==='attack'?'weapon':step;return [{id:id+':'+complete.i,label:step==='attack'?(complete.w.skill==='melee'?(/Edged|Blunt/.test(complete.w.features)?'Slash':'Stab'):'Shoot')+' with '+complete.w.name:step+' '+complete.w.name,targetId:target.id,weaponIndex:complete.i}]}
 const move=ordinaryMove(e);if((a.fast||a.slow)&&move&&a.enemy!.weapons.some((w,i)=>(handlingFor(e,a).held.includes(i)||canDraw(e,a,i))&&!weaponInRange(w,e.range)&&(weaponInRange(w,move.to)||w.skill==='melee')))return [{id:'run',label:'Run toward '+target.name+' to '+move.to,targetId:target.id,weaponIndex:null}];
 const preparation=candidates.find(c=>c.steps![0]!=='attack'&&fits(a,[c.steps![0]]));if(preparation){const step=preparation.steps![0];return [{id:step+':'+preparation.i,label:step+' '+preparation.w.name,targetId:target.id,weaponIndex:preparation.i}]}
 return end(!e.mobilityRules&&e.range!=='Arm'?'Official movement evidence is not recorded; no movement was invented.':e.range==='Long'?'Exact zones between LONG and weapon range are not recorded; movement requires adjudication.':e.movementCondition&&e.movementCondition!=='clear'?'The movement route requires adjudication; no movement was assumed.':!move&&e.range!=='Arm'?'Multiple combatants need explicit relative positioning before movement; no other combatant was moved.':undefined);
}
