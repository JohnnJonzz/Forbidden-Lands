import type {Session,Character} from '../../lib/types';
import type {CombatRange} from '../../lib/combat/types';
import type {SqliteCampaignRepository} from '../sqlite';
export interface EncounterSetup {participants:string[];participantsKnown:boolean;enemies:string;range:CombatRange|null;declaration:string}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function namedParticipants(text:string,characters:Character[]){
 const full=characters.filter(c=>new RegExp('\\b'+escape(c.name)+'\\b','i').test(text));
 const ids=new Set(full.map(c=>c.id));let ambiguous=false;
 for(const c of characters){const alias=c.name.split(/\s+/)[0];if(!new RegExp('\\b'+escape(alias)+'\\b','i').test(text))continue;const matches=characters.filter(c=>c.name.split(/\s+/)[0].toLowerCase()===alias.toLowerCase());if(matches.length===1)ids.add(c.id);else if(!matches.some(m=>ids.has(m.id)))ambiguous=true}
 return {ids:[...ids],ambiguous};
}
export function encounterRequest(text:string){return !/^\/combat\b/i.test(text)&&!/\b(?:explain|according to|rules? for|hypothetical|example of|how (?:do|does))\b/i.test(text)&&(/\b(?:start|begin|create|set up|run|play|request|want|have)\b[^.!?]{0,100}\b(?:encounter|combat|fight|ambush)\b/i.test(text)||/\b(?:fights?|are ambushed|is ambushed)\b/i.test(text)||/\bone[- ]on[- ]one\b/i.test(text))}
export function previousSetup(repo:SqliteCampaignRepository,campaignId:string,characterId:string){const row=repo.db.prepare("SELECT context_json FROM ai_requests WHERE campaign_id=? AND status='completed' AND kind='chat' AND json_extract(payload,'$.characterId')=? ORDER BY updated_at DESC,id DESC LIMIT 1").get(campaignId,characterId);return row?.context_json?JSON.parse(row.context_json as string).combatSetup as EncounterSetup|null: null}
export function parseEncounterSetup(text:string,s:Session,actorId:string,prior?:EncounterSetup|null):EncounterSetup|null{
 const fresh=encounterRequest(text);if(!fresh&&!prior)return null;
 // A persisted clarification is consumed only by a concise answer or another
 // encounter declaration; unrelated conversation does not start an encounter.
 if(!fresh&&text.length>250)return null;
 const names=namedParticipants(text,s.characters),all=/\b(?:entire party|whole party|all (?:the )?party|full party|everyone|all of us|all (?:[0-9]+|one|two|three|four|five|six)\b)\b/i.test(text);
 let participants=names.ids.length?names.ids:prior?.participants??[],known=names.ids.length>0&&!names.ambiguous||prior?.participantsKnown===true;
 if(all){
  const recent=s.messages.filter(m=>m.role==='gm'&&!m.quarterDayFormId).slice(-3).map(m=>m.text).join(' ');
  const presentText=recent.split(/[.!?]/).filter(line=>/\b(?:present:|are (?:present|here|together)|is here)\b/i.test(line)).join(' '),scene=namedParticipants(presentText,s.characters);
  const totalWords=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  const explicitlyAll=new RegExp('\\ball (?:'+s.characters.length+'|'+totalWords[s.characters.length]+')\\b|everyone in the (?:campaign |party )?roster','i').test(text);
  participants=names.ids.length?names.ids:explicitlyAll?s.characters.map(c=>c.id):scene.ids;
  participants=participants.filter(id=>{const c=s.characters.find(c=>c.id===id)!;return !new RegExp('\\b'+escape(c.name.split(/\s+/)[0])+'\\b[^.!?]{0,60}\\b(?:absent|stayed behind|remains at|is elsewhere|left the party)\\b','i').test(recent)});
  known=participants.length>0&&!scene.ambiguous;
 }else if(!participants.length&&/\b(?:I|me|my|one[- ]on[- ]one)\b/i.test(text)){participants=[actorId];known=true}
 if(names.ambiguous)known=false;
 const rangeMatch=text.match(/\b(?:at\s+)?(NEAR|SHORT|LONG)(?:\s+range)?\b/i)??text.match(/\b(arm(?:['’]s)?(?: length)?)(?:\s+range)?\b/i);
 const range=rangeMatch?(rangeMatch[1].toLowerCase().startsWith('arm')?'Arm':rangeMatch[1][0].toUpperCase()+rangeMatch[1].slice(1).toLowerCase()) as CombatRange:prior?.range??null;
 const counts:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6};let enemies=prior?.enemies??'';
 const matches=[...text.matchAll(/\b(a|an|one|two|three|four|five|six|[1-6])?\s*(bandits?|soldiers?|riders?|thieves|thief|gray bears?|minotaurs?|nightwargs?|drakewyrms?|wolves|wolf)\b/gi)];
 if(matches.length)enemies=matches.map(m=>{const name=/^(?:thieves|thief)$/i.test(m[2])?'Thief':/^wolves?$/i.test(m[2])?'Wolf':m[2].replace(/s$/i,'');return name+' x'+(counts[m[1]?.toLowerCase()]??Number(m[1]||1))}).join('; ');
 if(!fresh&&!names.ids.length&&!all&&!rangeMatch&&!matches.length)return null;
 return {participants,participantsKnown:known,enemies,range,declaration:fresh?text:prior?.declaration??text};
}
export function setupQuestion(d:EncounterSetup,s:Session){const missing:string[]=[];if(!d.participantsKnown)missing.push('which characters are taking part');if(!d.enemies)missing.push('which enemies are involved');if(!d.range)missing.push('the starting range (Arm, Near, Short, or Long)');return missing.length?'Before drawing initiative, tell me '+missing.join(' and ')+'.'+(d.participantsKnown?' Participants: '+d.participants.map(id=>s.characters.find(c=>c.id===id)?.name).join(', ')+'.':''):null}
