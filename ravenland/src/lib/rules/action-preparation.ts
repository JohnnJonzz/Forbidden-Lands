import type {AttributeId,SkillId,RuleOrigin} from './character-registry';
import type {SourceCitation} from '../sourcebooks/schema';
export interface MechanicalCharacter {
 id:string;name:string;attributes:Record<AttributeId,{regular:number|null;current:number|null}>;
 skills:Record<string,number|null>;conditions:Record<string,boolean|null>;
 talents:{name:string;rank:number|null}[];
 weapons:{index:number;name:string;bonus:number|null;damage:number|null;range:string;skill:string;artifact:string;equipped:boolean|null}[];
}
export interface PreparedAction {
 version:1;status:'ready'|'needs_review'|'unsupported';campaignId:string;characterId:string;campaignRevision:number;
 declaration:string;action:'ranged_attack'|'unsupported';
 character:MechanicalCharacter;
 characterInputs:{attribute:number|null;skill:number|null;weapon:MechanicalCharacter['weapons'][number]|null};
 ruleInputs:{skillOrigin:'official';gearBonusOrigin:RuleOrigin|null;skill:SkillId|null;attribute:AttributeId|null;weaponGearBonus:number|null;poolRuleVerified:boolean};
 basePool:{base:number;skill:number;gear:number;total:number}|null;
 modifiers:{status:'none'|'unresolved';talents:{name:string;rank:number|null}[];conditions:string[];artifact:string|null};
 missing:string[];sources:SourceCitation[];evidence:{kind:string;chunkId:string;physicalPage:number|null;quote:string}[];
 stateChangesPermitted:false;
}
