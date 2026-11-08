import {loadEnvConfig} from '@next/env';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {z} from 'zod';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {FileSourcebookStorage} from '../src/server/sourcebooks/storage';
import {diagnoseHandbook} from '../src/server/sourcebooks/diagnose';
import {sourceNameMatches} from '../src/lib/rules/source-request';
loadEnvConfig(process.cwd());
async function main(){
 const args=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
 const database=args.get('--database')??process.env.RAVENLAND_DB_PATH??join(process.cwd(),'data/ravenland.sqlite');if(!existsSync(database))throw Error('Existing campaign database required; no file was created.');
 const storage=new FileSourcebookStorage(args.get('--sourcebook-dir')??process.env.RAVENLAND_SOURCEBOOK_DIR??join(dirname(database),'sourcebooks')),repo=new SqliteCampaignRepository(database,{readOnly:true});
 try{
  if(!repo.db.prepare("SELECT 1 FROM schema_migrations WHERE version='014_rules_metadata.sql'").get())throw Error('Database schema is older than this application; no migration attempted.');
  repo.db.exec('BEGIN');
  const active=repo.db.prepare("SELECT value FROM application_meta WHERE key='active_campaign'").get(),campaign=z.string().uuid().parse(args.get('--campaign')??active?.value);
  let source=args.get('--source');
  if(!source){const matches=repo.db.prepare("SELECT id,title,original_filename FROM source_documents WHERE campaign_id=? AND visibility='Public Rules' AND category IN ('Rules','Bestiary','House Rules')").all(campaign).filter(row=>sourceNameMatches(row.title as string,row.original_filename as string,"Player's Handbook"));if(matches.length!==1)throw Error('Select an unambiguous authorized source with --source.');source=matches[0].id as string}
  console.log(JSON.stringify(await diagnoseHandbook(repo,campaign,z.string().uuid().parse(source),storage),null,2));repo.db.exec('ROLLBACK');
 }finally{repo.close()}
}
main().catch(()=>{console.error('Handbook audit could not run. Check the existing database/current schema, active campaign, an unambiguous authorized handbook (or explicit --campaign/--source UUIDs), and private storage directory. No migration or indexing was attempted.');process.exitCode=1});
