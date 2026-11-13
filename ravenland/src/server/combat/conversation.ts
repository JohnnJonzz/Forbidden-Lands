import type {Character} from '../../lib/types';
import type {CombatEncounter} from '../../lib/combat/types';
import {combatWorkflow} from './workflow';

// Gameplay dialogue without a verified combat event cannot establish a new
// mechanical outcome or independently choose the next roll. Buffer before use.
export function synchronizeCombatConversation(e:CombatEncounter,text:string,characters:Character[]){
 const prompt=combatWorkflow(e,characters).summary;
 if(/\b(?:roll|reroll|push|submit|success(?:es)?|damage|wound\w*|injur\w*|bleed\w*|prone|draws?|stands? up|hits?|strikes? home|falls?|collaps\w*|broken|dead|dies|slain)\b/i.test(text))return prompt;
 return text.trim()+'\n\n'+prompt;
}
