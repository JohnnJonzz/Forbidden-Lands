import {attackInputs,type AttackInputs} from './attack-inputs';
export type WeaponField='gearBonus'|'damage'|'range';
export interface WeaponFactRequest extends AttackInputs {weapons:string[];fields:WeaponField[];calculate:boolean;extraSuccessRule:boolean;modifiersRequested:boolean}
// Names and request vocabulary only. No weapon ratings or rule constants live here.
export function weaponRequest(action:string):WeaponFactRequest|null {
 const weapons=[...new Set((action.match(/\b(?:(?:heavy|light)\s+crossbow|crossbow|longbow|shortbow|(?:long|short)\s+bow)\b/gi)??[]).map(n=>n.toLowerCase().replace(/long bow/,'longbow').replace(/short bow/,'shortbow')).map(n=>n.replace(/\b\w/g,c=>c.toUpperCase())))];
 const fields:WeaponField[]=[];if(/\b(?:gear\s+)?bonus\b/i.test(action))fields.push('gearBonus');if(/\bdamage\b/i.test(action))fields.push('damage');if(/\brange\b/i.test(action))fields.push('range');
 const inputs=attackInputs(action),calculate=weapons.length>0&&/\bdamage\b/i.test(action)&&(inputs.attackSuccesses!==null||/\b(?:calculate|inflict|how much)\b/i.test(action)),extraSuccessRule=/\b(?:extra|additional)\s+success(?:es)?\b/i.test(action)&&/\b(?:damage|ranged|attack)\b/i.test(action);
 if(!weapons.length&&!extraSuccessRule&&inputs.attackSuccesses===null&&!inputs.inputIssues.length)return null;if(weapons.length&&!fields.length&&!calculate&&!extraSuccessRule&&inputs.attackSuccesses===null&&!/\b(?:statistics|stats|ratings?|properties)\b/i.test(action))return null;if(!fields.length&&weapons.length)fields.push('gearBonus','damage','range');if(calculate&&!fields.includes('damage'))fields.push('damage');
 const modifierText=action.replace(/\b(?:no|without)\s+(?:(?:other|any)\s+)?(?:modifiers?|talents?|artifacts?)\b/gi,'');
 return {weapons,fields,calculate,...inputs,extraSuccessRule:calculate||extraSuccessRule,modifiersRequested:/\b(?:talents?|artifacts?|modifiers?|bonus damage|stunts?|disarm|knock)\b|[+-]\d+\s+damage/i.test(modifierText)};
}
