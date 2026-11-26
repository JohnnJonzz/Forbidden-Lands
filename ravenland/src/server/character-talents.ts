import type {CharacterSheet} from '../lib/character-sheet';
import type {SqliteCampaignRepository} from './sqlite';
import {loadCombatRules} from './combat/sources';
// Small reviewed fifth-printing catalog. Unknown/custom talents remain untyped.
// Source text must also be present before assigning any catalog classification.
const categories:Record<string,'K'|'P'|'G'>={adaptive:'K','path of healing':'P','axe fighter':'G','knife fighter':'G','hammer fighter':'G','spear fighter':'G','sword fighter':'G',bowyer:'G',sharpshooter:'G'};
export function verifiedTalentTypes(repo:SqliteCampaignRepository,campaignId:string,sheet:CharacterSheet):CharacterSheet {
 if(!sheet.talents?.some(t=>!t.type&&categories[t.name?.toLowerCase().trim()??'']))return sheet;
 let pages;try{pages=loadCombatRules(repo,campaignId).handbook;}catch{return sheet;}
 return {...sheet,talents:sheet.talents.map(t=>{const key=t.name?.toLowerCase().trim()??'',type=categories[key];return !t.type&&type&&pages.some(p=>p.text.replace(/\s+/g,' ').toLowerCase().includes(key))?{...t,type}:t;})};
}
