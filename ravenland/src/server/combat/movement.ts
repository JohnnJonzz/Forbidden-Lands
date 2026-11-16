import type {CombatEncounter,CombatRange} from '../../lib/combat/types';
import {AIError} from '../ai/config';
import {spend,fastCost,interruptReadiness,recordAction} from './action-economy';
export function movementIntent(text:string,actorName:string){
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),subject=new RegExp('^(?:I|we|'+escape(actorName)+'|'+escape(actorName.split(' ')[0])+')\\s+','i');
 let clause=text.trim().replace(subject,'').replace(/^(?:will|want to|try to|tries to|attempt to)\s+/i,'');if(clause===text.trim()&&!/^(?:approach|retreat|run|back away|move|close the distance)\b/i.test(clause))return null;
 if(/^(?:do not|don't|never)\b/i.test(clause))return null;
 if(!/^(?:approach(?:es|ing)?|clos(?:e|es|ing)\s+(?:the\s+)?distance|mov(?:e|es|ing)\b|runs?\b|backs?\s+away|retreats?\b|flees?\b|crawls?\b)/i.test(clause))return null;
 return {away:/\b(?:away|back|retreat|flee)\b/i.test(clause),retreat:/^retreat/i.test(clause),ambiguous:/^(?:move|run)(?:[.!?]|$)/i.test(clause)||/\b(?:rough|blocked|abyss|climb|jump|crawl|flee|distant|long range|through the enemy|past the enemy)\b/i.test(clause),goalArm:/\b(?:into|to)\s+(?:sword|melee|arm.s length)\s*(?:range)?\b/i.test(clause)};
}
export function validateMovement(e:CombatEncounter,actorId:string){
 if(!e.mobilityRules)throw new AIError('combat_movement','Official movement evidence is unavailable; no movement was assumed.',409);
 if(e.pending)throw new AIError('combat_pending','Resolve the pending action before moving.',409);
 const actor=e.combatants[e.turn];if(actor.id!==actorId)throw new AIError('combat_turn','Wait for '+actor.name+"'s initiative turn. Your movement has not occurred.",409);
 if(actor.broken||actor.withdrawn||actor.prone)throw new AIError('combat_movement','Stand before running; prone, Broken or withdrawn movement requires its supported procedure.',409);
 if(e.movementCondition&&e.movementCondition!=='clear')throw new AIError('combat_movement','This route is '+e.movementCondition+'. Establish its zone/border or required Move roll before moving. No action was spent.',409);
 if(e.combatants.filter(a=>!a.broken&&!a.withdrawn&&a.side==='enemy').length!==1||e.combatants.filter(a=>!a.broken&&!a.withdrawn&&a.side==='player').length!==1)throw new AIError('combat_movement','Multiple combatants require explicit relative zones before moving. No other combatant was moved.',409);
}
export function runMovement(e:CombatEncounter,actorId:string,targetId:string,to:CombatRange){
 validateMovement(e,actorId);const actor=e.combatants[e.turn],from=e.range;
 if(from==='Arm')throw new AIError('combat_movement','An active enemy is at ARM’S LENGTH. Use Retreat and its Move roll; Run cannot bypass the free-attack rule.',409);
 if(!(['Near:Arm','Short:Near','Near:Short'].includes(from+':'+to)))throw new AIError('combat_movement','A Run crosses one neighboring zone or NEAR to ARM’S LENGTH. Exact LONG distances are not recorded.',409);
 const cost=fastCost(actor);spend(actor,'fast');interruptReadiness(actor);e.range=to;delete e.actionDraft;recordAction(e,{actorId,targetId,kind:'run',cost,from,to});return actor.name+' runs from '+from+' to '+to+'.';
}
