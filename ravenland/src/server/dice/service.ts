import {createHash,randomInt} from 'node:crypto';
import {diceCommandSchema} from '../../lib/dice/schema';
import {applyDiceCommand} from '../../lib/dice/engine';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
export function executeDice(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 const c=diceCommandSchema.parse(raw),db=repo.db,fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex');
 db.exec('BEGIN IMMEDIATE');try{
  const record=repo.get(c.campaignId);if(!record)throw new Error('Campaign not found');
  // Authorization boundary: resolve authenticated principal and campaign/character ownership here when accounts are introduced.
  const previous=db.prepare('SELECT fingerprint FROM journey_actions WHERE campaign_id=? AND action_id=?').get(c.campaignId,c.actionId) as {fingerprint:string}|undefined;
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Action ID reused with different parameters');db.exec('COMMIT');return {record,replayed:true}}
  const session=applyDiceCommand(record.session,c,{lookup:()=>null,adjacent:()=>false,calibrated:false},new Date().toISOString(),sides=>randomInt(1,sides+1));
  const updated=repo.update(record.id,record.revision,session);db.prepare('INSERT INTO journey_actions VALUES (?,?,?,?)').run(record.id,c.actionId,fingerprint,new Date().toISOString());db.exec('COMMIT');return {record:updated,replayed:false};
 }catch(e){db.exec('ROLLBACK');throw e}
}

// Future narration adapters consume this one immutable public packet per submitted group.
// Staging, pushing and readiness never enqueue narration or call an AI service.
export function getQuarterDayNarration(campaignId:string,batchId:string,repo:SqliteCampaignRepository=getLocalRepository()){const batch=repo.get(campaignId)?.session.diceGroups?.batches.find(b=>b.id===batchId);if(!batch)throw new Error('Submitted batch not found');return structuredClone(batch)}
