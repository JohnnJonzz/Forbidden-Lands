import {catalogWeapon} from '../../lib/equipment-catalog';
import {createHash} from 'node:crypto';
import type {Character,CampaignRecord} from '../../lib/types';
import type {CombatEncounter,Combatant,CombatWeapon} from '../../lib/combat/types';
import type {CharacterPrincipal} from '../character-access';
import type {SqliteCampaignRepository} from '../sqlite';
import {mechanicalCharacter} from '../mechanical-character';
import {characterResources} from '../resource-awareness';
import {AIError} from '../ai/config';
import {officialWeapon} from './sources';
import {verifiedCombatWeapon} from './equipment';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import {fastCost,interruptReadiness,needsLoad,needsReady,recordAction,spend} from './action-economy';

export function weaponReference(character:Character,index:number){
 const saved=character.sheet?.weapons?.[index];
 const row=index===-1?'unarmed':{identity:catalogWeapon(saved?.name??'')?.id??saved?.name,skill:saved?.skill};
 return `${index}:${createHash('sha256').update(JSON.stringify([character.id,index,row])).digest('hex')}`;
}
export function recordedWeaponRefs(character:Character){return mechanicalCharacter(character).weapons.filter(w=>['melee','marksmanship'].includes(w.skill)).map(w=>({index:w.index,ref:weaponReference(character,w.index),name:w.name,skill:w.skill}));}
export function resolvePlayerWeapon(repo:SqliteCampaignRepository,record:CampaignRecord,actorId:string,reference:string,pages:SourcePassage[],principal:CharacterPrincipal|null){
 const ch=record.session.characters.find(c=>c.id===actorId)!;
 const index=reference===weaponReference(ch,-1)?-1:recordedWeaponRefs(ch).find(w=>w.ref===reference)?.index;
 if(index===undefined)throw new AIError('combat_weapon','That weapon reference is missing or changed. Refresh the recorded weapon choices.',409);
 const official=officialWeapon(pages,index===-1?'Unarmed':mechanicalCharacter(ch).weapons[index].name);
 return {index,weapon:index===-1?official:verifiedCombatWeapon(repo,record,actorId,index,official,principal),character:ch,reference};
}
export function playerWeaponState(actor:Combatant,character:Character,index:number){
 const reference=weaponReference(character,index),saved=actor.weaponHandling?.preparation?.[String(index)];
 const valid=saved?.reference===reference;
 return {reference,held:!!valid&&!!actor.weaponHandling?.held.includes(index),ready:!!valid&&!!saved.ready,loaded:!!valid&&!!saved.loaded};
}
export function heldPlayerWeapons(actor:Combatant,character:Character){
 return (character.sheet?.weapons??[]).filter((_w,index)=>playerWeaponState(actor,character,index).held);
}
export function ammunition(character:Character,weapon:CombatWeapon){
 if(!needsLoad(weapon)&&!needsReady(weapon)||/sling/i.test(weapon.name))return {state:'untracked' as const,source:'not tracked by the sheet',recorded:null};
 const a=characterResources(character).arrows;return {state:a.state,source:a.source,recorded:a.recorded};
}
export function requireAmmunition(character:Character,weapon:CombatWeapon){
 const a=ammunition(character,weapon);
 if(a.state==='empty'||a.state==='unknown')throw new AIError('combat_resource',a.state==='empty'?'Recorded ammunition is exhausted. Update the player-managed supplies or choose another action.':'Ammunition availability is unknown. Establish it on the sheet before preparing this weapon.',409);
 return a;
}
export function requireHeld(actor:Combatant,character:Character,index:number){
 validateHands(actor,character);
 if(index!==-1&&!playerWeaponState(actor,character,index).held)throw new AIError('combat_weapon_not_held','That weapon is carried, with no verified held state. Draw it using the Combat controls before preparing an attack; drawing costs an action.',409);
}
function validateHands(actor:Combatant,character:Character){
 const held=actor.weaponHandling?.held??[];
 if(held.some(i=>!playerWeaponState(actor,character,i).held))throw new AIError('combat_weapon_changed','A held weapon row changed. Reconcile its held state by restoring that row or adjudicating the change; no free drop or draw was inferred.',409);
 const used=held.reduce((n,i)=>n+(catalogWeapon(character.sheet?.weapons?.[i]?.name??'')?.grip==='2H'?2:1),character.sheet?.['shield-worn']===true?1:0);
 if(used>2)throw new AIError('combat_hands','The recorded held weapons and shield require more than two hands. Adjudicate that equipment change before preparing another action.',409);
}
export function handlePlayerWeapon(e:CombatEncounter,actor:Combatant,character:Character,index:number,weapon:CombatWeapon,type:'draw_weapon'|'ready_weapon'|'load_weapon'){
 if(index===-1)throw new AIError('combat_weapon','Unarmed is a combat option, not a weapon to draw, ready or load.',409);
 const reference=weaponReference(character,index),state=playerWeaponState(actor,character,index);
 const h=actor.weaponHandling??={held:[],active:null,preparation:{}};
 h.preparation??={};
 if(type==='draw_weapon'){
  validateHands(actor,character);
  if(state.held)return `${weapon.name} is already held; no action was spent.`;
  const grip=weapon.grip==='2H'?2:weapon.grip==='1H'?1:null;
  const known=h.held.filter(i=>playerWeaponState(actor,character,i).held);
  const used=known.reduce((n,i)=>{const w=mechanicalCharacter(character).weapons[i];return n+(catalogWeapon(w?.name??'')?.grip==='2H'?2:1)},character.sheet?.['shield-worn']===true?1:0);
  if(grip===null||used+grip>2)throw new AIError('combat_hands','No verified free hand is available. Dropping or stowing requires adjudication; nothing was discarded.',409);
  const cost=fastCost(actor);spend(actor,'fast');interruptReadiness(actor);
  h.held=known.concat(index);h.active=index;h.preparation[String(index)]={reference,ready:false,loaded:state.loaded};
  recordAction(e,{actorId:actor.id,kind:'draw',cost,weapon:weapon.name});return `${actor.name} draws ${weapon.name}.`;
 }
 requireHeld(actor,character,index);
 if(type==='ready_weapon'&&!needsReady(weapon)||type==='load_weapon'&&!needsLoad(weapon))throw new AIError('combat_weapon_preparation','This weapon does not use that preparation action. Bows/slings Ready; crossbows Load.',409);
 const ammo=requireAmmunition(character,weapon);
 if(type==='ready_weapon'&&state.ready||type==='load_weapon'&&state.loaded)return `${weapon.name} is already ${type==='ready_weapon'?'readied':'loaded'}; no action was spent.`;
 const cost=type==='load_weapon'?'slow':fastCost(actor);spend(actor,type==='load_weapon'?'slow':'fast');interruptReadiness(actor);
 h.preparation[String(index)]={reference,ready:type==='ready_weapon',loaded:type==='load_weapon'||state.loaded,ammunition:ammo};h.active=index;
 recordAction(e,{actorId:actor.id,kind:type==='ready_weapon'?'ready':'load',cost,weapon:weapon.name});return `${actor.name} ${type==='ready_weapon'?'readies':'loads'} ${weapon.name}.`;
}
