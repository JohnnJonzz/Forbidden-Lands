import {readConsequences} from '../consequences/store';
import {applyReviewedRest} from './review';
import {reconcileCombatSheets} from '../combat/lifecycle-store';
import {activeCombat} from '../combat/store';
import {enforceCarrying} from '../logistics/overload';
import {assertCurrentRequest} from '../request-epoch';
import {activeChatForm} from '../../lib/journey/chat-engine';
import {journeyFor} from '../../lib/journey/engine';
import {createHash} from 'node:crypto';
import {applyJourneyCommand} from '../../lib/journey/engine';
import {commandSchema} from '../../lib/journey/schema';
import {isAdjacent} from '../../lib/map/geometry';
import {ConflictError} from '../repository';
import {getLocalRepository,SqliteCampaignRepository} from '../sqlite';
import {SqliteMapStore} from '../map/store';
export class JourneyInputError extends Error {}
export function executeJourney(raw:unknown,repository:SqliteCampaignRepository=getLocalRepository()){
 const command=commandSchema.parse(raw);assertCurrentRequest(repository,command.campaignId,command.actionId);if(command.type==='quarter-roll')throw new JourneyInputError('Create a pending dice result and submit it through /api/dice.');const db=repository.db;const {revision:expectedRevision,...identity}=command;void expectedRevision;const fingerprint=createHash('sha256').update(JSON.stringify(identity)).digest('hex');db.exec('BEGIN IMMEDIATE');try{
  const record=repository.get(command.campaignId);if(!record)throw new JourneyInputError('Campaign not found');const previous=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(command.campaignId,command.actionId) as {fingerprint:string}|undefined;
  if(previous){if(previous.fingerprint!==fingerprint)throw new JourneyInputError('Action ID was already used with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  if(record.session.journey?.log.some(event=>event.id.startsWith(command.actionId+':')))throw new JourneyInputError('Action ID is already recorded in imported journey history');
  if(command.type==='quarter-chat-request'){const f=activeChatForm(record.session);if(f&&f.date===record.session.campaign.date&&f.quarter===record.session.campaign.quarter&&f.from===record.session.campaign.hex){db.exec('COMMIT');return {record,replayed:true}}}
  if(record.session.chatJourney&&!command.type.startsWith('quarter-chat-')&&!['quarter-settings','quarter-correction','weather'].includes(command.type))throw new JourneyInputError('Use the chat activity form; legacy journey controls are disabled');
  if(record.revision!==command.revision)throw new ConflictError(command.type.startsWith('quarter-chat-')?'The quarter-day activity or campaign changed since this request was prepared. Refresh its current status before continuing.':'Campaign changed. Reload the saved campaign before submitting this journey action.');
  if(command.type==='quarter-chat-complete'){const urgent=readConsequences(repository,record.id).find(v=>!['resolved','superseded'].includes(v.status)&&['life','mandatory'].includes(v.urgency));if(urgent)throw new JourneyInputError('Resolve the required consequence before completing this quarter-day: '+urgent.nextProcedure);}
  if(command.type==='quarter-chat-complete'&&activeCombat(repository,record.id))throw new JourneyInputError('Resolve the active encounter before completing this quarter-day.');
  if(command.type==='quarter-chat-complete'){const entry=record.session.dayTracker?.find(e=>e.id===command.entryId);for(const a of entry?.assignments??[])if(a.rollId){const roll=record.session.dice?.find(r=>r.id===a.rollId&&r.characterId===a.characterId);if(!roll||a.outcome!==(roll.result.successes>0?'Success':'Fail'))throw new JourneyInputError('A linked roll changed after submission. Review the recorded outcome before completion; no movement or time was applied.');}for(const a of entry?.assignments??[])if(entry?.traveling||a.activity==='Hike')enforceCarrying(repository,record.id,a.characterId,'Hike',command.actionId);}
  const map=new SqliteMapStore(repository),edges=map.edges();const geo={lookup:(hex:string)=>map.lookupForCampaign(record.id,hex),adjacent:(from:string,to:string)=>isAdjacent(edges,from,to),calibrated:map.publicMap(record.id).calibration?.verified??false};let session;let restRecovery:{characterId:string;attribute:string;before:number;after:number}[]|undefined;try{const base=structuredClone(record.session);if(command.type==='quarter-chat-complete'&&command.resolution.restConfirmed){const receipt=applyReviewedRest(repository,record.id,base,command.entryId);restRecovery=receipt.review.flatMap(r=>r.changes.map(c=>({characterId:r.characterId,...c})));}session=applyJourneyCommand(base,command,geo,new Date().toISOString())}catch(e){throw new JourneyInputError((e as Error).message)}
  if(restRecovery&&command.type==='quarter-chat-complete'){const completed=session.chatJourney!.updates.find(u=>u.id===command.actionId)!;completed.restRecovery=restRecovery;const journal=session.journal.find(j=>j.id===command.actionId+':quarter');if(journal)journal.text+='\n'+restRecovery.map(c=>`${session.characters.find(ch=>ch.id===c.characterId)?.name}: ${c.attribute} ${c.before} → ${c.after}`).join('; ');}
  if(command.type.startsWith('quarter-')){const journey=journeyFor(session);session.journey=journey;if(!journey.log.some(e=>e.id.startsWith(command.actionId+':')))journey.log.push({id:command.actionId+':audit',kind:'activity',summary:command.type,before:{date:record.session.campaign.date,quarter:record.session.campaign.quarter,hex:record.session.campaign.hex},after:{date:session.campaign.date,quarter:session.campaign.quarter,hex:session.campaign.hex},at:new Date().toISOString()})}
  if(command.type==='quarter-chat-complete')reconcileCombatSheets(repository,record.id,session);
  const updated=repository.update(record.id,record.revision,session,{workflowValidated:true,timeEventId:command.actionId,elapsedQuarters:command.type==='quarter-chat-complete'||command.type==='quarter-advance'||command.type==='quarter-submit'?1:command.type==='activity'?command.quarterDays:command.type==='advance'?1:command.type==='complete'?Math.max(0,(record.session.journey?.activePlan?.cost??0)-(record.session.journey?.activePlan?.spent??0)):undefined});db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,command.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}
