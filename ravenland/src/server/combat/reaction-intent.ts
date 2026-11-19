import type {CombatEncounter} from '../../lib/combat/types';
import type {Character} from '../../lib/types';
import type {ActionInterpretation} from '../../lib/combat/action-intents';
// Only an explicit declaration by the selected PC; questions, negation, other
// characters and reported success counts are not mechanical instructions.
export function reactionIntent(e:CombatEncounter,character:Character,text:string):ActionInterpretation|null{
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const m=text.trim().match(new RegExp('^(?:I|'+escape(character.name)+'|'+escape(character.name.split(' ')[0])+')\\s+(?:(?:will|want to)\\s+)?(dodge[ s]?|parr(?:y|ies))(?:\\s+(?:the|this|that|pending)\\s+attack)?[.!]?$','i'));
 if(!m||!e.pending)return null;
 return {encounterId:e.id,actorId:character.id,disposition:'actions',actions:[{type:'declare_defense',defense:m[1].toLowerCase().startsWith('dodge')?'dodge':'parry'}],message:null};
}
