import type {CombatSource,CombatWeapon} from './types';
export type WeaponAttackType='slash'|'stab'|'shoot';
export interface AttackRulesSummary {
 version:1;skill:'melee';actionCost:'slow';requiredSuccesses:1;extraSuccessDamage:1;
 slashFeatures:('Edged'|'Blunt')[];stabFeature:'Pointed';bluntIsFeature:true;
 modifiers:{slashDodge:number;stabWeaponParry:number;stabShieldParry:number;nonParryingWeapon:number;proneTarget:number};
 rangedModifiers:{Arm:number;Near:number;Short:number;Long:number};defenseBeforeRoll:true;armor:{perSuccess:1;pushable:false};sources:CombatSource[];
}
export function weaponAttackOptions(w:CombatWeapon){return w.skill==='marksmanship'?[{type:'shoot' as const,label:'SHOOT'}]:[
 ...(/Edged|Blunt/.test(w.features)?[{type:'slash' as const,label:/Blunt/.test(w.features)&&!/Edged/.test(w.features)?'SLASH (Blunt weapon)':'SLASH'}]:[]),
 ...(/Pointed/.test(w.features)?[{type:'stab' as const,label:'STAB'}]:[])
];}
export interface PreparedWeapon {index:number;identity:string;weapon:CombatWeapon;attribute:'strength'|'agility';options:ReturnType<typeof weaponAttackOptions>}
export interface AttackPreparationView {active:boolean;encounterId:string|null;weapons:PreparedWeapon[];targets:{id:string;name:string}[];rules:AttackRulesSummary;pending:{id:string;actorId:string;weaponIndex:number|null;type:string;targets:string[];phase:string;attackModifier:number}|null}
