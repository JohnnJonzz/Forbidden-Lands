import {createHash,randomUUID} from 'node:crypto';
import {locationCommandSchema,locationInputSchema,sameLocation} from '../../lib/map/locations';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import {ConflictError} from '../repository';
import {SqliteMapStore,MapInputError} from './store';
import {requireMapAccess} from './exploration';
// Future AI adapter returns this proposal to a player/GM; it cannot commit state.
// The confirmed command below is the application-owned recording boundary.
export function proposeLocation(campaignId:string,raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 requireMapAccess(campaignId,'player',repo);const location=locationInputSchema.parse(raw);if(!new SqliteMapStore(repo).lookup(location.hex))throw new MapInputError('Unknown canonical hex ID');return {campaignId,requiresConfirmation:true as const,location};
}
export function executeLocation(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 const command=locationCommandSchema.parse(raw),db=repo.db,fingerprint=createHash('sha256').update(JSON.stringify(command)).digest('hex');db.exec('BEGIN IMMEDIATE');try{
 const record=requireMapAccess(command.campaignId,'player',repo),prior=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(record.id,command.actionId) as {fingerprint:string}|undefined;
 if(prior){if(prior.fingerprint!==fingerprint)throw new MapInputError('Action ID reused with different discovery');db.exec('COMMIT');return {record,replayed:true}}
 const input=proposeLocation(record.id,command.location,repo).location,locations=[...(record.session.locations??[])];
 const existing=command.id?locations.find(l=>l.id===command.id):locations.find(l=>sameLocation(l,input));
 if(command.id&&!existing)throw new MapInputError('Location not found');
 if(existing&&(!command.id||command.expectedUpdatedAt!==existing.updatedAt))throw new ConflictError('This location already exists or changed. Open its current record to edit it.');
 if(locations.some(l=>l.id!==existing?.id&&sameLocation(l,input)))throw new ConflictError('A location with this name and hex or canonical ID already exists');
 const {journalNarrative,...fields}=input,now=new Date().toISOString(),id=existing?.id??randomUUID(),journalEntryId=existing?.journalEntryId??randomUUID();
 const location={...fields,id,discoveredOn:existing?.discoveredOn??record.session.campaign.date,quarter:existing?.quarter??record.session.campaign.quarter,journalEntryId,updatedAt:existing&&now<=existing.updatedAt?new Date(Date.parse(existing.updatedAt)+1).toISOString():now};
 const journal=[...record.session.journal];if(!existing?.journalEntryId)journal.push({id:journalEntryId,title:input.name,text:journalNarrative?.trim()||`${input.status} ${input.type} · ${input.hex}\n${location.discoveredOn} · ${location.quarter}${input.notes?'\n\n'+input.notes:''}`});
 const updated=repo.update(record.id,record.revision,{...record.session,locations:existing?locations.map(l=>l.id===id?location:l):[...locations,location],journal},{locationsValidated:true});
 db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,command.actionId,fingerprint,now);db.exec('COMMIT');return {record:updated,location,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}
