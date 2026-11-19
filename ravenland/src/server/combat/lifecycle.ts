import {randomUUID} from 'node:crypto';
import type {BrokenProcedure,CombatEncounter,EncounterOutcome} from '../../lib/combat/types';
import type {Session} from '../../lib/types';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import {mechanicalCharacter} from '../mechanical-character';
import {citation} from './sources';
import {AIError} from '../ai/config';
import {nextTurn} from './engine';

export const brokenEffects:Record<string,string>={strength:'Knocked senseless, but may crawl and mumble through pain; no other actions or skill rolls. Defenseless; do not assume coma or death.',agility:'May crawl and wheeze; no other actions or skill rolls. Defenseless, not automatically dead.',wits:'Fear/confusion; if conscious may run to safety, but no other actions or skill rolls. Awareness depends on the actual horror injury.',empathy:'Overwhelmed by despair; uncommunicative until at least one Empathy is recovered.'};
export function verifyBrokenRules(pages:SourcePassage[]){
 const clean=(p:SourcePassage)=>p.text.replace(/-\s+/g,'').replace(/\s+/g,' ');
 const broken=pages.find(p=>/attribute score reaches zero.*Broken/i.test(clean(p))&&/Crawl.*mumble/i.test(clean(p))&&/Crawl.*wheeze/i.test(clean(p)));
 const recovery=pages.find(p=>/D6 hours.*one point back in the relevant attribute/i.test(clean(p))&&/critical injury/i.test(clean(p)));
 const pushed=pages.find(p=>/don.t risk any critical injury when Broken.*push a roll/i.test(clean(p))&&/never kill yourself/i.test(clean(p)));
 if(!broken||!recovery||!pushed)return null;
 return [broken,recovery,pushed].map(citation);
}
export function outstandingBroken(e:CombatEncounter){return e.combatants.flatMap(a=>(a.brokenProcedures??[]).filter(p=>p.stage!=='resolved').map(procedure=>({actor:a,procedure})));}
// Sheet values remain authoritative. A zero transition is recorded once; healing
// closes the episode, never deletes the injury. Missing values are not zero.
export function syncPlayerConditions(e:CombatEncounter,session:Session,push?:{characterId:string;attribute:string}){
 for(const a of e.combatants.filter(a=>a.side==='player')){
  const ch=session.characters.find(c=>c.id===a.characterId);if(!ch){a.withdrawn=true;continue;}
  const attributes=mechanicalCharacter(ch).attributes;
  a.current=Object.fromEntries(Object.entries(attributes).flatMap(([key,v])=>v.current===null?[]:[[key,v.current]]));
  a.maximum=Object.fromEntries(Object.entries(attributes).flatMap(([key,v])=>v.regular===null?[]:[[key,v.regular]]));
  a.broken=Object.values(a.current).some(v=>v===0);
  for(const p of a.brokenProcedures??[])if(a.current[p.attribute]>0)p.active=false;
  for(const [attribute,value] of Object.entries(a.current))if(value===0&&!(a.brokenProcedures??[]).some(p=>p.active&&p.attribute===attribute)){
   const cause=push?.characterId===a.id&&push.attribute===attribute?'push':'unknown';
   const required=['strength','wits'].includes(attribute)&&cause!=='push';
   (a.brokenProcedures??=[]).push({id:randomUUID(),attribute,active:true,cause,stage:required?'cause':'resolved',openedAt:new Date().toISOString(),note:brokenEffects[attribute]??'Broken; source-backed adjudication required.',sources:[]});
  }
 }
}
export function lifecycleBlocker(e:CombatEncounter){
 if(e.lifecycleEvidenceIssue)return e.lifecycleEvidenceIssue;
 if(e.pending)return 'Finish the recorded '+e.pending.phase.replaceAll('_',' ')+' before concluding the encounter. No attack, defense, Armor or damage record can be discarded.';
 const critical=e.combatants.find(a=>a.critical?.status==='required');if(critical)return critical.name+' still requires the official critical injury procedure.';
 const p=outstandingBroken(e)[0];if(p)return p.actor.name+': '+(p.procedure.stage==='cause'?'confirm the cause of Broken to determine the required injury procedure.':p.procedure.stage==='helmet'?'roll the recorded helmet protection before finalizing this critical injury.':'roll D66 on the character sheet for the required '+p.procedure.cause+' critical injury, then attach and Send.');
 if(e.combatants.some(a=>a.side==='player'&&a.broken)&&!e.brokenRuleSources?.length)return 'The official Broken and recovery evidence is unavailable. Restore the indexed Handbook and recheck before concluding.';
 return null;
}
export function conclusionKind(e:CombatEncounter):EncounterOutcome['kind']|null{
 const capable=(side:string)=>e.combatants.some(a=>a.side===side&&!a.broken&&!a.withdrawn&&!a.surrendered);
 if(!capable('player'))return e.combatants.filter(a=>a.side==='player').every(a=>a.withdrawn||a.surrendered)?'separated':'player_defeat';
 if(!capable('enemy'))return e.combatants.filter(a=>a.side==='enemy').every(a=>a.withdrawn||a.surrendered)?'separated':'opponents_defeated';
 return null;
}
export function concludeEncounter(e:CombatEncounter,session:Session,kind:EncounterOutcome['kind'],reason:string){
 if(e.status==='ended')return;
 const blocker=lifecycleBlocker(e);if(blocker)throw new AIError('combat_conclusion_pending',blocker,409);
 e.status='ended';e.endedAt=new Date().toISOString();delete e.actionDraft;
 e.outcome={kind,concludedAt:e.endedAt,reason,location:e.sceneLocation,hex:e.sceneHex,
 players:e.combatants.filter(a=>a.side==='player').map(a=>({id:a.id,name:a.name,current:{...a.current},broken:a.broken,withdrawn:a.withdrawn,injuries:session.characters.find(c=>c.id===a.id)?.sheet?.['critical-injuries'] as string||null,procedures:structuredClone(a.brokenProcedures??[])})),
 npcs:e.combatants.filter(a=>a.side==='enemy').map(a=>({id:a.id,name:a.name,broken:a.broken,withdrawn:a.withdrawn||!!a.surrendered,critical:structuredClone(a.critical)})),
 events:e.history.slice(-8).flatMap(a=>a.results.map(r=>`${e.combatants.find(c=>c.id===a.actorId)?.name} → ${e.combatants.find(c=>c.id===r.targetId)?.name}: ${r.remaining} uncanceled successes; ${r.afterArmor??'unresolved'} damage after armor. Player damage remains sheet-managed.`)),
 policy:'Frozen encounter outcome, not permission for further actions. Broken is not death. Preserve attribute-specific awareness and player decisions. Injuries and lethal timers persist after combat. Do not assume theft, captivity, rescue, death, recovery or resource changes. Established NPC goals come only from the confirmed scene and approved memories. Narrate attempts and intentions; mechanical changes require authorized application operations.'};
}
export function advanceLifecycle(e:CombatEncounter,session:Session,pages?:SourcePassage[]){
 if(e.status==='ended')return;
 syncPlayerConditions(e,session);
 if(pages){const verified=verifyBrokenRules(pages);if(verified){e.brokenRuleSources=verified;for(const a of e.combatants)for(const p of a.brokenProcedures??[])if(!p.sources.length)p.sources=verified;}}
 if(lifecycleBlocker(e))return;
 const kind=conclusionKind(e);if(kind){concludeEncounter(e,session,kind,kind==='player_defeat'?'No player combatant can continue normal combat.':kind==='opponents_defeated'?'No hostile combatant can continue normal combat.':'A side has explicitly withdrawn or surrendered.');return;}
 const active=e.combatants[e.turn];if(active.broken||active.withdrawn||active.surrendered)nextTurn(e);
}
