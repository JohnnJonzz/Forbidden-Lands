import type {Character} from '../lib/types';
import {characterBackground} from './character-background';
import {characterResources} from './resource-awareness';
import {mechanicalCharacter,exactInteger} from './mechanical-character';

const text=(value:unknown,limit=1200)=>typeof value==='string'&&value.trim()?value.slice(0,limit):null;
export function characterAwareness(character:Character,action:string,localNarrative=false,scene=''){
 const base=mechanicalCharacter(character),s=character.sheet;
 const attributes=Object.fromEntries(Object.entries(base.attributes).map(([id,a])=>[id,{...a,maximum:a.regular}]));
 const brokenAttributes=Object.entries(base.attributes).filter(([,a])=>a.current===0).map(([id])=>id);
 const background=characterBackground(character),story={pride:background.fields.pride.value,darkSecret:background.fields.darkSecret.value,relationships:background.fields.relationships.value},consumables=characterResources(character);
 const item=(prefix:'armor'|'helmet'|'shield')=>({name:text(s?.[`${prefix}-name`]),rating:text(s?.[(prefix==='shield'?'shield-bonus':`${prefix}-rating`) as keyof typeof s],40),maximum:text(s?.[`${prefix}-max`],40),worn:s?.[`${prefix}-worn`]??null,carried:text(s?.[`${prefix}-carried`],40),notes:text(s?.[`${prefix}-notes`],600)});
 return {...base,attributes,broken:{status:brokenAttributes.length>0?true:Object.values(base.attributes).every(a=>a.current!==null)?false:null,attributes:brokenAttributes},
  talents:(s?.talents??[]).slice(0,30).filter(t=>t.name?.trim()).map(t=>({name:text(t.name,100),rank:exactInteger(t.rank,1,3),recordedDescription:text(t.desc,500)})),
  criticalInjuries:{recordedText:text(s?.['critical-injuries']),effects:'Recorded text only; no unverified numeric modifier or automatic condition is inferred.'},
  equipment:{armor:item('armor'),helmet:item('helmet'),shield:item('shield'),gear:(s?.gear??[]).slice(0,20).map(g=>({item:text(g.item,100),quantity:exactInteger(g.quantity,0,9999),weight:text(g.weight,40),notes:text(g.notes,400)}))},
  consumables,background,willpower:exactInteger(s?.willpower,0,999),story,
  awarenessPolicy:'Read-only recorded facts. Missing values are unknown. Resource dice are not item counts. Equipment readiness is advisory. Pride, Dark Secret and Relationships are party-known background; empty/unrecorded fields are not concealed. Player knowledge is not automatically NPC knowledge. No GM-only memories or sourcebooks are included.'};
}
