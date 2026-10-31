import {z} from 'zod';
import {sheetFieldNames as fieldNames} from './sheet-fields';
type SheetField=typeof fieldNames[number];
import type {Character} from './types';
const text=z.string().max(20000);
const row=(keys:string[])=>z.object(Object.fromEntries(keys.map(key=>[key,text.optional()]))).strict();
const scalars=Object.fromEntries(fieldNames.map(key=>[key,key.startsWith('cond-')||key.endsWith('-worn')?z.boolean().optional():text.optional()])) as {[K in SheetField]:z.ZodOptional<z.ZodString|z.ZodBoolean>};
export const characterSheetSchema=z.object({...scalars,
 talents:z.array(row(['name','rank','desc'])).max(100).optional(),
 weapons:z.array(row(['name','bonus','dmg','range','feat','skill','artifact'])).max(100).optional(),
 gear:z.array(row(['item','weight','quantity','notes'])).max(300).optional(),
 spells:z.array(z.object({mode:text.optional(),wp:text.optional(),name:text.optional(),talent:text.optional(),rank:text.optional(),type:text.optional(),range:text.optional(),duration:text.optional(),ingredients:text.optional(),description:text.optional(),ingredient:z.boolean().optional(),grimoire:z.boolean().optional()}).strict()).max(100).optional()
}).strict();
export type CharacterSheet=z.infer<typeof characterSheetSchema>;
export function sheetFor(character:Character):CharacterSheet {
 if(character.sheet)return character.sheet;
 return {name:character.name,kin:character.kin,profession:character.profession,talents:[{name:'Kin Talent',rank:'1',desc:''}],weapons:[{name:'Dagger',bonus:'1',dmg:'1',range:'Arm',feat:'Light, Pointed',skill:'melee',artifact:'None'}],gear:[],spells:[],...Object.fromEntries(['strength','agility','wits','empathy'].flatMap(attribute=>[[`attr-${attribute}`,String(character[attribute as 'strength'])],[`attr-${attribute}-regular`,String(character[attribute as 'strength'])]]))};
}
export function applySheet(character:Character,sheet:CharacterSheet):Character{
 const attr=(key:string,previous:number)=>Math.max(0,Math.min(20,Math.trunc(Number(sheet[('attr-'+key+'-regular') as SheetField]??sheet[('attr-'+key) as SheetField]??previous)||0)));
 return {...character,sheet,name:typeof sheet.name==='string'&&sheet.name.trim()?sheet.name.trim():character.name,kin:typeof sheet.kin==='string'?sheet.kin:character.kin,profession:typeof sheet.profession==='string'?sheet.profession:character.profession,strength:attr('strength',character.strength),agility:attr('agility',character.agility),wits:attr('wits',character.wits),empathy:attr('empathy',character.empathy)};
}
