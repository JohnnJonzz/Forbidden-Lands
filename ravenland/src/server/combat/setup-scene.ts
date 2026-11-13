import type {Session} from '../../lib/types';
import {setupAffirmed,setupContinue,setupNegative,setupTravel,setupUseCurrent} from './setup-intent';
export interface EncounterScene {description:string;location:string;hex:string;confirmed:boolean}
const normalize=(s:string)=>s.toLowerCase().replace(/^(?:a|an|the)\s+/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function sceneMatches(description:string,location:string){const a=normalize(description),b=normalize(location);return !!a&&!!b&&a===b}
export function clearlyLocalScene(text:string,location:string){
 if(setupTravel(text)||/\b(?:miles away|another (?:hex|region)|journey|march to)\b/i.test(text))return false;
 const place='(?:the\\s+)?'+escape(location.replace(/^the\s+/i,''));
 return new RegExp('\\b(?:inside|within|in|at|just outside)\\s+'+place+'\\b','i').test(text)||new RegExp('\\blocal (?:scene|road|clearing|area|place)\\b[^.!?\\n]{0,80}\\b(?:near|by|at|outside)\\s+'+place+'\\b','i').test(text)||/\b(?:within|part of) (?:the )?(?:current|saved) (?:campaign )?location\b/i.test(text);
}
export function encounterScene(text:string,s:Session,fresh:boolean,prior?:EncounterScene):{scene?:EncounterScene;recognized:boolean;question?:string}{
 const candidates=[...text.matchAll(/\b(?:along|inside|within|through|beside|in|on|at)\s+([^.!?\n]{1,160}?)(?=\s+(?:when|where|while|with|and)\b|[.!?\n]|$)/gi)].map(m=>m[1].replace(/\s+at\s+(?:Arm|Near|Short|Long)\b.*$/i,'').trim()).filter(v=>!(/^(?:Arm(?:['’]s)?(?: length)?|Near|Short|Long)(?:\s+range)?\b|^(?:combat|battle|initiative|a fight|an encounter|my turn|his|her|their)\b/i.test(v))).filter(v=>/\b(?:road|forest|woods|stairwell|stairs|clearing|camp|river|bridge|village|castle|ruins|dungeon|tower|chamber|room|cave|hall|watch|tavern|inn|marsh|swamp|mountain|valley|beach|shrine|temple|trail|path|meadow|courtyard)\b/i.test(v)||sceneMatches(v,s.campaign.location));
 const distinct=[...new Set(candidates)],different=distinct.filter(v=>!sceneMatches(v,s.campaign.location));
 if(fresh&&different.length>1)return {recognized:true,question:'Where shall we set this encounter? You described more than one place.'};
 const useCurrent=!fresh&&setupUseCurrent(text),affirmative=!fresh&&(setupAffirmed(text)||setupContinue(text));
 const revision=!fresh&&!affirmative&&!useCurrent?text.match(/^(?:(?:no|actually|instead|rather)[,.]?\s*)?(?:use|set(?: the scene)?(?: to)?|make(?: it| the scene)?|the scene is|it is)\s+([^.!?\n]{1,160})/i)?.[1]:undefined;
 const revisedDescription=revision?.trim()??(!fresh&&!affirmative&&!useCurrent&&/^(?:(?:no|actually|instead)[,.]?\s*)?(?:on|in|at|along|inside|within|beside)\b/i.test(text.trim())?(different[0]??distinct[0]):undefined);
 const description=useCurrent?s.campaign.location:revisedDescription??(fresh?(different[0]??distinct[0]):prior?.description);
 if(!description)return {recognized:false};
 const sameSnapshot=prior?.location===s.campaign.location&&prior?.hex===s.campaign.hex,negative=!fresh&&setupNegative(text);
 const local=clearlyLocalScene(description,s.campaign.location)||fresh&&clearlyLocalScene(text,s.campaign.location);
 const scene:EncounterScene={description,location:s.campaign.location,hex:s.campaign.hex,confirmed:!negative&&(useCurrent||sceneMatches(description,s.campaign.location)||local||!fresh&&sameSnapshot&&!revisedDescription&&(!!prior?.confirmed||affirmative))};
 return {scene,recognized:fresh||affirmative||negative||useCurrent||!!revisedDescription||!sameSnapshot};
}
export function sceneQuestion(scene:EncounterScene|undefined,s:Session){
 if(!scene||scene.confirmed&&scene.location===s.campaign.location&&scene.hex===s.campaign.hex)return null;
 return `We're at ${s.campaign.location}. Is “${scene.description}” a local scene here? If so, we'll begin there.`;
}
