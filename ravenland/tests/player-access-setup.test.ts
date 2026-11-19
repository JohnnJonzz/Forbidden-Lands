import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initialSession} from '../src/lib/mock';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {inspectPlayerAccessSetup} from '../src/server/player-access-setup';

test('operator inspection returns only actual campaign/character IDs without secrets or writes',()=>{
 const folder=mkdtempSync(join(tmpdir(),'raven-player-access-')),database=join(folder,'existing.sqlite'),repo=new SqliteCampaignRepository(database),old=process.env.RAVENLAND_PLAYER_GRANTS;
 try{
  process.env.RAVENLAND_PLAYER_GRANTS='[]';const session=structuredClone(initialSession);session.characters[0].sheet={'dark-secret':'PRIVATE_SHEET_VALUE'};const record=repo.create(session);repo.db.prepare('INSERT INTO campaign_secrets VALUES (?,?)').run(record.id,JSON.stringify({hidden:'GM_ONLY_VALUE'}));const snapshot=repo.get(record.id),data=readFileSync(database),changes=repo.db.prepare('SELECT total_changes() AS n').get()!.n;
  const result=inspectPlayerAccessSetup(database);assert.equal(result.campaignId,record.id);assert.deepEqual(result.characters,record.session.characters.map(c=>({id:c.id,name:c.name})));assert.equal(result.playerAccessConfigured,false);assert.ok(!JSON.stringify(result).includes('PRIVATE_SHEET_VALUE'));assert.ok(!JSON.stringify(result).includes('GM_ONLY_VALUE'));assert.deepEqual(repo.get(record.id),snapshot);assert.equal(repo.db.prepare('SELECT total_changes() AS n').get()!.n,changes);assert.deepEqual(readFileSync(database),data);
  assert.throws(()=>inspectPlayerAccessSetup(database,randomUUID()),/does not exist/);repo.db.prepare("DELETE FROM application_meta WHERE key='active_campaign'").run();assert.throws(()=>inspectPlayerAccessSetup(database),/Choose an existing campaign/);assert.equal(inspectPlayerAccessSetup(database,record.id).campaignId,record.id);
 }finally{repo.close();if(old===undefined)delete process.env.RAVENLAND_PLAYER_GRANTS;else process.env.RAVENLAND_PLAYER_GRANTS=old;rmSync(folder,{recursive:true,force:true})}
});
test('operator inspection cannot create a missing database or invent a campaign',()=>{
 const folder=mkdtempSync(join(tmpdir(),'raven-no-player-db-')),database=join(folder,'missing.sqlite');try{assert.throws(()=>inspectPlayerAccessSetup(database),/No existing campaign database/);assert.equal(existsSync(database),false)}finally{rmSync(folder,{recursive:true,force:true})}
});
