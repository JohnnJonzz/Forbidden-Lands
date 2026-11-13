import {z} from 'zod';
import {characterSheetSchema,applySheet,sheetFor} from '../lib/character-sheet';
import {getLocalRepository,type SqliteCampaignRepository} from './sqlite';
const command=z.object({campaignId:z.string().uuid(),characterId:z.string().min(1).max(100),before:characterSheetSchema,sheet:characterSheetSchema}).strict();
export function saveCharacter(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 const c=command.parse(raw),db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const record=repo.get(c.campaignId);if(!record)throw new Error('Campaign not found');const i=record.session.characters.findIndex(ch=>ch.id===c.characterId);if(i<0)throw new Error('Character not found');
  // Future authenticated ownership policy belongs at this same server boundary.
  const current=sheetFor(record.session.characters[i]),merged={...current} as Record<string,unknown>,before=c.before as Record<string,unknown>,next=c.sheet as Record<string,unknown>;
  for(const key of new Set([...Object.keys(before),...Object.keys(next)])){
   if(JSON.stringify(before[key])===JSON.stringify(next[key]))continue;
   if(JSON.stringify(merged[key])!==JSON.stringify(before[key])&&JSON.stringify(merged[key])!==JSON.stringify(next[key]))throw new Error('This character field changed in another window. Reload the saved sheet before editing it again.');
   if(next[key]===undefined)delete merged[key];else merged[key]=next[key];
  }
  record.session.characters[i]=applySheet(record.session.characters[i],characterSheetSchema.parse(merged));const updated=repo.update(record.id,record.revision,record.session);db.exec('COMMIT');return updated;
 }catch(e){db.exec('ROLLBACK');throw e}
}
