import type {CombatRollContext} from '../dice/schema';
export interface RequestedCombatRoll {context:CombatRollContext;label:string;purpose:string;attribute:'agility'|'strength'|null;base:number;skill:number;gear:number;modifier:number;isArmor:boolean;instructions:string}

export interface DefensePool {defense:'dodge'|'parry';label:string;attribute:'agility'|'strength';base:number;skill:number;gear:number;modifier:number}

export interface RequestedJourneyRoll {context:{narrativeRequestId:string};label:string;purpose:string;attribute:'wits'|null;base:number;skill:number;gear:number;modifier:number;isArmor:boolean;instructions:string;utility?:{kind:'D66'}}
export type RequestedActivityRoll=NonNullable<ReturnType<typeof import('../../server/activities/context').requestedActivityRoll>>;
export type RequestedSheetRoll=NonNullable<ReturnType<typeof import('../../server/quarter-resolution/rolls').requestedWatchRoll>>|NonNullable<ReturnType<typeof import('../../server/quarter-resolution/rolls').requestedNavigationRoll>>|RequestedActivityRoll|RequestedJourneyRoll|RequestedCombatRoll|import('../consequences/schema').RequestedConsequenceRoll;
