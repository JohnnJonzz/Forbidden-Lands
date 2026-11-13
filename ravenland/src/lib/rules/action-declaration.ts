import {standardSkill,type SkillId} from './character-registry';

// A bounded declaration recognizer, not a new action/state engine. Names identify
// the selected actor only; they never grant access to another character's sheet.
export function declaredAction(text:string,actorName?:string){
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),names=actorName?[actorName,actorName.trim().split(/\s+/)[0]].filter(Boolean).map(escape):[];
 const subject=new RegExp('^(?:I|we'+(names.length?'|'+names.join('|'):'')+')\\s+','iu'),match=text.trim().match(subject);if(!match)return null;
 let clause=text.trim().slice(match[0].length).replace(/^(?:will|want to|try to|tries to|attempt to|attempts to|am going to|is going to)\s+/i,'');
 if(/^(?:do not|don't|does not|doesn't|never)\b/i.test(clause))return null;
 clause=clause.replace(/^(?:raises?|readies|ready|draws?|aims?|lifts?|nocks?|takes? aim)\b[^.!?]{0,160}?\b(?:and|then)\s+/i,'');
 const verb=clause.match(/^(shoots?|fires?|looses?|attacks?|slash(?:es)?|stabs?|manipulates?|persuades?|convinces?|coerces?|threatens?|lights?|ignites?|relights?|uses?|eats?|consumes?|drinks?|sips?|rolls?)\b/i)?.[1].toLowerCase();if(!verb)return null;
 let skill:SkillId|null=null,kind:'ranged_attack'|'melee_attack'|'skill'|'consumable'='consumable';
 if(/^(?:shoot|fire|loose)/.test(verb)&&(/^(?:shoot)/.test(verb)||/\b(?:long\s?bow|short\s?bow|bow|crossbow|arrows?|bolts?)\b/i.test(clause))){skill='marksmanship';kind='ranged_attack'}
 else if(/^(?:attack|slash|stab)/.test(verb)){skill=/\b(?:long\s?bow|short\s?bow|bow|crossbow|arrows?|bolts?)\b/i.test(clause)?'marksmanship':'melee';kind=skill==='marksmanship'?'ranged_attack':'melee_attack'}
 else if(/^(?:manipulate|persuade|convince|coerce|threaten)/.test(verb)){skill='manipulation';kind='skill'}
 else if(/^(?:use|roll)/.test(verb)){const named=clause.replace(/^\w+\s+(?:(?:my|the|a)\s+)?/i,'').match(/^([\p{L} ]+?)(?:\s+(?:skill|to|against|on|for)\b|[.!?]|$)/u)?.[1];skill=named?standardSkill(named)?.id??null:null;if(skill)kind='skill';else if(!/\btorch(?:es)?\b/i.test(clause))return null}
 else if(!/\b(?:torch(?:es)?|food|rations?|water|waterskin)\b/i.test(clause))return null;
 return {kind,skill,verb};
}
