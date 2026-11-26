import type {SqliteCampaignRepository} from '../sqlite';
import {attackInputs,successCountPattern,successNumber} from '../../lib/rules/attack-inputs';
export interface AttackAdjudication {
 defense:{attempt?:'none'|'dodge'|'parry';actionAvailable?:boolean;declaredBeforeAttack?:boolean;shield?:boolean;parryingWeapon?:boolean;weaponTalentRank?:number;successes?:number};
 armor:{rating?:number;successes?:number};cover:{rating?:number;successes?:number};issues:string[];sources:string[];
}
export const emptyAdjudication=():AttackAdjudication=>({defense:{},armor:{},cover:{},issues:[],sources:[]});
// Explicit manual statements in ordinary chat only. Questions, NPC dialogue and
// arbitrary prose are not continuously mined for enemy statistics or dice.
export function parseAttackAdjudication(text:string,source:string):AttackAdjudication|null {
 const result=emptyAdjudication();let found=false;
 const put=<T extends object>(object:T,key:keyof T,value:T[keyof T])=>{if(object[key]!==undefined&&object[key]!==value)result.issues.push('Conflicting manual '+String(key)+' values; clarify this attack.');object[key]=value;found=true};
 for(const part of text.matchAll(/([^.!?;\n]+)([.!?;\n]|$)/g)){
  const sentence=part[1].trim();if(!sentence||part[2]==='?')continue;
  if(/^no (?:legal )?defen[cs]e (?:is )?available$/i.test(sentence)){put(result.defense,'actionAvailable',false);put(result.defense,'attempt','none')}
  if(/^no defen[cs]e (?:is |was )?attempted$/i.test(sentence))put(result.defense,'attempt','none');
  const attempt=sentence.match(/^(?:the )?target attempts (?:to )?(dodge|parry)$/i);if(attempt)put(result.defense,'attempt',attempt[1].toLowerCase() as 'dodge'|'parry');
  if(/^(?:a |the )?defensive action is available$/i.test(sentence))put(result.defense,'actionAvailable',true);
  if(/^defen[cs]e was declared before the attack roll$/i.test(sentence))put(result.defense,'declaredBeforeAttack',true);
  if(/^defen[cs]e was not declared before the attack roll$/i.test(sentence))put(result.defense,'declaredBeforeAttack',false);
  if(/^(?:the )?target has (?:a |no )shield$/i.test(sentence))put(result.defense,'shield',!(/\bno shield$/i.test(sentence)));
  if(/^(?:the )?target has (?:a |no )parrying weapon$/i.test(sentence))put(result.defense,'parryingWeapon',!(/\bno parrying weapon$/i.test(sentence)));
  const talent=sentence.match(/^relevant weapon talent rank:\s*(\d)$/i);if(talent)put(result.defense,'weaponTalentRank',Number(talent[1]));
  if(/^(?:the )?target is unarmou?red$/i.test(sentence))put(result.armor,'rating',0);
  const rating=sentence.match(/^(armor|armour|cover) rating:\s*(\d{1,3})$/i);if(rating)put(rating[1].toLowerCase()==='cover'?result.cover:result.armor,'rating',Number(rating[2]));
  const roll=sentence.match(new RegExp('^(defen[cs]e|armor|armour|cover) roll:\\s*('+successCountPattern+')\\s+success(?:es)?$','i'));if(roll)put(/^defen[cs]e$/i.test(roll[1])?result.defense:/^cover$/i.test(roll[1])?result.cover:result.armor,'successes',successNumber(roll[2]));
 }
 // Old allocation-only replies are recognized for compatibility, but never
 // alter ordinary SHOOT damage or block it behind a choice.
 const inputs=attackInputs(text);
 if(!text.includes('?')&&inputs.attackSuccesses===null&&(inputs.damageSuccesses!==null||/\bI (?:spend|allocate) all (?:extra|additional) successes (?:on|to) damage\b/i.test(text)))found=true;
 if(found)result.sources.push(source);return found?result:null;
}
export function mergeAdjudication(old:AttackAdjudication|undefined,current:AttackAdjudication){
 const defense={...old?.defense,...current.defense};if(current.defense.attempt&&current.defense.attempt!==old?.defense.attempt&&current.defense.successes===undefined)delete defense.successes;
 return {...emptyAdjudication(),defense,armor:{...old?.armor,...current.armor},cover:{...old?.cover,...current.cover},issues:current.issues,sources:[...new Set([...(old?.sources??[]),...current.sources])].slice(-6)};
}

export interface AttackDefenseDeclaration {actionId:string;characterId:string;recordedAt:string;manual:AttackAdjudication}
export function preRollDefense(repo:SqliteCampaignRepository,campaignId:string,characterId:string,actionId:string|undefined,createdAt:string):AttackDefenseDeclaration|null{
 if(!actionId)return null;
 const row=repo.db.prepare("SELECT context_json FROM ai_requests WHERE campaign_id=? AND kind='chat' AND status='completed' AND updated_at<=? AND json_extract(payload,'$.characterId')=? AND json_extract(context_json,'$.attackDefenseDeclaration.actionId')=? ORDER BY updated_at DESC,id DESC LIMIT 1").get(campaignId,createdAt,characterId,actionId);
 return row?JSON.parse(row.context_json as string).attackDefenseDeclaration:null;
}
