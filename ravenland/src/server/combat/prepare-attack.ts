import {createHash} from 'node:crypto';
import type {SqliteCampaignRepository} from '../sqlite';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {mechanicalCharacter} from '../mechanical-character';
import {activeCombat} from './store';
import {loadCombatRules,officialWeapon} from './sources';
import {verifiedCombatWeapon} from './equipment';
import {verifiedAttackRules} from './attack-rules';
import {weaponAttackOptions,type AttackPreparationView,type WeaponAttackType} from '../../lib/combat/attack-rules';
import {dispatchActions} from './action-dispatcher';
import {weaponReference,playerWeaponState} from './player-weapons';
import {AIError} from '../ai/config';
export function attackPreparation(repo:SqliteCampaignRepository,campaignId:string,characterId:string,principal:CharacterPrincipal|null,selectedIndex?:number):AttackPreparationView{
 requireCharacterAccess(principal,campaignId,characterId);const r=repo.get(campaignId),ch=r?.session.characters.find(c=>c.id===characterId);if(!r||!ch)throw new AIError('not_found','Character not found.',404);
 const e=activeCombat(repo,campaignId),rules=loadCombatRules(repo,campaignId),summary=verifiedAttackRules(rules.handbook);
 const weapons=mechanicalCharacter(ch).weapons.filter(w=>['melee','marksmanship'].includes(w.skill)&&(selectedIndex===undefined||w.index===selectedIndex)).map(w=>{const weapon=verifiedCombatWeapon(repo,r,characterId,w.index,officialWeapon(rules.handbook,w.name),principal);return {index:w.index,identity:createHash('sha256').update(JSON.stringify([characterId,w.index,ch.sheet?.weapons?.[w.index]])).digest('hex'),weapon,attribute:weapon.skill==='melee'?'strength' as const:'agility' as const,options:weaponAttackOptions(weapon)}});
 if(selectedIndex===undefined||selectedIndex===-1){if(!summary.unarmed)throw new AIError('combat_equipment_evidence','The original unarmed action rule is unavailable. Restore source evidence before rolling.',409);const weapon=officialWeapon(rules.handbook,'Unarmed');weapons.push({index:-1,identity:createHash('sha256').update(JSON.stringify([characterId,'unarmed'])).digest('hex'),weapon,attribute:'strength',options:weaponAttackOptions(weapon)})}
 return {active:!!e,encounterId:e?.id??null,weapons:weapons.map(w=>({...w,ref:weaponReference(ch,w.index),...(e?.combatants.find(a=>a.id===characterId)?playerWeaponState(e.combatants.find(a=>a.id===characterId)!,ch,w.index):{held:false,ready:false,loaded:false})})),targets:e?.combatants.filter(c=>c.side==='enemy'&&!c.broken&&!c.withdrawn).map(c=>({id:c.id,name:c.name}))??[],rules:summary,pending:e?.pending?{id:e.pending.id,actorId:e.pending.actorId,weaponIndex:e.pending.kind==='punch'?-1:e.pending.weaponIndex,type:e.pending.kind,targets:e.pending.targets,phase:e.pending.phase,attackModifier:e.pending.attackModifier??0}:null};
}
export async function prepareAttack(repo:SqliteCampaignRepository,input:{campaignId:string;characterId:string;requestId:string;weaponIndex:number;identity:string;targetId:string;type:WeaponAttackType},principal:CharacterPrincipal|null){
 const view=attackPreparation(repo,input.campaignId,input.characterId,principal,input.weaponIndex),w=view.weapons.find(w=>w.index===input.weaponIndex);if(!view.active)throw new AIError('combat_missing','Start an encounter before preparing a combat attack.',409);
 if(!w||w.identity!==input.identity)throw new AIError('combat_weapon','That equipment row changed. Refresh the verified weapon choices.',409);
 if(!w.options.some(o=>o.type===input.type)||!view.targets.some(t=>t.id===input.targetId))throw new AIError('combat_action','Choose a legal attack type and an actual active target.',409);
 if(view.pending&&(view.pending.actorId!==input.characterId||view.pending.weaponIndex!==input.weaponIndex||view.pending.type!==input.type||view.pending.targets[0]!==input.targetId))throw new AIError('combat_pending','Another combat step is already pending; it cannot be replaced by a different known outcome.',409);
 const c={campaignId:input.campaignId,characterId:input.characterId,requestId:input.requestId,kind:'chat' as const,action:`I ${input.type==='shoot'?'shoot':input.type==='punch'?'attack':input.type} with my ${w.weapon.name} against ${input.targetId}.`};
 const ch=repo.get(input.campaignId)!.session.characters.find(ch=>ch.id===input.characterId)!;
 const result=dispatchActions(repo,c,{encounterId:view.encounterId!,actorId:input.characterId,disposition:'actions',message:null,actions:[{type:'prepare_attack',weaponRef:weaponReference(ch,input.weaponIndex),targetId:input.targetId,attackType:input.type}]},principal);
 const failed=result.outcomes.find(o=>o.status==='blocked');if(failed)throw new AIError(failed.code??'combat_action',failed.message,409);
 const updated=attackPreparation(repo,input.campaignId,input.characterId,principal,input.weaponIndex);if(updated.pending?.actorId!==input.characterId||updated.pending.phase!=='attack_roll')throw new AIError('combat_action','The engine is not ready for this attack roll. Check the current combat step.',409);return updated;
}
