import type {Session} from '../../lib/types';
import type {CharacterPrincipal} from '../character-access';
import {mayReadCharacter} from '../character-access';
import {tableGM} from '../narrative/authority';
import type {SqliteCampaignRepository} from '../sqlite';
import {injuryProgress,injuryClockFor} from '../../lib/injury-timeline';
import {displayDate} from '../../lib/calendar';
export function privateInjuryContext(repo:SqliteCampaignRepository,id:string,s:Session,principal:CharacterPrincipal|null){
 const gm=tableGM(repo,id,principal).isTableGM;
 return {visibility:'Internal owner / Table GM only. Never quote or reveal these private injury records in shared narration or NPC dialogue. Alert through the affected character’s sheet or Table GM correction preview. A milestone is review, not healing.',records:s.characters.filter(ch=>gm||mayReadCharacter(principal,id,ch.id)).flatMap(ch=>(ch.sheet?.injuries??[]).filter(i=>i.status==='active').map(i=>({characterId:ch.id,id:i.id,name:i.name,sustainedDate:i.sustainedDate?displayDate(i.sustainedDate,s.environment?.calendar):'Date unknown',quarter:i.sustainedQuarter,progress:injuryProgress(i,injuryClockFor(s)),source:i.source.slice(0,500),policy:'Do not invent penalties, roll results or recovery. Original injury effects and lethal obligations remain authoritative.'}))).slice(0,30)};
}
export function guardInjuryDisclosure(s:Session,text:string){
 const privateNames=s.characters.flatMap(ch=>(ch.sheet?.injuries??[]).map(i=>i.name.trim()).filter(n=>n.length>=4));
 return privateNames.some(n=>text.toLowerCase().includes(n.toLowerCase()))?'Private recovery information is available on the affected character’s sheet for the owner and Table GM. Required recovery procedures remain unresolved until confirmed.':text;
}
