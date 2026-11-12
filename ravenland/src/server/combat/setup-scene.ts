import type {Session} from '../../lib/types';
export interface EncounterScene {description:string;location:string;hex:string;confirmed:boolean}
const normalize=(s:string)=>s.toLowerCase().replace(/^(?:a|an|the)\s+/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function sceneMatches(description:string,location:string){const a=normalize(description),b=normalize(location);return !!a&&!!b&&a===b}
export function encounterScene(text:string,s:Session,fresh:boolean,prior?:EncounterScene):{scene?:EncounterScene;recognized:boolean;question?:string}{
 const candidates=[...text.matchAll(/\b(?:along|inside|within|through|beside|in|on|at)\s+([^.!?\n]{1,160}?)(?=\s+(?:when|where|while|with|and)\b|[.!?\n]|$)/gi)].map(m=>m[1].replace(/\s+at\s+(?:Arm|Near|Short|Long)\b.*$/i,'').trim()).filter(v=>!(/^(?:Arm(?:['’]s)?(?: length)?|Near|Short|Long)(?:\s+range)?\b|^(?:combat|battle|initiative|a fight|an encounter|my turn|his|her|their)\b/i.test(v))).filter(v=>/\b(?:road|forest|woods|stairwell|stairs|clearing|camp|river|bridge|village|castle|ruins|dungeon|tower|chamber|room|cave|hall|watch|tavern|inn|marsh|swamp|mountain|valley|beach|shrine|temple|trail|path|meadow)\b/i.test(v)||sceneMatches(v,s.campaign.location));
 const distinct=[...new Set(candidates)],different=distinct.filter(v=>!sceneMatches(v,s.campaign.location));
 if(fresh&&different.length>1)return {recognized:true,question:'Which of the described locations is the encounter scene? No location or time has changed.'};
 const useCurrent=!fresh&&/^(?:use|keep) (?:the )?(?:current|existing|saved) (?:campaign )?location[.!]?$/i.test(text.trim());
 const description=(fresh?(different[0]??distinct[0]):prior?.description)??(useCurrent?s.campaign.location:undefined);
 if(!description)return {recognized:false};
 const sameSnapshot=prior?.location===s.campaign.location&&prior?.hex===s.campaign.hex;
 const yes=!fresh&&/^(?:yes(?:,?\s+(?:same (?:scene|location)|(?:it|the road|that road) is (?:here|part of (?:the )?current location)))?|same (?:scene|location))[.!]?$/i.test(text.trim());
 const scene:EncounterScene={description:useCurrent?s.campaign.location:description,location:s.campaign.location,hex:s.campaign.hex,confirmed:useCurrent||sceneMatches(description,s.campaign.location)||!fresh&&sameSnapshot&&(!!prior?.confirmed||yes)};
 return {scene,recognized:fresh||yes||useCurrent||!sameSnapshot};
}
export function sceneQuestion(scene:EncounterScene|undefined,s:Session){
 if(!scene||sceneMatches(scene.description,s.campaign.location)||scene.confirmed&&scene.location===s.campaign.location&&scene.hex===s.campaign.hex)return null;
 return `The saved campaign location is ${s.campaign.location}. Is “${scene.description}” a scene within this location? Otherwise update the campaign location before starting. No travel or time has been applied.`;
}
