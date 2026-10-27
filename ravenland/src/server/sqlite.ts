import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialSession } from '../lib/mock';
import { sessionSchema } from '../lib/validation';
import type { CampaignRecord, Session } from '../lib/types';
import { ConflictError, type CampaignRepository } from './repository';
type Row={id:string;revision:number;public_state:string;created_at:string;updated_at:string};
export class SqliteCampaignRepository implements CampaignRepository {
 readonly db:DatabaseSync;
 constructor(filename:string){
  if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
  this.db=new DatabaseSync(filename);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY);');
  const dir=join(process.cwd(),'src/server/migrations');
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
   this.db.exec('BEGIN IMMEDIATE');try{if(!this.db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(file)){this.db.exec(readFileSync(join(dir,file),'utf8'));this.db.prepare('INSERT INTO schema_migrations VALUES (?)').run(file)}this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}
  }
 }
 private decode(row:Row):CampaignRecord{return {id:row.id,revision:row.revision,session:sessionSchema.parse(JSON.parse(row.public_state)),createdAt:row.created_at,updatedAt:row.updated_at}}
 list(){return (this.db.prepare('SELECT * FROM campaigns ORDER BY updated_at DESC,id').all() as Row[]).map(row=>({id:row.id,name:JSON.parse(row.public_state).campaign.name as string,updatedAt:row.updated_at}))}
 get(id:string){const row=this.db.prepare('SELECT * FROM campaigns WHERE id=?').get(id) as Row|undefined;return row?this.decode(row):null}
 select(id:string){const record=this.get(id);if(!record)throw new Error('Campaign not found');this.db.prepare("INSERT INTO application_meta(key,value) VALUES ('active_campaign',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(id);return record}
 current(){const active=this.db.prepare("SELECT value FROM application_meta WHERE key='active_campaign'").get() as {value:string}|undefined;const current=active?this.get(active.value):null;if(current)return current;const existing=this.list()[0];return existing?this.select(existing.id):this.create(initialSession)}
 create(session:Session){const data=sessionSchema.parse(session);const id=randomUUID(),now=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO campaigns VALUES (?,1,?,?,?)').run(id,JSON.stringify(data),now,now);for(const character of data.characters){if(character.portraitId)this.db.prepare('INSERT OR IGNORE INTO campaign_images(campaign_id,image_id,name,category) SELECT ?,image_id,name,category FROM campaign_images WHERE image_id=? LIMIT 1').run(id,character.portraitId)}const record=this.select(id);this.db.exec('COMMIT');return record}catch(e){this.db.exec('ROLLBACK');throw e}}
 update(id:string,revision:number,session:Session){const data=sessionSchema.parse(session);const result=this.db.prepare('UPDATE campaigns SET public_state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(JSON.stringify(data),new Date().toISOString(),id,revision);if(!result.changes)throw new ConflictError('This campaign changed in another tab. Export your local changes, then reload the campaign.');return this.get(id)!}
 close(){this.db.close()}
}
let repository:SqliteCampaignRepository|undefined;
export function getLocalRepository():SqliteCampaignRepository {repository??=new SqliteCampaignRepository(process.env.RAVENLAND_DB_PATH||join(process.cwd(),'data/ravenland.sqlite'));return repository}

export function getRepository():CampaignRepository{return getLocalRepository()}
