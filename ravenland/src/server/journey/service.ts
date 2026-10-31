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
 const command=commandSchema.parse(raw);if(command.type==='quarter-roll')throw new JourneyInputError('Create a pending dice result and submit it through /api/dice.');const db=repository.db;const {revision:expectedRevision,...identity}=command;void expectedRevision;const fingerprint=createHash('sha256').update(JSON.stringify(identity)).digest('hex');db.exec('BEGIN IMMEDIATE');try{
  const record=repository.get(command.campaignId);if(!record)throw new JourneyInputError('Campaign not found');const previous=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(command.campaignId,command.actionId) as {fingerprint:string}|undefined;
  if(previous){if(previous.fingerprint!==fingerprint)throw new JourneyInputError('Action ID was already used with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  if(record.session.journey?.log.some(event=>event.id.startsWith(command.actionId+':')))throw new JourneyInputError('Action ID is already recorded in imported journey history');
  if(command.type==='quarter-chat-request'){const f=activeChatForm(record.session);if(f&&f.date===record.session.campaign.date&&f.quarter===record.session.campaign.quarter&&f.from===record.session.campaign.hex){db.exec('COMMIT');return {record,replayed:true}}}
  if(record.session.chatJourney&&!command.type.startsWith('quarter-chat-')&&!['quarter-settings','quarter-correction','weather'].includes(command.type))throw new JourneyInputError('Use the chat activity form; legacy journey controls are disabled');
  if(record.revision!==command.revision)throw new ConflictError('Campaign changed. Reload the saved campaign before submitting this journey action.');
  const map=new SqliteMapStore(repository),edges=map.edges();const geo={lookup:(hex:string)=>map.lookup(hex),adjacent:(from:string,to:string)=>isAdjacent(edges,from,to),calibrated:map.publicMap(record.id).calibration?.verified??false};let session;try{session=applyJourneyCommand(record.session,command,geo,new Date().toISOString())}catch(e){throw new JourneyInputError((e as Error).message)}
  if(command.type.startsWith('quarter-')){const journey=journeyFor(session);session.journey=journey;if(!journey.log.some(e=>e.id.startsWith(command.actionId+':')))journey.log.push({id:command.actionId+':audit',kind:'activity',summary:command.type,before:{date:record.session.campaign.date,quarter:record.session.campaign.quarter,hex:record.session.campaign.hex},after:{date:session.campaign.date,quarter:session.campaign.quarter,hex:session.campaign.hex},at:new Date().toISOString()})}
  const updated=repository.update(record.id,record.revision,session,{workflowValidated:true});db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,command.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}
