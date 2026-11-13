import {hitThresholdRule} from '../sourcebooks/mechanical-facts';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import type {AttackRulesSummary} from '../../lib/combat/attack-rules';
import {citation} from './sources';
import {AIError} from '../ai/config';

// Values become available only after their official passage is verified. No
// model inference, source permission changes or broad retrieval are involved.
export function verifiedAttackRules(pages:SourcePassage[]):AttackRulesSummary{
 const sources:ReturnType<typeof citation>[]=[],find=(pattern:RegExp,label:string)=>{for(const p of pages){const text=p.text.replace(/-\s+/g,'').replace(/[−–]/g,'-').replace(/\s+/g,' ').replace(/\s+([,:])/g,'$1'),m=text.match(pattern);if(m){sources.push(citation(p));return m}}throw new AIError('combat_evidence','The authorized handbook does not establish '+label+'. This attack requires adjudication.',409)};
 const hit=pages.find(p=>hitThresholdRule(p)?.fact.value===1);if(!hit)throw new AIError('combat_evidence','The handbook does not establish the ordinary hit threshold. Adjudication is required.',409);sources.push(citation(hit));
 find(/SLASH\s*:.*Requires a weapon with the EDGED or BLUNT feature.*STAB\s*:/i,'SLASH feature requirements');
 find(/STAB\s*:.*Requires a weapon with the POINTED feature/i,'STAB feature requirements');
 find(/SLASH\s*:.*Roll MELEE.*STAB\s*:/i,'Melee attack skill');
 find(/SLASH\s*:.*damage increases by one for each additional.*STAB\s*:/i,'additional-success SLASH damage');
 find(/STAB\s*:.*damage increases by one for each additional.*PUNCH/i,'additional-success STAB damage');
 const unarmed=pages.flatMap(page=>{const m=page.text.replace(/\s+/g,' ').replace(/\s+([.,:])/g,'$1').match(/PUNCH\/KICK\/BITE: Does not require a weapon\. Roll for MELEE\..*any attempt to PARRY gets a \+(\d+) bonus\..*takes 1 point of damage.*increases by one for each additional/);return m?[{page,parryBonus:Number(m[1])}]:[]})[0];if(unarmed)sources.push(citation(unarmed.page));
 const slashDodge=Number(find(/If the attacker SLASHES\s*, you get a \+(\d+) bonus/i,'Dodge against SLASH')[1]);
 const stabWeaponParry=-Number(find(/A target who PARRIES with a weapon gets a -(\d+) penalty/i,'weapon Parry against STAB')[1]);
 const stabShieldParry=Number(find(/parrying with a shield gives a \+(\d+) bonus/i,'shield Parry against STAB')[1]);
 const nonParryingWeapon=-Number(find(/lacks the PARRYING feature\s*, you get a -(\d+) penalty/i,'non-Parrying weapon penalty')[1]);
 const proneTarget=Number(find(/attacks against opponents that are prone are modified by \+(\d+)/i,'melee against prone targets')[1]);
 const range=find(/At SHORT range, you get a -(\d+) penalty, and at LONG range it.s a -(\d+).*At ARM.S LENGTH, you get -(\d+)/i,'ordinary ranged distance modifiers');
 const rangedModifiers={Arm:-Number(range[3]),Near:0,Short:-Number(range[1]),Long:-Number(range[2])};
 find(/defender must declare.*DODGE.*PARRY.*before you roll/i,'pre-roll defense timing');
 find(/Every x x you roll decreases the damage by one.*cannot be pushed/i,'armor reduction and push restriction');
 return {...(unarmed?{unarmed:{parryBonus:unarmed.parryBonus}}:{}),version:1,skill:'melee',actionCost:'slow',requiredSuccesses:1,extraSuccessDamage:1,slashFeatures:['Edged','Blunt'],stabFeature:'Pointed',bluntIsFeature:true,modifiers:{slashDodge,stabWeaponParry,stabShieldParry,nonParryingWeapon,proneTarget},rangedModifiers,defenseBeforeRoll:true,armor:{perSuccess:1,pushable:false},sources:[...new Map(sources.map(s=>[s.chunkId,s])).values()]};
}
