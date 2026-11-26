import {createHash} from 'node:crypto';
import {explorationCommandSchema,explorationFor,explorationState} from '../../lib/map/exploration';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import {SqliteMapStore,MapInputError} from './store';
// Auth boundary for future multiplayer: resolve principal/campaign membership for
// player reads and require the GM role for full-map reads and exploration edits.
// Local development deliberately has no Player 1 or hardcoded identity requirement.
export function requireMapAccess(campaignId:string,view:'player'|'gm',repo:SqliteCampaignRepository){void view;const record=repo.get(campaignId);if(!record)throw new MapInputError('Campaign not found');return record}
export function getExplorationState(campaignId:string,repo:SqliteCampaignRepository=getLocalRepository()){const record=requireMapAccess(campaignId,'gm',repo);return explorationState(record.session,new SqliteMapStore(repo).hexes(),record.session.discoveries,true)}
export function executeExploration(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 const c=explorationCommandSchema.parse(raw),fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex'),db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const record=requireMapAccess(c.campaignId,'gm',repo),prior=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(c.campaignId,c.actionId) as {fingerprint:string}|undefined;
  if(prior){if(prior.fingerprint!==fingerprint)throw new MapInputError('Action ID was reused with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  const hexes=new SqliteMapStore(repo).hexes(),canonical=new Set(hexes.map(h=>h.coordinate)),state=explorationFor(record.session,hexes),known=new Set(state.explored);
  if(c.type==='preferences'){if(c.enabled!==undefined)state.enabled=c.enabled;if(c.opacity!==undefined)state.opacity=c.opacity}
  else if(c.type==='reset'){known.clear();if(canonical.has(record.session.campaign.hex))known.add(record.session.campaign.hex)}
  else{for(const id of c.hexes){if(!canonical.has(id))throw new MapInputError('Unknown canonical hex ID: '+id);if(c.type==='hide'&&id===record.session.campaign.hex)throw new MapInputError('The current party hex is always visible and cannot be hidden')}for(const id of c.hexes)c.type==='reveal'?known.add(id):known.delete(id)}
  state.explored=[...known].sort();const updated=repo.update(record.id,record.revision,{...record.session,exploration:state},{explorationValidated:true});db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,c.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}
