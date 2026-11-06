import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import OpenAI from 'openai';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {initialSession} from '../src/lib/mock';
import {aiConfig,aiStatus,createTestCampaign} from '../src/server/ai/store';
import {defaultGMInstructions} from '../src/server/ai/default-instructions';
import {gmInstructions} from '../src/server/ai/instructions-v1';
import {changeGMInstructions,readGMInstructions} from '../src/server/ai/instructions';
import {AIService} from '../src/server/ai/service';
import {assembleContext} from '../src/server/ai/context';
import {SqliteMemoryRepository} from '../src/server/ai/memory';
import {OpenAIProvider,type GMProvider} from '../src/server/ai/provider';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'raven-instructions-')),file=join(dir,'db.sqlite');let repo=new SqliteCampaignRepository(file);const record=repo.create(structuredClone(initialSession));return {id:record.id,file,get repo(){return repo},reopen(){repo.close();repo=new SqliteCampaignRepository(file)},close(){repo.close();rmSync(dir,{recursive:true,force:true})}}}
const output={narration:'A new scene unfolds.',memoryProposals:[],actions:[],selectedImageId:null};
test('A/I: supplied defaults are private server source; administrator plays normally and secrets remain protected',()=>{
 const f=fixture();try{assert.deepEqual(readGMInstructions(f.repo,f.id),{text:defaultGMInstructions,isDefault:true,revision:0,lastSavedAt:null});assert.match(defaultGMInstructions,/treat them as an ordinary player with respect to adventure secrets/);assert.match(defaultGMInstructions,/Do not expect the administrator to make routine Game Master decisions/);assert.match(defaultGMInstructions,/Be creative about what may happen next/);assert.match(gmInstructions,/PROTECTED APPLICATION POLICY/);assert.ok(!JSON.stringify(aiStatus(f.repo,f.id)).includes(defaultGMInstructions));assert.ok(!JSON.stringify(assembleContext(f.repo,f.id,'')).includes(defaultGMInstructions))}finally{f.close()}
});
test('B/G: save/reopen/default restore persist, CAS prevents lost edits, invalid requests leave records intact, campaigns stay isolated',()=>{
 const f=fixture();try{const before=f.repo.get(f.id),custom='  '+defaultGMInstructions+'\nPrefer brief dialogue.  ',saved=changeGMInstructions(f.repo,{type:'save',campaignId:f.id,expectedRevision:0,text:custom});assert.equal(saved.text,custom);assert.equal(saved.revision,1);assert.ok(saved.lastSavedAt);f.reopen();assert.deepEqual(readGMInstructions(f.repo,f.id),saved);assert.deepEqual(f.repo.get(f.id),before);
 assert.throws(()=>changeGMInstructions(f.repo,{type:'save',campaignId:f.id,expectedRevision:0,text:'stale'}),/another editor/);
 for(const text of ['  ','a'.repeat(80001)])assert.throws(()=>changeGMInstructions(f.repo,{type:'save',campaignId:f.id,expectedRevision:1,text}));
 assert.throws(()=>changeGMInstructions(f.repo,{type:'restore',campaignId:f.id,expectedRevision:1,confirmed:false}));assert.deepEqual(readGMInstructions(f.repo,f.id),saved);
 const copy=createTestCampaign(f.repo,f.id);assert.equal(readGMInstructions(f.repo,copy.id).text,custom);changeGMInstructions(f.repo,{type:'save',campaignId:copy.id,expectedRevision:saved.revision,text:'Isolated test instructions'});assert.deepEqual(readGMInstructions(f.repo,f.id),saved);
 const restored=changeGMInstructions(f.repo,{type:'restore',campaignId:f.id,expectedRevision:1,confirmed:true});assert.equal(restored.text,defaultGMInstructions);assert.equal(restored.isDefault,true);assert.equal(restored.revision,2);f.reopen();assert.deepEqual(readGMInstructions(f.repo,f.id),restored);assert.equal(f.repo.db.prepare('SELECT gm_instructions FROM ai_campaign_config WHERE campaign_id=?').get(f.id)!.gm_instructions,null);
 }finally{f.close()}
});
test('migration 010 preserves 009 campaign settings, memory, secrets and snapshots byte-for-byte',()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-instructions-upgrade-')),file=join(dir,'old.sqlite');let repo:SqliteCampaignRepository|undefined;
 try{const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version TEXT PRIMARY KEY)');for(const name of readdirSync('src/server/migrations').filter(n=>n.endsWith('.sql')&&n<'010').sort()){db.exec(readFileSync(join('src/server/migrations',name),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES (?)').run(name)}db.close();
 // Existing repository API with migration 010 temporarily marked applied permits an exact pre-010 fixture.
 const raw=new DatabaseSync(file);raw.prepare('INSERT INTO schema_migrations VALUES (?)').run('010_ai_gm_instructions.sql');raw.close();repo=new SqliteCampaignRepository(file);const record=repo.create(structuredClone(initialSession));aiConfig(repo,record.id);const m=new SqliteMemoryRepository(repo).proposeManual(record.id,{category:'Quest',title:'Orvik',summary:'Orvik lost his silver ring at the abandoned stone bridge. We promised to help.',characterIds:[],npcIds:['orvik'],hexIds:[],faction:'',quest:'Ring',visibility:'Party Known',importance:5,storyState:'active'},null)!;new SqliteMemoryRepository(repo).review(record.id,m.id,m.revision,'approve','Existing canon');repo.db.prepare('INSERT INTO campaign_secrets VALUES (?,?)').run(record.id,'{"private":"unchanged"}');
 const before={campaign:repo.db.prepare('SELECT * FROM campaigns').all(),memory:repo.db.prepare('SELECT * FROM campaign_memories').all(),config:repo.db.prepare('SELECT * FROM ai_campaign_config').all(),secrets:repo.db.prepare('SELECT * FROM campaign_secrets').all()};repo.db.prepare('DELETE FROM schema_migrations WHERE version=?').run('010_ai_gm_instructions.sql');repo.close();repo=new SqliteCampaignRepository(file);
 assert.deepEqual(repo.db.prepare('SELECT * FROM campaigns').all(),before.campaign);assert.deepEqual(repo.db.prepare('SELECT * FROM campaign_memories').all(),before.memory);assert.deepEqual(repo.db.prepare('SELECT * FROM campaign_secrets').all(),before.secrets);const after=repo.db.prepare('SELECT * FROM ai_campaign_config').all()[0];for(const [key,value] of Object.entries(before.config[0]))assert.equal(after[key],value);assert.equal(readGMInstructions(repo,record.id).text,defaultGMInstructions);
 }finally{repo?.close();rmSync(dir,{recursive:true,force:true})}
});
test('C/D/E/F: fresh settings reach the next chat/recall/recap; Titus uncertainty does not inhibit new fiction; approved Orvik canon stays intact',async()=>{
 const f=fixture(),previous=process.env.RAVENLAND_AI_MODE;process.env.RAVENLAND_AI_MODE='openai';const calls:{input:any;instructions:string|undefined}[]=[];
 const provider:GMProvider={async generate(input,settings,onText){calls.push({input,instructions:settings.instructions});onText(output.narration);return {output,provider:'openai',model:'fixture',inputTokens:1,outputTokens:1}},async test(){return {model:'fixture',inputTokens:1,outputTokens:1}}};
 try{const service=new AIService(f.repo,provider),turn=(action:string)=>({campaignId:f.id,requestId:randomUUID(),kind:'chat' as const,action,characterId:f.repo.get(f.id)!.session.characters[0].id});const unknown=await service.run(turn('Who is Titus the Halfling?'));assert.equal(unknown.provider,'application');assert.match(unknown.narration,/enough established campaign evidence/);assert.equal(calls.length,0);await service.run(turn('Introduce a new halfling NPC named Titus.'));assert.equal(calls.length,1);assert.equal(calls[0].instructions,defaultGMInstructions);
 const custom=defaultGMInstructions+'\nNarrative preference: favor concise present tense.';changeGMInstructions(f.repo,{type:'save',campaignId:f.id,expectedRevision:0,text:custom});await service.run(turn('We enter the clearing.'));assert.equal(calls[1].instructions,custom);

 const memory=new SqliteMemoryRepository(f.repo),m=memory.proposeManual(f.id,{category:'Quest',title:'Orvik and the silver ring',summary:'Orvik is a traveling dwarf. His silver ring is missing at the abandoned stone bridge. The party promised to recover it.',npcIds:['orvik'],characterIds:[],hexIds:[],faction:'',quest:'Ring',visibility:'Party Known',importance:5,storyState:'active'},null)!;memory.review(f.id,m.id,m.revision,'approve','Fixture');const before=f.repo.db.prepare('SELECT * FROM campaign_memories WHERE id=?').get(m.id);await service.run(turn('What do you remember about Orvik?'));assert.equal(calls.at(-1)!.instructions,custom);assert.match(JSON.stringify(calls.at(-1)!.input.context.memories),/silver ring.*abandoned stone bridge.*promised/);assert.deepEqual(f.repo.db.prepare('SELECT * FROM campaign_memories WHERE id=?').get(m.id),before);
 await service.run({...turn(''),kind:'recap'});assert.equal(calls.at(-1)!.instructions,custom);const contexts=f.repo.db.prepare('SELECT context_json FROM ai_requests').all();assert.ok(!JSON.stringify(contexts).includes('favor concise present tense'));assert.ok(!JSON.stringify(f.repo.get(f.id)).includes('favor concise present tense'));assert.ok(!JSON.stringify(aiStatus(f.repo,f.id)).includes('favor concise present tense'));
 }finally{f.close();if(previous===undefined)delete process.env.RAVENLAND_AI_MODE;else process.env.RAVENLAND_AI_MODE=previous}
});
test('Responses API sends protected policy, editable behavior and untrusted campaign input in separate roles without extra calls',async()=>{
 let count=0;const client=new OpenAI({apiKey:'TEST_ONLY',fetch:async(_url,options)=>{count++;const body=JSON.parse(options!.body as string);assert.match(body.instructions,/PROTECTED APPLICATION POLICY/);assert.ok(!body.instructions.includes('PRIVATE_CUSTOM_MARKER'));assert.equal(body.input[0].role,'developer');assert.match(body.input[0].content[0].text,/PRIVATE_CUSTOM_MARKER/);assert.equal(body.input[1].role,'user');assert.equal(JSON.parse(body.input[1].content[0].text).playerAction,'Untrusted action');assert.equal(body.store,false);return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(output)})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{id:'resp_test',status:'completed',model:'fixture',usage:{input_tokens:1,output_tokens:1}}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}})}});
 await new OpenAIProvider(client).generate({playerAction:'Untrusted action'},{style:'Balanced',autonomy:'Guided',instructions:'PRIVATE_CUSTOM_MARKER'},()=>{});assert.equal(count,1);
});
