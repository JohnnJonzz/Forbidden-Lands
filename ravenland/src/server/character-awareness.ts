import type {Character} from '../lib/types';
import {mechanicalCharacter,exactInteger} from './mechanical-character';

const text=(value:unknown,limit=1200)=>typeof value==='string'&&value.trim()?value.slice(0,limit):null;
const words=(value:string)=>new Set(value.toLowerCase().match(/[a-z]{5,}/g)?.filter(w=>!['their','there','about','would','could','should','never','always','other','these','those','which','where','character','myself'].includes(w))??[]);
// Private fields are selected for a particular authorized narrative, not indexed
// or attached to every request. Hosted requests require an explicit field cue.
function relevant(value:string|null,action:string,cue:RegExp,thematic:boolean,scene:string){if(!value)return false;if(cue.test(action))return true;if(!thematic)return false;const terms=words(action+' '+scene);return [...words(value)].filter(w=>terms.has(w)).length>=2}
export function characterAwareness(character:Character,action:string,localNarrative=false,scene=''){
 const base=mechanicalCharacter(character),s=character.sheet;
 const attributes=Object.fromEntries(Object.entries(base.attributes).map(([id,a])=>[id,{...a,maximum:a.regular}]));
 const brokenAttributes=Object.entries(base.attributes).filter(([,a])=>a.current===0).map(([id])=>id);
 const story:Partial<Record<'pride'|'darkSecret'|'relationships',string>>={};
 const keepPrivate=/(?:do not|don't|never)\s+(?:mention|reveal|share|use|include|disclose)|\bkeep\b.{0,30}\bprivate\b|\bwithout\s+(?:revealing|mentioning|sharing|using)/i.test(action);
 for(const [key,value,cue] of [['pride',text(s?.pride),/\bpride\b/i],['darkSecret',text(s?.['dark-secret']),/\bdark secret\b|\bmy secret\b/i],['relationships',text(s?.relationships),/\brelationships?\b|\bmy bonds?\b/i]] as const)if(!keepPrivate&&relevant(value,action,cue,localNarrative,scene))story[key]=value!;
 const consumables=Object.fromEntries(['food','water','arrows','torches'].map(id=>{const recorded=text(s?.[('res-'+id) as keyof typeof s],40),resourceDie=/^D(?:6|8|10|12)$/.test(recorded??'')?recorded:null,quantity=recorded==='0'?0:null;return [id,{recorded,resourceDie,quantity,state:recorded==='None'||quantity===0?'empty':resourceDie==='D6'?'low_resource_die':resourceDie?'available':'unknown'}]}));
 const item=(prefix:'armor'|'helmet'|'shield')=>({name:text(s?.[`${prefix}-name`]),rating:text(s?.[(prefix==='shield'?'shield-bonus':`${prefix}-rating`) as keyof typeof s],40),maximum:text(s?.[`${prefix}-max`],40),worn:s?.[`${prefix}-worn`]??null,carried:text(s?.[`${prefix}-carried`],40),notes:text(s?.[`${prefix}-notes`],600)});
 return {...base,attributes,broken:{status:brokenAttributes.length>0?true:Object.values(base.attributes).every(a=>a.current!==null)?false:null,attributes:brokenAttributes},
  talents:(s?.talents??[]).slice(0,30).filter(t=>t.name?.trim()).map(t=>({name:text(t.name,100),rank:exactInteger(t.rank,1,3),recordedDescription:text(t.desc,500)})),
  criticalInjuries:{recordedText:text(s?.['critical-injuries']),effects:'Recorded text only; no unverified numeric modifier or automatic condition is inferred.'},
  equipment:{armor:item('armor'),helmet:item('helmet'),shield:item('shield'),gear:(s?.gear??[]).slice(0,20).map(g=>({item:text(g.item,100),quantity:exactInteger(g.quantity,0,9999),weight:text(g.weight,40),notes:text(g.notes,400)}))},
  consumables,willpower:exactInteger(s?.willpower,0,999),story,
  awarenessPolicy:'Read-only recorded facts. Missing values are unknown. Resource dice are not item counts. Equipment readiness is advisory. Story fields are relevant acting-character context for this turn; do not dump private fields. No GM-only memories or sourcebooks are included.'};
}
