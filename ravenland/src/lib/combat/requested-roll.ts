import type {CombatRollContext} from '../dice/schema';
export interface RequestedCombatRoll {context:CombatRollContext;label:string;purpose:string;attribute:'agility'|'strength'|null;base:number;skill:number;gear:number;modifier:number;isArmor:boolean;instructions:string}

export interface DefensePool {defense:'dodge'|'parry';label:string;attribute:'agility'|'strength';base:number;skill:number;gear:number;modifier:number}

export type RequestedSheetRoll=RequestedCombatRoll|import('../consequences/schema').RequestedConsequenceRoll;
