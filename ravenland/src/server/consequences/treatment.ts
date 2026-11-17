import {worldEvents} from '../world/context';
import {readConsequences} from './store';
import type {Consequence,TreatmentAttempt} from '../../lib/consequences/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {mechanicalCharacter} from '../mechanical-character';
import {standardSkill} from '../../lib/rules/character-registry';
import {AIError} from '../ai/config';
import {injurySource} from './registry';
import {treatmentRules} from './rules';
import {activeCombat} from '../combat/store';
export function treatmentPool(repo:SqliteCampaignRepository,c:Consequence,healerId:string){
 if(worldEvents(repo,c.campaignId).some(v=>v.sceneId===c.source.encounterId&&v.actorId===healerId&&v.code==='departed'&&v.status==='completed'))throw new AIError('consequence_presence','This NPC has a verified departure and cannot treat the patient here.',409);
 const rules=treatmentRules(repo,c.campaignId),source=injurySource(repo,c),patientId=c.characterIds[0],session=repo.get(c.campaignId)!.session;
 if(!source||!c.state.deadline||c.state.deadline.value===null||c.status==='resolved')throw new AIError('consequence_treatment','Establish the actual lethal deadline before preparing treatment. A resolved injury cannot be treated again.',409);
 if(activeCombat(repo,c.campaignId))throw new AIError('consequence_treatment','Treatment during active initiative requires combat adjudication. It cannot bypass the player-action dispatcher or pending attacks.',409);
 if(c.state.deadline.clockReviewRequired)throw new AIError('consequence_treatment','Reconcile the actual elapsed time before treatment; no time was assumed.',409);
 const healer=session.characters.find(c=>c.id===healerId),npc=source.encounter.combatants.find(a=>a.side==='enemy'&&a.id===healerId),combatant=source.encounter.combatants.find(a=>a.id===healerId),recordedAccess=c.state.sceneAccess,clock=session.campaign,access=recordedAccess&&recordedAccess.hex===clock.hex&&recordedAccess.location===clock.location&&recordedAccess.date===clock.date&&recordedAccess.quarter===clock.quarter?recordedAccess:null;
 if(!healer&&!npc)throw new AIError('consequence_healer','Choose an actual recorded healer; no new NPC or statistics were invented.',409);
 if(c.state.attempts.some(a=>a.healerId===healerId&&a.status!=='cancelled'))throw new AIError('consequence_attempt','That person already has an attempt reserved or recorded for this injury. Each person may try only once.',409);
 const sameScene=source.encounter.sceneHex===session.campaign.hex&&source.encounter.sceneLocation===session.campaign.location;
 if(!sameScene||!combatant||source.encounter.sceneAbsentCharacters?.includes(healer?.name??npc?.name??'')){if(!access?.healerIds.includes(healerId))throw new AIError('consequence_presence','This healer is not established as present and able to reach the patient. Use the local scene-access adjudication; do not assume the whole party is here.',409);}
 if(source.encounter.range==='Arm'&&source.encounter.combatants.some(a=>a.side==='enemy'&&!a.broken&&!a.withdrawn)&&!access?.safe)throw new AIError('consequence_proximity','A surviving opponent was last recorded at Arm’s Length. Confirm the actual safe treatment circumstances through scene adjudication; enemy withdrawal or help was not assumed.',409);
 const originalRound=source.encounter.rolls.find(r=>r.id===source.procedure.rollId)?.round??source.encounter.round,actionRound=c.state.deadline.unit==='rounds'?originalRound+c.state.deadline.elapsed:null,actionWindow=actionRound===null?(access?.evidence?'adjudication:'+access.evidence:'encounter:'+source.encounter.id+':round:'+source.encounter.round):'encounter:'+source.encounter.id+':round:'+actionRound;
 let base:number|null,skill:number|null;const attribute=standardSkill('Healing')?.attribute;if(attribute!=='empathy')throw new AIError('consequence_registry','Healing must match the verified canonical Empathy registry.',409);
 if(healer){const mc=mechanicalCharacter(healer);if(Object.values(mc.attributes).some(a=>a.current===null))throw new AIError('consequence_healer_data','The healer’s current condition is incomplete. Record the actual attributes before establishing eligibility.',409);if(Object.values(mc.attributes).some(a=>a.current===0))throw new AIError('consequence_broken_healer','A Broken healer cannot make this skill roll. Self-treatment requires actual attribute recovery first.',409);base=mc.attributes.empathy.current;skill=mc.skills['skill-healing'];if(mc.talents.some(t=>/healer/i.test(t.name)))throw new AIError('consequence_talent','A relevant recorded talent needs source-backed modifier adjudication before this treatment pool is prepared.',409);}
 else {if(npc!.broken||npc!.withdrawn||!npc!.enemy||Object.values(npc!.current).some(v=>v===0))throw new AIError('consequence_healer','This NPC is not capable of the treatment attempt.',409);base=npc!.current.empathy??null;skill=npc!.enemy.skills.healing??0;}
 if(base===null||skill===null)throw new AIError('consequence_healer_data','The healer’s current Empathy or Healing value is missing. Record the actual value; no default was invented.',409);
 if(combatant&&(actionRound===null?!access?.healerIds.includes(healerId):actionRound<=source.encounter.round)&&(!combatant.slow||combatant.turnDone))throw new AIError('consequence_actions','The recorded combatant has already spent the slow action in this round. Record actual elapsed rounds before a new slow treatment action; chat does not refresh actions.',409);
 if(readConsequences(repo,c.campaignId).filter(v=>v.source.encounterId===c.source.encounterId).some(v=>v.state.attempts.some(a=>a.healerId===healerId&&a.actionWindow===actionWindow&&a.status!=='cancelled')))throw new AIError('consequence_actions','This healer already has a slow treatment action in the recorded round. No extra action or elapsed round was invented.',409);
 const modifier=c.state.deadline.modifier+(healerId===patientId?-2:0);
 return {actionRound,actionWindow,kind:healer?'player' as const:'npc' as const,name:healer?.name??npc!.name,pool:{attribute:'empathy' as const,base,skill,gear:0 as const,modifier},sources:rules.sources};
}
export function applyTreatmentResult(c:Consequence,attempt:TreatmentAttempt,rollId:string,successes:number){
 attempt.rollId=rollId;attempt.successes=successes;attempt.status=successes>=1?'succeeded':'failed';
 if(attempt.status==='succeeded'){c.status='resolved';c.state.resolution='survived_critical';c.state.resolutionEvidence=rollId;c.nextProcedure='Successful lifesaving Healing is verified. The lethal threat is resolved; the critical injury, lasting effects and Broken attributes remain recorded. Recovery and later injury care are separate obligations.';c.state.notes.push('Lifesaving treatment does not erase the source critical or automatically restore attributes.');}
}
