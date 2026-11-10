import type {CharacterSheet} from '../lib/character-sheet';
import type {Character} from '../lib/types';
import {standardAttributes,standardSkills} from '../lib/rules/character-registry';
import type {MechanicalCharacter} from '../lib/rules/action-preparation';
export function exactInteger(value:unknown,min:number,max:number){if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null}
const short=(value:unknown,n=100)=>typeof value==='string'?value.slice(0,n):'';
export function mechanicalWeapon(w:NonNullable<CharacterSheet['weapons']>[number],index:number):MechanicalCharacter['weapons'][number]{return {index,name:short(w.name),bonus:exactInteger(w.bonus,0,12),damage:exactInteger(w.dmg,0,100),range:short(w.range),skill:short(w.skill),artifact:short(w.artifact,20),equipped:typeof w.equipped==='boolean'?w.equipped:null}}
export function mechanicalCharacter(character:Character):MechanicalCharacter {
 const s=character.sheet;
 return {id:character.id,name:character.name,
  attributes:Object.fromEntries(standardAttributes.map(a=>[a.id,{regular:exactInteger(s?.[('attr-'+a.id+'-regular') as keyof typeof s]??character[a.id],1,a.maximum),current:exactInteger(s?.[('attr-'+a.id) as keyof typeof s],0,a.maximum)}])) as MechanicalCharacter['attributes'],
  skills:Object.fromEntries(standardSkills.map(skill=>['skill-'+skill.id,exactInteger(s?.[('skill-'+skill.id) as keyof typeof s],0,5)])),
  conditions:Object.fromEntries(['hungry','thirsty','sleepy','cold'].map(c=>[c,typeof s?.[('cond-'+c) as keyof typeof s]==='boolean'?s[('cond-'+c) as keyof typeof s] as boolean:null])),
  talents:(s?.talents??[]).filter(t=>t.name?.trim()).slice(0,100).map(t=>({name:short(t.name),rank:exactInteger(t.rank,1,3)})),
  weapons:(s?.weapons??[]).slice(0,100).map(mechanicalWeapon)};
}
