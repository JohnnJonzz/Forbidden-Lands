import {randomUUID} from 'node:crypto';
import type {Combatant,CombatEncounter,CombatWeapon} from '../../lib/combat/types';
import type {CombatAction} from '../../lib/combat/mobility';
import {AIError} from '../ai/config';
export function spend(a:Combatant,type:'slow'|'fast'){
 if(a.broken||a.withdrawn)throw new AIError('combat_action','That combatant cannot act.',409);
 if(type==='slow'){if(!a.slow)throw new AIError('combat_action','No slow action remains.',409);a.slow=false}else if(a.fast)a.fast=false;else if(a.slow)a.slow=false;else throw new AIError('combat_action','No action remains for a reaction.',409);
}
export const needsReady=(w:CombatWeapon)=>w.skill==='marksmanship'&&!/crossbow/i.test(w.canonicalName??w.name)&&/bow|sling/i.test(w.canonicalName??w.name);
export const needsLoad=(w:CombatWeapon)=>w.skill==='marksmanship'&&/crossbow/i.test(w.canonicalName??w.name);
export function interruptReadiness(a:Combatant){for(const w of a.enemy?.weapons??[])if(needsReady(w))w.ready=false;for(const w of Object.values(a.weaponHandling?.preparation??{}))w.ready=false}
export function recordAction(e:CombatEncounter,action:Omit<CombatAction,'id'|'round'|'at'|'sources'|'attackCursor'>){const value={...action,id:randomUUID(),round:e.round,at:new Date().toISOString(),sources:e.mobilityRules?.sources??e.sources,attackCursor:e.history.length};(e.actions??=[]).push(value);return value}
export function fastCost(a:Combatant){return a.fast?'fast' as const:'slow' as const}
