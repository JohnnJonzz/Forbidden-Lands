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
  const session=applyDiceCommand(record.session,c,{lookup:()=>null,adjacent:()=>false,calibrated:false},new Date().toISOString(),sides=>randomInt(1,sides+1));
  if(c.type==='create'){const e=activeCombat(repo,c.campaignId),card=session.dice!.find(r=>r.id===c.roll.id)!;const weapon=card.weaponSnapshot?catalogWeapon(JSON.parse(card.weaponSnapshot).name??''):null;if(weapon)card.equipmentId=weapon.id;if(e?.pending?.kind==='punch'&&e.pending.actorId===card.characterId&&card.result.skill==='Melee'&&card.metadata.weaponIndex===null)card.equipmentId='unarmed';if(e){const response=combatWorkflow(e,session.characters).responses.find(r=>r.characterId===card.characterId&&r.step!=='decision');card.combatContext={encounterId:e.id,actionId:e.pending?.id??outstandingBroken(e).find(x=>x.actor.id===card.characterId)?.procedure.id??null,round:e.round,turnId:e.combatants[e.turn].id,step:response?.step==='attack'||response?.step==='defense'||response?.step==='armor'||response?.step==='movement'||response?.step==='critical'||response?.step==='helmet'?response.step:null}}}
  if(c.type==='create'){const request=requestedConsequenceRoll(repo,c.campaignId,c.roll.characterId,principal),card=session.dice!.find(d=>d.id===c.roll.id)!;if(request&&(request.context.step==='deadline'&&card.metadata.utility?.kind==='Procedure'||request.context.step==='treatment'&&card.result.skill==='Healing'&&!card.metadata.utility))card.procedureContext=request.context;if(c.expectedProcedureContext&&JSON.stringify(card.procedureContext)!==JSON.stringify(c.expectedProcedureContext))throw new AIError('consequence_roll_stale','The requested consequence procedure changed before this roll was saved. It was not reassigned; refresh the request.',409);}
  if(c.type==='create'&&c.expectedCombatContext){const actual=session.dice!.find(r=>r.id===c.roll.id)!.combatContext,expected=c.expectedCombatContext;if(!actual||Object.entries(expected).some(([k,v])=>actual[k as keyof typeof actual]!==v))throw new AIError('combat_roll_stale','The requested combat step changed before these dice were saved. This roll was not reassigned. Refresh the pending roll and stage its current dice.',409);}
  const pushed=c.type==='push'?session.dice?.find(r=>r.id===c.rollId):null;
  reconcileCombatSheets(repo,record.id,session,pushed?.metadata.attribute&&pushed.result.attributeDamage>0&&(mechanicalCharacter(record.session.characters.find(ch=>ch.id===pushed.characterId)!).attributes[pushed.metadata.attribute].current??0)>0?{characterId:pushed.characterId,attribute:pushed.metadata.attribute}:undefined);
  const updated=repo.update(record.id,record.revision,session);db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,c.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}

// Future narration adapters consume this one immutable public packet per submitted group.
// Staging, pushing and readiness never enqueue narration or call an AI service.
export function getQuarterDayNarration(campaignId:string,batchId:string,repo:SqliteCampaignRepository=getLocalRepository(),principal:CharacterPrincipal|null=null){const batch=repo.get(campaignId)?.session.diceGroups?.batches.find(b=>b.id===batchId);if(!batch)throw new Error('Submitted batch not found');return structuredClone(batch)}
