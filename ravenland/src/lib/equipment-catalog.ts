import {equipmentCatalog} from './equipment-catalog-data';
export {equipmentCatalog};
export type CatalogWeapon=typeof equipmentCatalog.weapons[number];
export type CatalogArmor=typeof equipmentCatalog.armor[number];
export type CatalogShield=typeof equipmentCatalog.shields[number];
// Typography normalization only. Distinct weapons never share a fuzzy key.
export const equipmentNameKey=(name:string)=>name.normalize('NFKC').replace(/\u00ad/g,'').trim().toLowerCase().replace(/[‐‑–]/g,'-').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ');
export function catalogEntry<T extends {id:string;name:string;aliases:readonly string[]}>(rows:readonly T[],name:string):T|null {
 const key=equipmentNameKey(name);return rows.find(w=>[w.id,w.name,...w.aliases].some(n=>equipmentNameKey(n)===key))??null;
}
export const catalogWeapon=(name:string)=>catalogEntry(equipmentCatalog.weapons,name);
export const catalogArmor=(name:string)=>catalogEntry(equipmentCatalog.armor,name);
export const catalogShield=(name:string)=>catalogEntry(equipmentCatalog.shields,name);
export function weaponPreset(w:CatalogWeapon){return {name:w.name,bonus:w.bonus??0,dmg:w.damage,range:w.range,feat:w.features,skill:w.category==='melee'?'melee':'marksmanship',grip:w.grip??'—',cost:w.costSilver===null?'—':String(w.costSilver)}}
export const equipmentWeight=(features:string)=>/\bHeavy\b/.test(features)?'Heavy':/\bLight\b/.test(features)?'Light':'Normal';
