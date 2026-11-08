import type {WeaponFactRequest,WeaponField} from './weapon-request';
export interface FactEvidence {value:number|string;documentId:string;chunkId:string;physicalPage:number|null;quote:string;header:string;source:'pdf'|'house-rule'|'curated'}
export interface CheckedFact {status:'verified'|'missing'|'conflict'|'unverified_override';evidence:FactEvidence[];value?:number|string}
export interface MechanicalFacts {request:WeaponFactRequest;weapons:{name:string;fields:Record<WeaponField,CheckedFact>}[];extraDamage:CheckedFact;firstHit:CheckedFact;missing:string[];calculation:{status:'verified'|'unverified';damage?:number;additionalSuccesses?:number;assumption:string};attackSkill:CheckedFact}
