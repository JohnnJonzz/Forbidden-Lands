import {createHash} from 'node:crypto';
import {applyJourneyCommand} from '../../lib/journey/engine';
import {commandSchema} from '../../lib/journey/schema';
import {isAdjacent} from '../../lib/map/geometry';
import {ConflictError} from '../repository';
import {getLocalRepository,SqliteCampaignRepository} from '../sqlite';
import {SqliteMapStore} from '../map/store';
export class JourneyInputError extends Error {}
export function executeJourney(raw:unknown,repository:SqliteCampaignRepository=getLocalRepository()){
 const command=commandSchema.parse(raw),db=repository.db;const {revision:expectedRevision,...identity}=command;void expectedRevision;const fingerprint=createHash('sha256').update(JSON.stringify(identity)).digest('hex');db.exec('BEGIN IMMEDIATE');try{
  const record=repository.get(command.campaignId);if(!record)throw new JourneyInputError('Campaign not found');const previous=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(command.campaignId,command.actionId) as {fingerprint:string}|undefined;
  if(previous){if(previous.fingerprint!==fingerprint)throw new JourneyInputError('Action ID was already used with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  if(record.session.journey?.log.some(event=>event.id.startsWith(command.actionId+':')))throw new JourneyInputError('Action ID is already recorded in imported journey history');
  if(record.revision!==command.revision)throw new ConflictError('Campaign changed. Reload the saved campaign before submitting this journey action.');
  const map=new SqliteMapStore(repository),edges=map.edges();let session;try{session=applyJourneyCommand(record.session,command,{lookup:hex=>map.lookup(hex),adjacent:(from,to)=>isAdjacent(edges,from,to),calibrated:map.publicMap(record.id).calibration?.verified??false},new Date().toISOString())}catch(e){throw new JourneyInputError((e as Error).message)}
  const updated=repository.update(record.id,record.revision,session);db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,command.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}
