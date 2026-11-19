import type {SqliteCampaignRepository} from '../sqlite';
import {activeCombat} from '../combat/store';
import {preparations} from '../combat/preparation';
export function guardEncounterClaims(repo:SqliteCampaignRepository,id:string,text:string){
 if(activeCombat(repo,id))return text;
 const unactivated=preparations(repo,id).filter(p=>!p.preparation.encounterId&&!['cancelled','resolved'].includes(p.preparation.state));
 if((unactivated.length>0&&/\broll\b[^.!?]{0,100}\b(?:attack|marksmanship|melee|dodge|parry|armor)\b/i.test(text))||/\binitiative (?:has been|is|was) drawn\b|\b(?:monster|creature|nightwarg|bear|minotaur)\b[^.!?]{0,70}\b(?:hits|attacks you|attacks Grogahx|inflicts|deals \d|rending attack|roll.*(?:dodge|armor))\b/i.test(text))return 'Combat has not been initialized. Open Combat to activate the prepared encounter, confirm the actual participants and starting range, and draw saved initiative before resolving an attack. No attack or damage has occurred.';
 for(const {preparation:p} of preparations(repo,id).filter(p=>!p.preparation.encounterId&&!['cancelled','resolved','revealed'].includes(p.preparation.state))){if(p.monster)text=text.replace(new RegExp(p.monster.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'unidentified creature')}
 return text;
}
