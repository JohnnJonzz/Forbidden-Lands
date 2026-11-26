import {catalogWeapon} from './equipment-catalog';
// Legacy bonus meant current Gear Dice. Never replace a damaged rating with a preset.
export function normalizeCharacterSheet<T extends {weapons?:{name?:string;bonus?:string;gearBonus?:string;current?:string}[];talents?:{name?:string;type?:'K'|'P'|'G'}[]}>(sheet:T):T {
 return {...sheet,...(sheet.weapons?{weapons:sheet.weapons.map(w=>w.current!==undefined?w:{...w,current:w.bonus??'',gearBonus:w.gearBonus??((catalogWeapon(w.name??'')?.bonus??-1)>=Number(w.bonus)&&w.bonus!==''?catalogWeapon(w.name??'')!.bonus!.toString():''),bonus:'0'})}:{}),...(sheet.talents?{talents:sheet.talents.map(t=>({...t}))}:{})};
}
export function currentWeaponGear(w:{current?:string;bonus?:string}){return w.current??w.bonus;}
