import {holdFor,makeRuling,rulings,rulingTransition,rulingHash} from '../rulings/store';
import {advanceTime} from '../time/service';
import type {CombatEncounter,BrokenProcedure} from '../../lib/combat/types';
import type {Consequence} from '../../lib/consequences/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {loadCombatRules,citation} from '../combat/sources';
import {injuryObligation,consequenceRulePages} from './rules';
import {newConsequence,readConsequences,saveConsequence} from './store';
export function injurySource(repo:SqliteCampaignRepository,c:Consequence){
 if(c.source.kind!=='combat_injury'||!c.source.encounterId)return null;
 const row=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? AND id=?').get(c.campaignId,c.source.encounterId);if(!row)return null;
 const encounter=JSON.parse(row.state_json as string) as CombatEncounter,actor=encounter.combatants.find(a=>a.brokenProcedures?.some(p=>p.id===c.source.procedureId)),procedure=actor?.brokenProcedures?.find(p=>p.id===c.source.procedureId);return actor&&procedure?{encounter,actor,procedure}:null;
}
export function nextConsequenceStep(c:Consequence){
 if(c.status==='resolved'||c.status==='superseded')return;
 const d=c.state.deadline;if(!d)return;
 if(d.clockReviewRequired){c.status='awaiting_adjudication';c.nextProcedure='The campaign clock changed. Confirm the actual elapsed '+d.unit+' through the consequence time control; no conversion or elapsed round was assumed.';return;}
 if(d.value!==null&&d.elapsed>=d.value){c.status='resolved';c.state.resolution='death_verified';c.state.resolutionEvidence=d.rollId;c.nextProcedure='The recorded lethal deadline has expired without successful treatment. Death is established by the recorded deadline and elapsed-time evidence; no resurrection or attribute recovery was applied.';return;}
 if(d.value===null){c.status='awaiting_roll';c.nextProcedure='Lethal injury: roll '+(d.dice===1?'D6':d.dice+'D6')+' on the character sheet using Stage requested Injury deadline, then attach and Send. This determines the deadline in '+d.unit+'; the critical D66 is already recorded and must not be rerolled.';return;}
 const prepared=c.state.attempts.find(a=>a.status==='prepared');if(prepared){c.status='awaiting_roll';c.nextProcedure='The designated healer must roll the requested Healing pool on their own sheet, optionally push an eligible failed roll, then attach and Send. This attempt has no result yet.';return;}
 c.status='awaiting_input';c.nextProcedure='The lethal deadline is '+d.value+' '+d.unit+'; '+d.elapsed+' '+d.unit+' of verified time has elapsed. Treatment requires an actual present, capable healer with safe access; roster membership is not presence. Each person gets one Healing attempt for this injury. The GM may pursue verified NPC intentions. No voluntary action by a Broken character, helper, rescue, treatment result or passage of time is assumed.';
}
function verifiedCritical(e:CombatEncounter,p:BrokenProcedure){const roll=e.rolls.find(r=>r.id===p.rollId);return p.stage==='resolved'&&p.value!==undefined&&roll?.table?.sides===66&&roll.table.value===p.value&&e.consumedPlayerRolls.includes(roll.id);}
// Runs only inside application operations. Does not modify combat, character,
// inventory or campaign-clock records; all consequences reference those sources.
export function syncConsequences(repo:SqliteCampaignRepository,campaignId:string){
 const record=repo.get(campaignId);if(!record)return;
 const existing=readConsequences(repo,campaignId),keys=new Set(existing.map(c=>c.source.kind+':'+c.source.id+':'+c.category));let pages:ReturnType<typeof loadCombatRules>['handbook']|undefined,sourceFailure=false;
 const books=()=>{if(!pages&&!sourceFailure)try{pages=consequenceRulePages(repo,campaignId)}catch{sourceFailure=true}return pages;};
 const rows=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at').all(campaignId);
 for(const row of rows){const e=JSON.parse(row.state_json as string) as CombatEncounter;
  for(const a of e.combatants.filter(a=>a.side==='player'))for(const p of a.brokenProcedures??[]){
   if(!verifiedCritical(e,p)||keys.has('combat_injury:'+p.id+':lethal_injury'))continue;
   const helmet=p.helmetRollId?e.rolls.find(r=>r.id===p.helmetRollId):null,protectedByHelmet=(helmet?.result?.successes??0)>0;
   const available=books(),fact=available?injuryObligation(available,protectedByHelmet?'blunt':p.cause,protectedByHelmet?11:p.value!):null;
   const review=existing.find(c=>c.source.kind==='combat_injury'&&c.source.id===p.id&&c.category==='mandatory_review');if(review&&!fact)continue;
   if(fact&&!fact.lethal){if(review&&!['resolved','superseded'].includes(review.status)){review.status='superseded';review.state.resolution='superseded';review.nextProcedure='Restored official evidence establishes a nonlethal critical. The source injury remains recorded.';saveConsequence(repo,review);}continue;}
   const c=review??newConsequence(campaignId,{kind:'combat_injury',id:p.id,encounterId:e.id,procedureId:p.id},fact?.deadline?'lethal_injury':'mandatory_review',fact?'Recorded critical: '+fact.row.text.split(/\b(?:Yes|No)\b/)[0].trim():'Recorded critical D66 '+p.value+' requires source-backed review.');c.category=fact?.deadline?'lethal_injury':'mandatory_review';c.urgency=fact?.deadline?'life':'mandatory';c.characterIds=[a.id];c.npcIds=e.combatants.filter(a=>a.side==='enemy'&&!a.broken&&!a.withdrawn).map(a=>a.id);c.visibility='Party Known';
   if(fact)c.rules=[citation(fact.row.page),...p.sources.filter(s=>s.page!==fact.row.page.startPage)];
   if(fact?.deadline){const criticalRound=e.rolls.find(r=>r.id===p.rollId)?.round??e.round;c.state.deadline={...fact.deadline,value:null,rollId:null,elapsed:Math.max(0,e.round-criticalRound),observedRound:e.round,clockDate:record.session.campaign.date,clockQuarter:record.session.campaign.quarter,clockReviewRequired:false};nextConsequenceStep(c)}
   else {c.status='awaiting_adjudication';c.nextProcedure=fact?'This lethal injury has no supported delayed-death interval. Review its exact source row for immediate-death or special effects; no death or rescue was invented.':'Restore the official Handbook and resolve any scoped house rule, then recheck this recorded critical. No critical roll or injury was replaced.';}
   saveConsequence(repo,c);if(!review)existing.push(c);keys.add(c.source.kind+':'+c.source.id+':'+c.category);
  }
  if(e.status==='ended'&&!e.administrativeAbort&&e.outcome&&!keys.has('combat_outcome:'+e.id+':aftermath')){const c=newConsequence(campaignId,{kind:'combat_outcome',id:e.id,encounterId:e.id,procedureId:null},'aftermath','Immediate aftermath of '+e.outcome.kind.replaceAll('_',' ')+' at '+e.sceneLocation+'.');c.visibility='Party Known';c.characterIds=e.combatants.filter(a=>a.side==='player').map(a=>a.id);c.npcIds=e.combatants.filter(a=>a.side==='enemy'&&!a.broken&&!a.withdrawn).map(a=>a.id);c.nextProcedure='Consider the verified encounter outcome, current awareness and established NPC motives. Propose intentions or supported world actions; no theft, restraint, rescue, death or recovery has occurred merely because combat ended.';saveConsequence(repo,c);keys.add('combat_outcome:'+e.id+':aftermath');}
 }
 for(const c of existing){if(!c.state.deadline||['resolved','superseded'].includes(c.status))continue;const before=JSON.stringify(c),source=injurySource(repo,c),d=c.state.deadline;
  try{consequenceRulePages(repo,campaignId,c.id)}catch{const evidenceHold=makeRuling(repo,{campaignId,sceneId:c.source.encounterId,originId:'evidence:'+c.id,consequenceId:c.id,domain:'rules_conflict',question:'Restore or resolve the required official consequence evidence for this injury.',scope:{key:c.id,fingerprint:rulingHash(c.source)},sources:['required-consequence-evidence'],resolutionTypes:[],blockingReason:'No safe manual replacement for the required official procedure is implemented.'});if(!['proposed','accepted','awaiting_review'].includes(evidenceHold.status))rulingTransition(repo,evidenceHold,'awaiting_review','Required official consequence evidence is unavailable again.');c.status='awaiting_adjudication';c.nextProcedure='Restore the official consequence evidence or adjudicate the applicable house rule before resolving this lethal obligation. The saved deadline and original injury remain intact.';if(JSON.stringify(c)!==before)saveConsequence(repo,c);continue;}
  for(const old of rulings(repo,campaignId).filter(r=>r.consequenceId===c.id&&r.domain==='rules_conflict'&&r.sources.includes('required-consequence-evidence')&&['awaiting_review','accepted','proposed'].includes(r.status)))rulingTransition(repo,old,'invalidated','Verified official consequence evidence is available again.');
  if(source&&source.encounter.round>d.observedRound){advanceTime(repo,{campaignId,eventId:'combat:'+source.encounter.id+':round:'+source.encounter.round,sceneId:source.encounter.id,unit:'rounds',amount:1,toRound:source.encounter.round,source:'combat:'+source.encounter.id,authority:{kind:'deterministic',id:'combat-round-adapter'},reason:'Observed the authoritative source encounter round.'});const updated=readConsequences(repo,campaignId).find(v=>v.id===c.id)!;Object.assign(c,updated);}
  if(record.session.campaign.date!==d.clockDate||record.session.campaign.quarter!==d.clockQuarter)d.clockReviewRequired=true;
  if(c.status==='awaiting_adjudication'&&!d.clockReviewRequired&&!rulings(repo,campaignId).some(r=>r.consequenceId===c.id))makeRuling(repo,{campaignId,sceneId:c.source.encounterId,originId:'legacy:'+c.id,consequenceId:c.id,domain:'consequence_review',question:c.nextProcedure,facts:['Imported an existing persisted adjudication hold without changing its mechanics or clock.'],sources:[c.source.id],scope:{key:c.id,fingerprint:rulingHash(c.source)},resolutionTypes:['consequence_review'],blockingReason:'The original protected question remains outstanding.'});
  nextConsequenceStep(c);const hold=holdFor(repo,campaignId,c.id);if(hold&&!['resolved','superseded'].includes(c.status)){c.status='awaiting_adjudication';c.nextProcedure=hold.question+(hold.blockingReason&&hold.blockingReason!==hold.question?' '+hold.blockingReason:'');}if(JSON.stringify(c)!==before)saveConsequence(repo,c);
 }
}
