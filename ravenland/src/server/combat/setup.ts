import type {Session} from '../../lib/types';
import type {CombatRange} from '../../lib/combat/types';
import type {SqliteCampaignRepository} from '../sqlite';
import {encounterEnemies} from './setup-enemies';
import {encounterParticipants} from './setup-participants';
import {encounterScene,sceneQuestion,type EncounterScene} from './setup-scene';
export {namedParticipants} from './setup-participants';
export interface EncounterSetup {participants:string[];participantsKnown:boolean;enemies:string;range:CombatRange|null;declaration:string;enemyQuestion?:string;sceneQuestion?:string;scene?:EncounterScene;excludedParticipants?:string[];absentCharacters?:string[]}
export function encounterRequest(text:string){return !/^\/combat\b/i.test(text)&&!/\b(?:explain|according to|rules? for|hypothetical|example of|how (?:do|does))\b/i.test(text)&&(/\b(?:start|begin|create|set up|run|play|request|want|have)\b[^.!?]{0,100}\b(?:encounter|combat|fight|ambush)\b/i.test(text)||/\b(?:fights?|are ambushed|is ambushed)\b/i.test(text)||/\bone[- ]on[- ]one\b/i.test(text))}
export function previousSetup(repo:SqliteCampaignRepository,campaignId:string,characterId:string){const row=repo.db.prepare("SELECT context_json FROM ai_requests WHERE campaign_id=? AND status='completed' AND kind='chat' AND json_extract(payload,'$.characterId')=? ORDER BY updated_at DESC,id DESC LIMIT 1").get(campaignId,characterId);return row?.context_json?JSON.parse(row.context_json as string).combatSetup as EncounterSetup|null: null}
export function parseEncounterSetup(text:string,s:Session,actorId:string,prior?:EncounterSetup|null):EncounterSetup|null{
 const fresh=encounterRequest(text);if(!fresh&&!prior)return null;if(!fresh&&text.length>250)return null;
 // Only actual clarification answers inherit fields. A new declaration starts
 // from its own facts, never an earlier/ended encounter's defaults.
 const base=fresh?undefined:prior??undefined,party=encounterParticipants(text,s,actorId,base),enemies=encounterEnemies(text),scene=encounterScene(text,s,fresh,base?.scene);
 const rangeText=text.match(/\b(?:start|begin|create|set up)\b[^.!?\n]{0,100}\b(?:combat|encounter|fight|ambush)\b[^.!?\n]*/i)?.[0]??text;
 const findRange=(value:string)=>value.match(/\b(NEAR|SHORT|LONG|arm(?:['’]s)?(?: length)?)\s+range\b/i)??value.match(/\bat\s+(NEAR|SHORT|LONG|arm(?:['’]s)?(?: length)?)\b/i)??value.trim().match(/^(NEAR|SHORT|LONG|arm(?:['’]s)?(?: length)?)[.!]?$/i);
 const match=findRange(rangeText)??findRange(text);
 const range=match?(match[1].toLowerCase().startsWith('arm')?'Arm':match[1][0].toUpperCase()+match[1].slice(1).toLowerCase()) as CombatRange:base?.range??null;
 if(!fresh&&!party.recognized&&!enemies.mentioned&&!match&&!scene.recognized)return null;
 const {recognized:_,...participants}=party;
 return {...participants,enemies:enemies.mentioned?enemies.enemies:base?.enemies??'',enemyQuestion:enemies.mentioned?enemies.question:base?.enemyQuestion,range,declaration:fresh?text:base?.declaration??text,scene:scene.scene,sceneQuestion:scene.question??(!fresh&&!scene.recognized?base?.sceneQuestion:undefined)};
}
export function setupQuestion(d:EncounterSetup,s:Session){
 if(d.enemyQuestion)return d.participantsKnown?d.enemyQuestion:'Before drawing initiative, tell me which characters are taking part and the exact enemy counts.';if(d.sceneQuestion)return d.sceneQuestion;
 const missing:string[]=[];if(!d.participantsKnown)missing.push('which characters are taking part');if(!d.enemies)missing.push('which enemies are involved');if(!d.range)missing.push('the starting range (Arm, Near, Short, or Long)');
 if(missing.length)return 'Before drawing initiative, tell me '+missing.join(' and ')+'.'+(d.participantsKnown?' Participants: '+d.participants.map(id=>s.characters.find(c=>c.id===id)?.name).join(', ')+'.':'');
 const total=[...d.enemies.matchAll(/\bx([0-9]+)\b/g)].reduce((n,m)=>n+Number(m[1]),0);if(total+d.participants.length>10)return 'Choose at most ten total combatants for numbered-card initiative. Larger groups require adjudication; none have been substituted.';
 return sceneQuestion(d.scene,s);
}
