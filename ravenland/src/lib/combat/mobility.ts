import type {CombatSource,CombatRange,CombatWeapon} from './types';
export interface MobilityRules {unarmed?:CombatWeapon;version:1;run:'fast';retreat:'fast';draw:'fast';ready:'fast';load:'slow';fastMayUseSlow:true;retreatThreshold:number;retreatFailureFreeAttack:true;retreatDefense:false;voluntaryDrop:'adjudication';sources:CombatSource[]}
export interface CombatAction {id:string;round:number;actorId:string;targetId?:string;kind:'run'|'retreat'|'draw'|'ready'|'load'|'select'|'stand'|'end';cost:'fast'|'slow'|'none';from?:CombatRange;to?:CombatRange;weapon?:string;successes?:number;note?:string;at:string;attackCursor:number;sources:CombatSource[]}
export interface MovementState {from:CombatRange;to:CombatRange;kind:'run'|'retreat';cost?:'fast'|'slow';rollId?:string}
export interface WeaponHandling {held:number[];active:number|null;preparation?:Record<string,{reference:string;ready:boolean;loaded:boolean;ammunition?:{state:string;source:string;recorded:string|null}}>}
