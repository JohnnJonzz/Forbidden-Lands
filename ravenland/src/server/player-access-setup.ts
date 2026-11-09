import {existsSync} from 'node:fs';
import {z} from 'zod';
import {SqliteCampaignRepository} from './sqlite';
import {playerAccessConfigured} from './character-access';

// Operator-only diagnostic: never call current(), create(), select() or migrations.
export function inspectPlayerAccessSetup(database:string,campaignId?:string){
 if(!existsSync(database))throw Error('No existing campaign database found. Use the database used by your running app with --database. No file or campaign was created.');
 const repo=new SqliteCampaignRepository(database,{readOnly:true});
 try{
  const active=repo.db.prepare("SELECT value FROM application_meta WHERE key='active_campaign'").get();
  const id=z.string().uuid().safeParse(campaignId??active?.value);
  if(!id.success)throw Error('Choose an existing campaign with --campaign; no active campaign was selected or created.');
  const record=repo.get(id.data);if(!record)throw Error('The requested campaign does not exist in this database. No campaign was created.');
  return {campaignId:record.id,campaignName:record.session.campaign.name,characters:record.session.characters.map(c=>({id:c.id,name:c.name})),playerAccessConfigured:playerAccessConfigured()};
 }finally{repo.close()}
}
