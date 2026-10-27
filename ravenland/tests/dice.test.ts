import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialSession} from '../src/lib/mock';
import {sheetFor} from '../src/lib/character-sheet';
import {applyDiceCommand,countSuccesses,canPush} from '../src/lib/dice/engine';
import type {DiceCommand,RollMetadata} from '../src/lib/dice/schema';
import type {StructuredRoll} from '../src/lib/journey/quarter-schema';
import {applyQuarterCommand,defaultAssignments,quarterFor} from '../src/lib/journey/quarter-engine';
import {quarterCommandSchema} from '../src/lib/journey/quarter-schema';
import {sessionSchema} from '../src/lib/validation';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {executeDice} from '../src/server/dice/service';
import {saveCharacter} from '../src/server/character-service';
import {executeJourney} from '../src/server/journey/service';
const geo={lookup:()=>null,adjacent:()=>false,calibrated:false},now='2026-10-27T12:00:00.000Z';
const envelope=()=>({campaignId:randomUUID(),actionId:randomUUID()});
const metadata:RollMetadata={attribute:'strength',isArmor:false,weaponIndex:0,weaponDamage:1};
function roll(skill='Attack: Dagger'):StructuredRoll{const r={id:randomUUID(),characterId:'ilva',skill,attribute:[6,1,2],skillDice:[1,6,2],negativeSkill:false,gear:[1,2,6],artifacts:[{sides:8 as const,value:8},{sides:10 as const,value:2}],successes:0,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null};return {...r,successes:countSuccesses(r)}}
const initial=()=>{const s=structuredClone(initialSession);s.characters[0].sheet={...sheetFor(s.characters[0]),'attr-strength':'3',willpower:'9',weapons:[{name:'Dagger',bonus:'2',skill:'melee'}]};return s};
test('pending roll preserves originals, pushes eligible dice once, and applies damage/Willpower once',()=>{
 const r=roll();let s=applyDiceCommand(initial(),{...envelope(),type:'create',roll:r,metadata},geo,now,()=>1);assert.equal(s.dice![0].status,'Pending');assert.equal(s.characters[0].sheet!['attr-strength'],'3');assert.equal(s.messages.filter(m=>m.id===r.id).length,1);
 s=applyDiceCommand(s,{...envelope(),type:'push',rollId:r.id},geo,now,()=>1);const card=s.dice![0];assert.deepEqual(card.original,r);assert.deepEqual(card.result.attribute,[6,1,1]);assert.deepEqual(card.result.skillDice,[1,6,1]);assert.deepEqual(card.result.gear,[1,1,6]);assert.deepEqual(card.result.artifacts,[{sides:8,value:8},{sides:10,value:1}]);assert.equal(card.result.attributeDamage,2);assert.equal(card.result.gearDamage,2);assert.equal(card.result.willpower,1);assert.equal(s.characters[0].sheet!['attr-strength'],'1');assert.equal(s.characters[0].sheet!.willpower,'10');assert.equal(s.characters[0].sheet!.weapons![0].bonus,'0');assert.equal(card.gearDamageManual,0);assert.equal(canPush(card),false);assert.throws(()=>applyDiceCommand(s,{...envelope(),type:'push',rollId:r.id},geo,now,()=>6),/cannot be pushed/);assert.equal(s.campaign.hex,initialSession.campaign.hex);assert.equal(s.campaign.quarter,initialSession.campaign.quarter);sessionSchema.parse(s);
 const armor=applyDiceCommand(initial(),{...envelope(),type:'create',roll:roll('Armor'),metadata:{...metadata,isArmor:true,weaponIndex:null}},geo,now,()=>1);assert.throws(()=>applyDiceCommand(armor,{...envelope(),type:'push',rollId:armor.dice![0].id},geo,now,()=>1),/cannot be pushed/);
});
test('only submitted compatible results resolve requests and existing cards update instead of adding chat duplicates',()=>{
 let s=initial();const assignments=defaultAssignments(s,false);assignments[0].skill='Survival';for(const a of assignments.slice(1))a.skill='No roll';
 s=applyQuarterCommand(s,quarterCommandSchema.parse({...envelope(),revision:1,type:'quarter-draft',traveling:false,destination:'',assignments}),geo,now);s=applyQuarterCommand(s,quarterCommandSchema.parse({...envelope(),revision:1,type:'quarter-confirm',planId:quarterFor(s).active!.id,confirmed:true}),geo,now);
 const r=roll('Survival');s=applyDiceCommand(s,{...envelope(),type:'create',roll:r,metadata:{...metadata,weaponIndex:null}},geo,now,()=>6);assert.equal(quarterFor(s).active!.status,'AWAITING_ROLLS');const req=quarterFor(s).active!.requests[0];const before=s.messages.length;
 const unrelated=roll('Melee');s=applyDiceCommand(s,{...envelope(),type:'create',roll:unrelated,metadata:{...metadata,weaponIndex:null}},geo,now,()=>6);assert.throws(()=>applyDiceCommand(s,{...envelope(),type:'submit',rollId:unrelated.id,requestId:req.id},geo,now,()=>6),/does not match/);
 s=applyDiceCommand(s,{...envelope(),type:'submit',rollId:unrelated.id,requestId:null},geo,now,()=>6);assert.equal(quarterFor(s).active!.status,'AWAITING_ROLLS');s=applyDiceCommand(s,{...envelope(),type:'submit',rollId:r.id,requestId:req.id},geo,now,()=>6);assert.equal(quarterFor(s).active!.status,'RESOLVED');assert.equal(s.dice![0].status,'Submitted');assert.equal(s.messages.length,before+1);assert.equal(s.campaign.quarter,initialSession.campaign.quarter);assert.throws(()=>applyDiceCommand(s,{...envelope(),type:'submit',rollId:r.id,requestId:req.id},geo,now,()=>6),/already submitted/);
});
test('pending results survive SQLite restart, duplicate push/submission receipts replay without effects',()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-dice-')),file=join(dir,'campaign.sqlite');let repo=new SqliteCampaignRepository(file);try{let record=repo.create(initial());const submit=(input:Record<string,unknown>)=>{const c={campaignId:record.id,actionId:randomUUID(),...input};record=executeDice(c,repo).record;return c};const r=roll();submit({type:'create',roll:r,metadata});const pending=record.session;repo.close();repo=new SqliteCampaignRepository(file);assert.deepEqual(repo.get(record.id)!.session,pending);const push=submit({type:'push',rollId:r.id});const afterPush=record.session;assert.equal(executeDice(push,repo).replayed,true);assert.deepEqual(repo.get(record.id)!.session,afterPush);assert.throws(()=>submit({type:'push',rollId:r.id}),/cannot be pushed/);const submission=submit({type:'submit',rollId:r.id,requestId:null});const after=record.session;repo.close();repo=new SqliteCampaignRepository(file);assert.equal(executeDice(submission,repo).replayed,true);assert.deepEqual(repo.get(record.id)!.session,after);assert.throws(()=>submit({type:'submit',rollId:r.id,requestId:null}),/already submitted/);assert.throws(()=>executeJourney({campaignId:record.id,actionId:randomUUID(),revision:record.revision,type:'quarter-roll',roll:r},repo),/pending dice/)}finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
test('character field deltas merge across multiple windows without duplicate characters or campaign replacement',()=>{
 const repo=new SqliteCampaignRepository(':memory:');try{const record=repo.create(initial()),base=sheetFor(record.session.characters[0]);saveCharacter({campaignId:record.id,characterId:'ilva',before:base,sheet:{...base,name:'Ilva New Name'}},repo);saveCharacter({campaignId:record.id,characterId:'ilva',before:base,sheet:{...base,'attr-strength':'2'}},repo);const saved=repo.get(record.id)!;assert.equal(saved.session.characters[0].name,'Ilva New Name');assert.equal(saved.session.characters[0].sheet!['attr-strength'],'2');assert.equal(saved.session.characters.length,4);assert.equal(saved.session.messages.length,record.session.messages.length);assert.throws(()=>saveCharacter({campaignId:record.id,characterId:'ilva',before:base,sheet:{...base,name:'Stale rename'}},repo),/changed in another window/);assert.throws(()=>saveCharacter({campaignId:record.id,characterId:'missing',before:base,sheet:base},repo),/not found/)}finally{repo.close()}
});
test('resource and D66 utility cards cannot push or resolve skill requests; depletion saves once',()=>{
 const s=initial();s.characters[0].sheet!['res-food']='D8';const r={...roll('food'),attribute:[],skillDice:[],gear:[],artifacts:[],successes:0};const metadataUtility={...metadata,attribute:null,weaponIndex:null,weaponDamage:null,utility:{kind:'Resource' as const,resource:'food' as const,sides:8 as const,value:1}};
 const next=applyDiceCommand(s,{...envelope(),type:'create',roll:r,metadata:metadataUtility},geo,now,()=>6);assert.equal(next.characters[0].sheet!['res-food'],'D6');assert.equal(canPush(next.dice![0]),false);assert.throws(()=>applyDiceCommand(next,{...envelope(),type:'create',roll:r,metadata:metadataUtility},geo,now,()=>6),/already exists/);assert.throws(()=>applyDiceCommand(next,{...envelope(),type:'submit',rollId:r.id,requestId:'wrong'},geo,now,()=>6),/cannot resolve/);
 const d=applyDiceCommand(s,{...envelope(),type:'create',roll:{...r,id:randomUUID(),skill:'D66'},metadata:{...metadataUtility,utility:{kind:'D66',faces:[6,1]}}},geo,now,()=>6);assert.equal(canPush(d.dice![0]),false);assert.equal(d.dice![0].metadata.utility?.kind,'D66');
});
