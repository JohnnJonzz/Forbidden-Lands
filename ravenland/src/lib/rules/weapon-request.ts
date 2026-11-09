export type WeaponField='gearBonus'|'damage'|'range';
export interface WeaponFactRequest {weapons:string[];fields:WeaponField[];calculate:boolean;successes:number|null;extraSuccessRule:boolean;modifiersRequested:boolean}
// Names and request vocabulary only. No weapon ratings or rule constants live here.
export function weaponRequest(action:string):WeaponFactRequest|null {
 const weapons=[...new Set((action.match(/\b(?:(?:heavy|light)\s+crossbow|crossbow|longbow|shortbow|(?:long|short)\s+bow)\b/gi)??[]).map(n=>n.toLowerCase().replace(/long bow/,'longbow').replace(/short bow/,'shortbow')).map(n=>n.replace(/\b\w/g,c=>c.toUpperCase())))];
 const fields:WeaponField[]=[];if(/\b(?:gear\s+)?bonus\b/i.test(action))fields.push('gearBonus');if(/\bdamage\b/i.test(action))fields.push('damage');if(/\brange\b/i.test(action))fields.push('range');
 const success=action.match(/\b(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:attack\s+)?success(?:es)?\b/i),numbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'],successes=success?(/^\d+$/.test(success[1])?Number(success[1]):numbers.indexOf(success[1].toLowerCase())):null;
 const calculate=weapons.length>0&&/\bdamage\b/i.test(action)&&(success!==null||/\b(?:calculate|inflict|how much)\b/i.test(action)),extraSuccessRule=/\b(?:extra|additional)\s+success(?:es)?\b/i.test(action)&&/\b(?:damage|ranged|attack)\b/i.test(action);
 if(!weapons.length&&!extraSuccessRule)return null;if(weapons.length&&!fields.length&&!calculate&&!extraSuccessRule&&!/\b(?:statistics|stats|ratings?|properties)\b/i.test(action))return null;if(!fields.length&&weapons.length)fields.push('gearBonus','damage','range');if(calculate&&!fields.includes('damage'))fields.push('damage');
 return {weapons,fields,calculate,successes,extraSuccessRule:calculate||extraSuccessRule,modifiersRequested:/\b(?:talents?|artifacts?|modifiers?|bonus damage|stunts?|disarm|knock)\b|[+-]\d+\s+damage/i.test(action)};
}
