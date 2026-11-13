import {catalogWeapon,equipmentCatalog} from '../../lib/equipment-catalog';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import {equipmentRows,equipmentText,type EquipmentCategory} from '../sourcebooks/equipment-rows';
import {AIError} from '../ai/config';
export function verifiedCatalogRow(pages:SourcePassage[],category:EquipmentCategory,name:string){
 const matches=pages.flatMap(page=>equipmentRows(page,category).filter(row=>row.name===name).map(row=>({page,row})));
 if(!matches.length)throw new AIError('combat_equipment_evidence','The indexed official Handbook table is unavailable or incomplete for '+name+'. Restore/reindex the original source; the catalog alone cannot authorize combat.',409);
 if(new Set(matches.map(m=>JSON.stringify(m.row))).size!==1)throw new AIError('combat_equipment_evidence','Conflicting official table rows for '+name+' require adjudication.',409);
 return matches[0];
}
export function verifiedCatalogWeapon(pages:SourcePassage[],name:string){
 const entry=catalogWeapon(name);if(!entry){const ambiguous=/^(?:sword|axe|spear|bow|crossbow|club|hammer|shield)$/i.test(name.trim());throw new AIError('combat_equipment',ambiguous?'The equipment name '+name+' is ambiguous. Choose an exact official weapon.':'Unknown weapon '+name+'. Choose an official weapon or request adjudication.',409)}
 const {row,page}=verifiedCatalogRow(pages,entry.category,entry.name),expected={name:entry.name,grip:entry.grip,bonus:entry.bonus,damage:entry.damage,range:entry.range,costSilver:entry.costSilver,features:equipmentText(entry.features)};
 if(Object.entries(expected).some(([key,value])=>(key==='features'?equipmentText(row.features):(row as unknown as Record<string,unknown>)[key])!==value))throw new AIError('combat_equipment_evidence','Official equipment fields conflict with the audited catalog for '+entry.name+'. Adjudication is required.',409);
 return {entry,page,row};
}
export function verifyEquipmentCatalog(pages:SourcePassage[]){
 return (['melee','ranged','shield','armor'] as const).flatMap(category=>{
  const entries=category==='armor'?equipmentCatalog.armor:category==='shield'?equipmentCatalog.shields:equipmentCatalog.weapons.filter(w=>w.category===category);
  return entries.map(entry=>{const result=verifiedCatalogRow(pages,category,entry.name),expected=entry as unknown as Record<string,unknown>;for(const key of category==='armor'?['rating','costSilver','bodyPart','features']:category==='shield'?['bonus','costSilver','features']:['grip','bonus','damage','range','costSilver','features'])if(equipmentText(String((result.row as unknown as Record<string,unknown>)[key]))!==equipmentText(String(expected[key])))throw new AIError('combat_equipment_evidence','Catalog audit mismatch: '+entry.name+' '+key,409);return {id:entry.id,name:entry.name,category,page:result.page.startPage}});
 });
}
