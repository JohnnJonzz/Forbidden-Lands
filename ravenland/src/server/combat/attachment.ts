import type {CombatEncounter} from '../../lib/combat/types';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import {AIError} from '../ai/config';
import type {Session} from '../../lib/types';
export function combatRollIntended(roll:VerifiedRollSubmission){return !roll.metadata.utility&&(roll.rollType==='Attack'||roll.rollType==='Armor'||/^(?:Melee|Move|Marksmanship|Shield Parry:)/.test(roll.label))}
export function validateAttachmentNarrative(e:CombatEncounter,roll:VerifiedRollSubmission,text:string,session:Session){
 const p=e.pending;if(!text||!p)return;
 if(p.phase==='defense_roll'&&p.targets.includes(roll.character.id)){const choice=text.match(/\b(?:I|we)\s+(?:(?:choose|declare|try to)\s+)?(dodge|parry)\b/i)?.[1].toLowerCase();if(choice&&choice!==p.defenses[roll.character.id])throw new AIError('combat_attachment','The defensive response was recorded before the attack roll. Narrative text cannot change it after seeing the result.',409)}
 if(p.actorId!==roll.character.id||p.phase!=='attack_roll')return;
 const types=[...text.matchAll(/\b(slash|stab|shoot|punch|kick)(?:es|s|bing|ing)?\b/gi)].map(m=>/punch|kick/i.test(m[1])?'punch':m[1].toLowerCase());
 if(types.some(t=>t!==p.kind))throw new AIError('combat_attachment','The saved roll belongs to the declared '+p.kind.toUpperCase()+'. Narrative text cannot select a different attack type after rolling.',409);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),others=session.characters.find(c=>c.id===roll.character.id)?.sheet?.weapons?.filter(w=>w.name&&w.name!==p.playerWeapon?.name)??[];
 if(others.some(w=>new RegExp('\\bwith\\s+(?:(?:my|the|a|an)\\s+)?'+escape(w.name!)+'\\b','i').test(text)))throw new AIError('combat_attachment','This saved roll belongs to the already-declared weapon. A different recorded weapon requires a new legal declaration before rolling.',409);
 if(e.combatants.some(t=>t.side==='enemy'&&!p.targets.includes(t.id)&&new RegExp('\\b(?:at|against|attack|slash|stab|shoot)\\s+(?:the\\s+)?'+escape(t.name)+'\\b','i').test(text)))throw new AIError('combat_attachment','This saved roll belongs to its already-declared target. Narrative text cannot retarget it after rolling.',409);
}
