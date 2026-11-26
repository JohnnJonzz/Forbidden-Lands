import {injuryRecordSchema} from './injury-schema';
import {creatureSchema} from './creatures';
import {normalizeCharacterSheet} from './character-data';
import {z} from 'zod';
import {standardAttributeIds} from './rules/character-registry';
import {catalogWeapon,weaponPreset} from './equipment-catalog';
import {sheetFieldNames as fieldNames} from './sheet-fields';
type SheetField=typeof fieldNames[number];
import type {Character} from './types';
const text=z.string().max(20000);
const row=(keys:string[])=>z.object(Object.fromEntries(keys.map(key=>[key,text.optional()]))).strict();
const scalars=Object.fromEntries(fieldNames.map(key=>[key,key.startsWith('cond-')||key.endsWith('-worn')?z.boolean().optional():text.optional()])) as {[K in SheetField]:z.ZodOptional<z.ZodString|z.ZodBoolean>};
export const characterSheetSchema=z.object({...scalars,
 injuries:z.array(injuryRecordSchema).max(100).refine(rows=>new Set(rows.map(r=>r.id)).size===rows.length,'Injury identities must be unique').optional(),
 backstory:z.string().max(20000).optional(),
 'backstory-visibility':z.enum(['Owner and GM','Party Known']).optional(),
 creatures:z.array(creatureSchema).max(20).refine(c=>new Set(c.map(v=>v.id)).size===c.length,'Creature identities must be unique').optional(),
 talents:z.array(z.object({name:text.optional(),rank:text.optional(),desc:text.optional(),type:z.enum(['K','P','G']).optional()}).strict()).max(100).optional(),
 weapons:z.array(z.object({itemId:z.string().uuid().optional(),weight:z.enum(['Heavy','Normal','Light','Tiny']).optional(),name:text.optional(),bonus:text.optional(),gearBonus:text.optional(),current:text.optional(),repairLimit:text.optional(),destroyed:z.boolean().optional(),dmg:text.optional(),range:text.optional(),feat:text.optional(),skill:text.optional(),artifact:text.optional(),grip:text.optional(),cost:text.optional(),equipped:z.boolean().optional()}).strict().superRefine((w,ctx)=>{for(const key of ['current','gearBonus'] as const){const v=w[key];if(v!==undefined&&v!==''&&(!/^\d+$/.test(v)||Number(v)>12))ctx.addIssue({code:'custom',message:'Gear ratings must be integers from 0 to 12.',path:[key]});}if(w.current&&w.gearBonus&&(Number(w.current)>Number(w.gearBonus)||w.repairLimit!==undefined&&Number(w.current)>Number(w.repairLimit)))ctx.addIssue({code:'custom',message:'Current cannot exceed the original gear rating.',path:['current']});if(w.current!==undefined&&w.bonus&&(!/^-?\d+$/.test(w.bonus)||Math.abs(Number(w.bonus))>10))ctx.addIssue({code:'custom',message:'Additional Bonus must be an integer from -10 to 10.',path:['bonus']});})).max(100).optional(),
 gear:z.array(row(['item','weight','quantity','notes']).extend({itemId:z.string().uuid().optional()})).max(300).optional(),
 spells:z.array(z.object({mode:text.optional(),wp:text.optional(),name:text.optional(),talent:text.optional(),rank:text.optional(),type:text.optional(),range:text.optional(),duration:text.optional(),ingredients:text.optional(),description:text.optional(),ingredient:z.boolean().optional(),grimoire:z.boolean().optional()}).strict()).max(100).optional()
}).strict().superRefine((sheet,ctx)=>{const carrier=new Map<string,string>();for(const row of [...(sheet.gear??[]),...(sheet.weapons??[])])if(row.itemId)carrier.set(row.itemId,'rider');for(const creature of sheet.creatures??[])for(const item of creature.inventory){const old=carrier.get(item.itemId);if(old&&old!==creature.id)ctx.addIssue({code:'custom',message:'One physical item cannot be carried by both a character and a creature or by two creatures.',path:['creatures']});carrier.set(item.itemId,creature.id);}});
export type CharacterSheet=z.infer<typeof characterSheetSchema>;
export function sheetFor(character:Character):CharacterSheet {
 if(character.sheet)return normalizeCharacterSheet(character.sheet);
 const dagger=weaponPreset(catalogWeapon('Dagger')!);
 // The optimistic-save boundary compares nested values serialized by this
 // schema. Normalize new defaults too, including optional catalog fields.
 return normalizeCharacterSheet(characterSheetSchema.parse({name:character.name,kin:character.kin,profession:character.profession,talents:[{name:'Kin Talent',rank:'1',desc:''}],weapons:[{...dagger,bonus:String(dagger.bonus),dmg:String(dagger.dmg),artifact:'None'}],gear:[],spells:[],...Object.fromEntries(standardAttributeIds.flatMap(attribute=>[[`attr-${attribute}`,String(character[attribute])],[`attr-${attribute}-regular`,String(character[attribute])]]))}));
}
export function applySheet(character:Character,sheet:CharacterSheet):Character{
 const attr=(key:string,previous:number)=>Math.max(0,Math.min(20,Math.trunc(Number(sheet[('attr-'+key+'-regular') as SheetField]??sheet[('attr-'+key) as SheetField]??previous)||0)));
 return {...character,sheet,name:typeof sheet.name==='string'&&sheet.name.trim()?sheet.name.trim():character.name,kin:typeof sheet.kin==='string'?sheet.kin:character.kin,profession:typeof sheet.profession==='string'?sheet.profession:character.profession,strength:attr('strength',character.strength),agility:attr('agility',character.agility),wits:attr('wits',character.wits),empathy:attr('empathy',character.empathy)};
}
