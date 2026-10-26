import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {initialSession} from '../src/lib/mock';
import {backupSchema,sessionSchema} from '../src/lib/validation';
import {ConflictError} from '../src/server/repository';
test('migrate, save every public field, close/reopen, select multiple campaigns, preserve secrets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-db-'));const file=join(dir,'test.sqlite');let repo=new SqliteCampaignRepository(file);
 try{const first=repo.current();assert.equal(repo.list().length,1);
 const session=structuredClone(first.session);session.campaign={...session.campaign,name:'Persistent road',description:'Campaign description',hex:'J22',location:'Old stone bridge',date:'A new day',quarter:'Night',weather:'Snow',terrain:'Hills',objective:'Cross the river',settings:{tone:'Heroic',houseRules:'No secret keys'}};session.characters[0].name='Changed player';session.messages.push({id:'persist',role:'player',author:'Changed player',text:'I cross the bridge'});session.journal.push({id:'persist',title:'Bridge',text:'It holds'});
 const saved=repo.update(first.id,first.revision,session);assert.equal(saved.revision,2);assert.throws(()=>repo.update(first.id,first.revision,initialSession),ConflictError);
 repo.db.prepare('INSERT INTO campaign_secrets VALUES (?,?)').run(first.id,'{"private":"hidden"}');
 const second=repo.create(initialSession);assert.notEqual(second.id,first.id);repo.select(first.id);repo.close();repo=new SqliteCampaignRepository(file);
 assert.deepEqual(repo.current().session,session);assert.equal(repo.list().length,2);assert.equal(repo.db.prepare('SELECT * FROM schema_migrations').all().length,3);
 const backup=backupSchema.parse({format:'ravenland-campaign',version:1,session:repo.current().session});assert.ok(!JSON.stringify(backup).includes('hidden'));const imported=repo.create(backup.session);assert.notEqual(imported.id,first.id);assert.deepEqual(repo.get(first.id)?.session,session);assert.equal(repo.list().length,3);
 }finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
test('backup validation rejects secret fields, credentials, malformed parties and unsupported versions',()=>{
 const session=structuredClone(initialSession);assert.throws(()=>sessionSchema.parse({...session,apiKey:'secret'}));assert.throws(()=>sessionSchema.parse({...session,gmSecrets:{secret:'hidden'}}));assert.throws(()=>sessionSchema.parse({...session,characters:[]}));assert.throws(()=>sessionSchema.parse({...session,characters:[session.characters[0],session.characters[0]]}));assert.throws(()=>backupSchema.parse({format:'ravenland-campaign',version:99,session}));assert.throws(()=>sessionSchema.parse({...session,campaign:{...session.campaign,quarter:'Dawn'}}));
});
