import {equipmentCatalog} from '../../lib/equipment-catalog';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
export type EquipmentCategory='melee'|'ranged'|'shield'|'armor';
export interface EquipmentRow {name:string;grip?:string|null;bonus?:number|null;damage?:number;range?:string;costSilver:number|null;features:string;rating?:number;bodyPart?:string}
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const equipmentText=(text:string)=>text.normalize('NFKC').replace(/\u00ad/g,'').replace(/[‐‑–−]/g,'-').replace(/\s*-\s*(?=[A-Za-z])/g,'-').replace(/\s+/g,' ').trim();
// Names locate rows; every field comes from the original table, never from the
// catalog's expected statistics. This handles wrapped names/features and —.
export function equipmentRows(page:SourcePassage,category:EquipmentCategory):EquipmentRow[]{
 const full=equipmentText(page.text),heading=equipmentCatalog.sources[category].table;
 const header=category==='armor'?/GEAR ARMOR RATING COST BODY PART FEATURES/:category==='shield'?/WEAPON BONUS DAMAGE RANGE COST FEATURES/:/WEAPON GRIP BONUS DAMAGE RANGE COST FEATURES/;
 const start=full.indexOf(heading);if(start<0)return [];let text=full.slice(start+heading.length);const columns=header.exec(text);if(!columns)return [];text=text.slice(columns.index+columns[0].length).split(/John Hadley|ARMOR & HELMETS/)[0].trim();
 const entries=category==='armor'?equipmentCatalog.armor:category==='shield'?equipmentCatalog.shields:equipmentCatalog.weapons.filter(w=>w.category===category);
 const foundRows=entries.flatMap(entry=>{const name=escape(equipmentText(entry.name)),pattern=category==='armor'?'(\\d+) (\\d+) (Body|Head)':category==='shield'?'([+]?\\d+) — — (\\d+)':'(1H|2H|—) ([+]?\\d+|—) (\\d+) (Arm|Near|Short|Long) (\\d+|—)';
  const found=[...text.matchAll(new RegExp('(?:^| )('+name+') '+pattern+'(?= |$)','g'))];return found.map(m=>({m,start:m.index!,end:m.index!+m[0].length,name:entry.name}));
 }).sort((a,b)=>a.start-b.start);
 // A Heavy Warhammer row must not also become a Warhammer row.
 const matches=foundRows.filter(row=>!foundRows.some(other=>other.start<row.start&&other.end>=row.end));
 return matches.map(({m,end,name},i)=>{const features=text.slice(end,matches[i+1]?.start??text.length).trim(),num=(s:string)=>s==='—'?null:Number(s);if(category==='armor')return {name,rating:Number(m[2]),costSilver:Number(m[3]),bodyPart:m[4],features};if(category==='shield')return {name,bonus:Number(m[2]),costSilver:Number(m[3]),features};return {name,grip:m[2]==='—'?null:m[2],bonus:num(m[3]),damage:Number(m[4]),range:m[5],costSilver:num(m[6]),features}});
}
