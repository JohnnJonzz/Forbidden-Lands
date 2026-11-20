import {activityRules} from '../activities/rules';
import {matchingActivityRequest,validateActivityPool,afterActivityDice,prepareUnrequestedConsumption} from '../activities/dice';
import {bindNarrativeRoll} from '../narrative/rolls';
import {assertCombatCardNotAborted} from '../combat/administrative-cards';
import {navigationContext} from '../../lib/journey/expedition';
import {carryingScope} from '../logistics/overload';
import {carryingTotals} from '../../lib/carrying';
import {equipmentCatalog} from '../../lib/equipment-catalog';
import {sheetFor} from '../../lib/character-sheet';
import {assertCurrentRequest} from '../request-epoch';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {requestedConsequenceRoll} from '../consequences/context';
import {mechanicalCharacter} from '../mechanical-character';
import {outstandingBroken} from '../combat/lifecycle';
import {reconcileCombatSheets} from '../combat/lifecycle-store';
import {AIError} from '../ai/config';
import {catalogWeapon} from '../../lib/equipment-catalog';
import {createHash,randomInt} from 'node:crypto';
import {diceCommandSchema} from '../../lib/dice/schema';
import {applyDiceCommand} from '../../lib/dice/engine';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import {activeCombat} from '../combat/store';
import {combatWorkflow} from '../combat/workflow';
export function executeDice(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository(),principal:CharacterPrincipal|null=null){
 const c=diceCommandSchema.parse(raw);assertCurrentRequest(repo,c.campaignId,c.actionId);const db=repo.db,fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex');
 db.exec('BEGIN IMMEDIATE');try{
  const record=repo.get(c.campaignId);if(!record)throw new Error('Campaign not found');
  // Authorization boundary: resolve authenticated principal and campaign/character ownership here when accounts are introduced.
  const bound=c.type==='create'?c.expectedProcedureContext||c.metadata.utility?.kind==='Procedure':c.type==='push'?record.session.dice?.find(d=>d.id===c.rollId)?.procedureContext:null;if(bound)requireCharacterAccess(principal,c.campaignId,c.type==='create'?c.roll.characterId:record.session.dice!.find(d=>d.id===(c as {rollId:string}).rollId)!.characterId);
  const previous=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(c.campaignId,c.actionId) as {fingerprint:string}|undefined;
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Action ID reused with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  if(record.session.chatJourney&&['ready','submit-group','group-coordinator'].includes(c.type))throw new Error('Journey roll matching is disabled. Roll independently and enter manual outcomes in chat.');
  if(c.type==='push'&&record.session.dice?.find(r=>r.id===c.rollId)?.creatureContext)throw new AIError('creature_push','Creature rolls cannot damage the owner or grant owner Willpower through a character Push.',409);
  if(c.type==='push'){const saved=record.session.dice?.find(r=>r.id===c.rollId);if(saved)assertCombatCardNotAborted(repo,record.id,saved);}
  if(c.type==='create')prepareUnrequestedConsumption(repo,record.id,record.session,c);
  const session=applyDiceCommand(record.session,c,{lookup:()=>null,adjacent:()=>false,calibrated:false},new Date().toISOString(),sides=>randomInt(1,sides+1));
  if(c.type==='create'&&!c.metadata.utility){const ctx=navigationContext(record.session);if(ctx&&c.roll.characterId===ctx.characterId&&c.roll.skill==='Survival'){const actor=mechanicalCharacter(record.session.characters.find(ch=>ch.id===ctx.characterId)!);const base=actor.attributes.wits.current,skill=actor.skills['skill-survival'];if(base===null||skill===null)throw new AIError('journey_pool_unknown','Record the pathfinder’s actual current Wits and Survival before rolling this navigation check.',409);const modified=skill+ctx.modifier;if(c.metadata.attribute!=='wits'||c.roll.attribute.length!==base||c.roll.skillDice.length!==Math.abs(modified)||c.roll.negativeSkill!==(modified<0)||c.roll.gear.length||c.roll.artifacts.length)throw new AIError('journey_pool','Use the current Wits and Survival pool with the reviewed navigation modifier. Gear/artifact navigation bonuses need a supported source adapter; no extra dice were assumed.',409);}
  if(ctx&&c.roll.characterId===ctx.characterId&&c.roll.skill==='Survival'&&record.session.dice?.some(r=>r.journeyContext?.checkId===ctx.checkId))throw new AIError('journey_roll_exists','This navigation check already has a saved roll. Use it, push it legally, or resolve its actual mishap; do not reroll the hex.',409);if(ctx&&c.roll.characterId===ctx.characterId&&c.roll.skill==='Survival')session.dice!.find(d=>d.id===c.roll.id)!.journeyContext=ctx;if(c.expectedJourneyContext&&JSON.stringify(session.dice!.find(d=>d.id===c.roll.id)!.journeyContext)!==JSON.stringify(c.expectedJourneyContext))throw new AIError('journey_roll_stale','The navigation step changed before this roll was saved. Review the current journey.',409);}
  if(c.type==='create'&&c.roll.skill==='Endurance'&&!c.metadata.utility){const ch=record.session.characters.find(ch=>ch.id===c.roll.characterId)!;if(carryingTotals(sheetFor(ch),equipmentCatalog).overloaded)session.dice!.find(d=>d.id===c.roll.id)!.encumbranceScope=carryingScope(repo,record.id,activeCombat(repo,record.id)?'Run':'Hike');}
  if(c.type==='create'){const e=activeCombat(repo,c.campaignId),card=session.dice!.find(r=>r.id===c.roll.id)!;const weapon=card.weaponSnapshot?catalogWeapon(JSON.parse(card.weaponSnapshot).name??''):null;if(weapon)card.equipmentId=weapon.id;if(e?.pending?.kind==='punch'&&e.pending.actorId===card.characterId&&card.result.skill==='Melee'&&card.metadata.weaponIndex===null)card.equipmentId='unarmed';if(e){const response=combatWorkflow(e,session.characters).responses.find(r=>r.characterId===card.characterId&&r.step!=='decision');card.combatContext={encounterId:e.id,actionId:e.pending?.id??outstandingBroken(e).find(x=>x.actor.id===card.characterId)?.procedure.id??null,round:e.round,turnId:e.combatants[e.turn].id,step:response?.step==='attack'||response?.step==='defense'||response?.step==='armor'||response?.step==='movement'||response?.step==='critical'||response?.step==='helmet'?response.step:null}}}
  if(c.type==='create'){const request=requestedConsequenceRoll(repo,c.campaignId,c.roll.characterId,principal),card=session.dice!.find(d=>d.id===c.roll.id)!;if(request&&(request.context.step==='deadline'&&card.metadata.utility?.kind==='Procedure'||request.context.step==='treatment'&&card.result.skill==='Healing'&&!card.metadata.utility))card.procedureContext=request.context;if(c.expectedProcedureContext&&JSON.stringify(card.procedureContext)!==JSON.stringify(c.expectedProcedureContext))throw new AIError('consequence_roll_stale','The requested consequence procedure changed before this roll was saved. It was not reassigned; refresh the request.',409);}
  if(c.type==='create'&&c.expectedCombatContext){const actual=session.dice!.find(r=>r.id===c.roll.id)!.combatContext,expected=c.expectedCombatContext;if(!actual||Object.entries(expected).some(([k,v])=>actual[k as keyof typeof actual]!==v))throw new AIError('combat_roll_stale','The requested combat step changed before these dice were saved. This roll was not reassigned. Refresh the pending roll and stage its current dice.',409);}
  if(c.type==='create'&&!matchingActivityRequest(record.session,c))bindNarrativeRoll(repo,record.id,c,session,principal);
  const pushed=c.type==='push'?session.dice?.find(r=>r.id===c.rollId):null;
  reconcileCombatSheets(repo,record.id,session,pushed?.metadata.attribute&&pushed.result.attributeDamage>0&&(mechanicalCharacter(record.session.characters.find(ch=>ch.id===pushed.characterId)!).attributes[pushed.metadata.attribute].current??0)>0?{characterId:pushed.characterId,attribute:pushed.metadata.attribute}:undefined);
  if(c.type==='create'){const request=matchingActivityRequest(record.session,c);if(request){if(activeCombat(repo,record.id))throw Error('Resolve the active encounter before this quarter-day activity roll.');const slot=session.activityState?.entries.flatMap(e=>e.activities).find(a=>a.request?.context.requestId===request.context.requestId)?.request??session.activityState?.needs.find(n=>n.request?.context.requestId===request.context.requestId)?.request;if(slot)Object.assign(slot,request);if(JSON.stringify(request.evidence)!==JSON.stringify(activityRules(repo,record.id).sources))throw Error('The activity rule evidence changed. Review the specific procedure before applying this saved result.');validateActivityPool(request,c);const card=session.dice!.find(d=>d.id===c.roll.id)!;card.activityContext=request.context;afterActivityDice(repo,record.id,session,card);}}else if(c.type==='push'){const card=session.dice!.find(d=>d.id===c.rollId)!;if(card.activityContext)afterActivityDice(repo,record.id,session,card);}
  const updated=repo.update(record.id,record.revision,session,{activitiesValidated:true});db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,c.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}

// Future narration adapters consume this one immutable public packet per submitted group.
// Staging, pushing and readiness never enqueue narration or call an AI service.
export function getQuarterDayNarration(campaignId:string,batchId:string,repo:SqliteCampaignRepository=getLocalRepository(),principal:CharacterPrincipal|null=null){const batch=repo.get(campaignId)?.session.diceGroups?.batches.find(b=>b.id===batchId);if(!batch)throw new Error('Submitted batch not found');return structuredClone(batch)}
