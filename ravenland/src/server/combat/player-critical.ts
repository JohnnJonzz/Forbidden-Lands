import type {BrokenProcedure,CombatEncounter} from '../../lib/combat/types';
import type {Session,Character} from '../../lib/types';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import {exactInteger} from '../mechanical-character';
import {AIError} from '../ai/config';
import {citation} from './sources';
import {outstandingBroken} from './lifecycle';

export function helmetProtection(ch:Character){const s=ch.sheet;return s?.['helmet-worn']===true&&s['helmet-carried']!=='No'?exactInteger(s['helmet-rating'],0,12):0;}
export function injuryRow(pages:SourcePassage[],table:string,value:number){
 const label=table==='stab'?'STAB WOUNDS':table==='blunt'?'BLUNT FORCE':table==='horror'?'HORROR':'SLASH WOUNDS';
 for(const page of pages.filter(p=>p.text.includes('CRITICAL INJURIES')&&p.text.includes(label))){
  const rows=[...page.text.matchAll(/(?:^|\n)(\d{2})(?:[–−-](\d{2}))?\s+([\s\S]*?)(?=\n\d{2}(?:[–−-]\d{2})?\s|\nJohn Hadley|$)/g)];
  const row=rows.find(m=>value>=Number(m[1])&&value<=Number(m[2]??m[1]));if(row)return {page,text:row[3].replace(/\s+/g,' ').trim().slice(0,1000)};
 }
 return null;
}
function recordInjury(ch:Character,p:BrokenProcedure){const marker='[Combat injury '+p.id+']';ch.sheet??={};const old=String(ch.sheet['critical-injuries']??'');if(!old.includes(marker))ch.sheet['critical-injuries']=(old?old+'\n\n':'')+marker+' '+p.note;}
export function confirmBrokenCause(e:CombatEncounter,session:Session,characterId:string,procedureId:string,cause:BrokenProcedure['cause'],pages:SourcePassage[]){
 const entry=outstandingBroken(e).find(x=>x.actor.id===characterId&&x.procedure.id===procedureId),ch=session.characters.find(c=>c.id===characterId);
 if(e.pending)throw new AIError('combat_pending','Finish the recorded attack, defense and Armor before confirming its injury procedure.',409);
 if(!entry||!ch||entry.procedure.stage!=='cause'||cause==='unknown')throw new AIError('combat_critical','This Broken cause is no longer awaiting confirmation.',409);
 const p=entry.procedure;
 if(p.attribute==='wits'&&!['push','condition','horror'].includes(cause)||p.attribute==='strength'&&cause==='horror')throw new AIError('combat_critical','That cause does not establish the critical procedure for this attribute.',409);
 p.cause=cause;
 if(cause==='push'||cause==='condition'){p.stage='resolved';p.note+=' Confirmed '+cause+' damage: no critical injury. This confirmation did not apply damage or recovery.';return;}
 if(cause==='other'){
  const source=pages.find(p=>{const text=p.text.replace(/-\s+/g,'').replace(/\s+/g,' ');return /CRITICAL INJURIES.*OTHERS/.test(text)&&/Non[–−-]typical.*Damage.*Yes.*D6 days/i.test(text)&&/unconscious until you die or are HEALED/i.test(text)});if(!source)throw new AIError('combat_evidence','The official Other Forms of Damage procedure is unavailable.',409);
  p.sources.push(citation(source));p.stage='resolved';p.note='Non-typical damage: unconscious until HEALED or death, according to the official Others table (physical PDF p. '+source.startPage+'). Lethal D6-day deadline: roll and track manually; no deadline result, recovery or death was invented.';recordInjury(ch,p);return;
 }
 p.stage='roll';p.openedAt=new Date().toISOString();p.note+=' Awaiting the actual '+cause+' D66 critical roll.';
}
export function bindCriticalRoll(e:CombatEncounter,packet:VerifiedRollSubmission,session:Session,pages:SourcePassage[]){
 const entry=outstandingBroken(e).find(x=>x.actor.id===packet.character.id),ch=session.characters.find(c=>c.id===packet.character.id);if(!entry||!ch)throw new AIError('combat_critical','No matching critical procedure remains.',409);
 const p=entry.procedure;
 if(p.stage==='roll'){
  const utility=packet.metadata.utility;if(utility?.kind!=='D66')throw new AIError('combat_critical','Use the saved D66 result from the character sheet.',409);
  const value=utility.faces[0]*10+utility.faces[1],row=injuryRow(pages,p.cause,value);if(!row)throw new AIError('combat_evidence','The official critical injury row is unavailable. The saved roll remains available; restore the evidence and retry.',409);
  const helmetCase=p.cause==='slash'&&value===65||p.cause==='stab'&&value===64||p.cause==='blunt'&&value>=64;
  if(helmetCase){const rule=pages.find(p=>/HELMETS:/.test(p.text)&&/11[–−-]12 blunt force injury/.test(p.text));if(!rule)throw new AIError('combat_evidence','The official helmet critical protection rule is unavailable.',409);p.sources.push(citation(rule));if(helmetProtection(ch)===null)throw new AIError('combat_critical','Record the worn helmet rating before resolving this potentially lethal injury.',409);}
  p.value=value;p.rollId=packet.rollId;p.sources.push(citation(row.page));p.note='D66 '+value+' · '+p.cause+' · '+row.text+' (physical PDF p. '+row.page.startPage+'). Healing, lethal deadlines and lasting effects remain tracked manually; no recovery or death is inferred beyond this exact source row.';
  p.stage=helmetCase&&(helmetProtection(ch)??0)>0?'helmet':'resolved';
  e.rolls.push({id:packet.rollId,round:e.round,combatantId:ch.id,actionId:p.id,type:'table',pool:{base:0,skill:0,gear:0},result:null,table:{sides:66,faces:utility.faces,value},pushed:false,createdAt:packet.createdAt,source:p.sources});
 }else if(p.stage==='helmet'){
  p.helmetRollId=packet.rollId;
  if((packet.successes??0)>0){const row=injuryRow(pages,'blunt',11);if(!row)throw new AIError('combat_evidence','The replacement 11–12 blunt-force injury is unavailable.',409);p.note='Helmet protection succeeded: '+row.text+' (physical PDF p. '+row.page.startPage+'). Helmet Armor Rating reduced to zero by the official rule.';ch.sheet!['helmet-rating']='0';p.sources.push(citation(row.page));}
  p.stage='resolved';e.rolls.push({id:packet.rollId,round:e.round,combatantId:ch.id,actionId:p.id,type:'armor',pool:{base:0,skill:0,gear:packet.result.gear.length},result:packet.result,table:null,pushed:false,createdAt:packet.createdAt,source:p.sources});
 }else throw new AIError('combat_critical','Confirm the Broken cause before rolling.',409);
 e.consumedPlayerRolls.push(packet.rollId);if(p.stage==='resolved')recordInjury(ch,p);
 return ch.name+': '+p.note+(p.stage==='helmet'?' Roll the worn helmet’s Gear Dice before finalizing the injury.':'');
}
