import type {SourcePassage} from '../../lib/sourcebooks/schema';
import type {MobilityRules} from '../../lib/combat/mobility';
import {hitThresholdRule} from '../sourcebooks/mechanical-facts';
import {AIError} from '../ai/config';
import {citation,officialWeapon} from './sources';
export function verifiedMobilityRules(pages:SourcePassage[]):MobilityRules{
 const sources:ReturnType<typeof citation>[]=[],find=(pattern:RegExp,label:string)=>{const p=pages.find(p=>pattern.test(p.text.replace(/-\s+/g,'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').replace(/\s+([.,:])/g,'$1')));if(!p)throw new AIError('combat_evidence','The indexed official Handbook does not establish '+label+'. Movement or weapon handling requires adjudication.',409);sources.push(citation(p));return p};
 find(/one slow action and one fast action, or two fast actions/i,'the action economy');
 find(/FAST ACTIONS.*Run.*Retreat.*Ready Weapon/i,'fast Run, Retreat and Ready actions');
 find(/RUN action \(fast\) or CRAWL \(slow\).*neighboring zone.*between NEAR and ARM'S LENGTH.*No roll is required to RUN.*ROUGH zone/i,'ordinary Run and rough-ground restrictions');
 find(/Short Up to 25 meters away, in a bordering zone.*Long Up to one hundred meters \(four segments\)/i,'Short neighboring-zone range and non-unit Long distances');
 find(/active enemy at ARM'S LENGTH, you can't RUN away.*RETREAT/i,'leaving melee restrictions');
 find(/RETREAT: This action must be used instead of RUN if you have an active enemy at ARM'S/i,'Retreat prerequisites');
 find(/LENGTH\. Brings you to NEAR range\. Roll for MOVE\. If you fail, you move but your enemy gets a free attack.*doesn't count toward their actions.*can't PARRY or DODGE/i,'Retreat failure and the undefendable free attack');
 find(/DRAW WEAPON:.*No roll is required\. This fast action/i,'Draw Weapon cost');
 find(/READY WEAPON: Fast action.*bow or sling.*can't take any slow action other than SHOOT and no fast action other than AIM.*anything else, you must READY/i,'bow and sling readiness interruption');
 find(/LOAD a crossbow \(slow action\) before each shot.*carry a LOADED crossbow around as long as you like/i,'crossbow loading and persistence');
 find(/GRIP indicates if you need one or two hands.*two.*handed weapon can't be combined with a shield/i,'weapon grip and shield restrictions');
 const threshold=pages.map(p=>({p,fact:hitThresholdRule(p)})).find(v=>v.fact?.fact.value===1);if(!threshold)throw new AIError('combat_evidence','The source does not establish Move success requirements.',409);sources.push(citation(threshold.p));
 let unarmed;try{unarmed=officialWeapon(pages,'Unarmed')}catch(e){if(!(e instanceof AIError))throw e}
 return {unarmed,version:1,run:'fast',retreat:'fast',draw:'fast',ready:'fast',load:'slow',fastMayUseSlow:true,retreatThreshold:1,retreatFailureFreeAttack:true,retreatDefense:false,voluntaryDrop:'adjudication',sources:[...new Map(sources.map(s=>[s.chunkId,s])).values()]};
}
