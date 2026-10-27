import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initialSession} from '../src/lib/mock';
import {applyDiceCommand,canPush} from '../src/lib/dice/engine';
import {groupReadiness,groupsFor} from '../src/lib/dice/groups';
import type {DiceCommand,RollMetadata} from '../src/lib/dice/schema';
import {applyQuarterCommand,defaultAssignments,quarterFor} from '../src/lib/journey/quarter-engine';
import {quarterCommandSchema,type StructuredRoll} from '../src/lib/journey/quarter-schema';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {executeDice,getQuarterDayNarration} from '../src/server/dice/service';
import {backupSchema} from '../src/lib/validation';
import type {Session} from '../src/lib/types';
const geo={lookup:()=>null,adjacent:()=>false,calibrated:false},now='2026-10-27T12:00:00.000Z';
const metadata:RollMetadata={attribute:'wits',isArmor:false,weaponIndex:null,weaponDamage:null};
const roll=(characterId:string):StructuredRoll=>({id:randomUUID(),characterId,skill:'Survival',attribute:[1,6,2],skillDice:[3],negativeSkill:false,gear:[1],artifacts:[],successes:1,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null});
function plan(){let s=structuredClone(initialSession);const assignments=defaultAssignments(s,false).map(a=>({...a,skill:'Survival' as const}));s=applyQuarterCommand(s,quarterCommandSchema.parse({campaignId:randomUUID(),revision:1,actionId:randomUUID(),type:'quarter-draft',traveling:false,destination:'',assignments}),geo,now);return applyQuarterCommand(s,quarterCommandSchema.parse({campaignId:randomUUID(),revision:1,actionId:randomUUID(),type:'quarter-confirm',planId:quarterFor(s).active!.id,confirmed:true}),geo,now)}
function apply(s:Session,c:Record<string,unknown>){return applyDiceCommand(s,{campaignId:randomUUID(),actionId:randomUUID(),...c} as DiceCommand,geo,now,()=>1)}
function manual(s:Session,requestId:string){return applyQuarterCommand(s,quarterCommandSchema.parse({campaignId:randomUUID(),revision:1,actionId:randomUUID(),type:'quarter-manual',planId:quarterFor(s).active!.id,requestId,notes:'Controller verified conditions; roll not needed',confirmed:true}),geo,now)}
test('four characters stage and push independently, then Ready locks results without resolving activities or invoking narration',()=>{
 let s=plan();assert.equal(groupsFor(s).coordinatorId,'ilva');const rolls=s.characters.map(ch=>roll(ch.id));for(const r of rolls)s=apply(s,{type:'create',roll:r,metadata});assert.equal(groupReadiness(s).label,'0 of 4 Rolls Ready');assert.equal(s.diceGroups,undefined);
 const first=rolls[0];s=apply(s,{type:'push',additionalEffectConfirmed:true,rollId:first.id});const pushed=structuredClone(s.characters[0]);for(let i=0;i<3;i++){const r=rolls[i],req=quarterFor(s).active!.requests.find(req=>req.characterId===r.characterId)!;s=apply(s,{type:'ready',rollId:r.id,requestId:req.id,actorId:r.characterId})}
 assert.equal(groupReadiness(s).label,'3 of 4 Rolls Ready');assert.equal(quarterFor(s).active!.status,'AWAITING_ROLLS');assert.equal(groupsFor(s).batches.length,0);assert.equal(canPush(s.dice![0]),false);assert.throws(()=>apply(s,{type:'push',additionalEffectConfirmed:true,rollId:first.id}),/Unready/);assert.throws(()=>apply(s,{type:'submit-group',planId:quarterFor(s).active!.id,actorId:'ilva'}),/Every mandatory/);assert.deepEqual(s.characters[0],pushed);
 s=apply(s,{type:'unready',rollId:first.id,actorId:'ilva'});assert.equal(canPush(s.dice![0]),false);s=apply(s,{type:'ready',rollId:first.id,requestId:quarterFor(s).active!.requests[0].id,actorId:'ilva'});s=manual(s,quarterFor(s).active!.requests[3].id);const before=structuredClone(s.characters),clock=structuredClone(s.campaign);s=apply(s,{type:'submit-group',planId:quarterFor(s).active!.id,actorId:'ilva'});
 assert.equal(s.diceGroups!.batches.length,1);assert.equal(s.diceGroups!.batches[0].results.length,3);assert.equal(s.diceGroups!.batches[0].resolvedRequests[3].manual,'Controller verified conditions; roll not needed');assert.equal(s.diceGroups!.batches[0].narration.status,'Not connected');assert.equal(quarterFor(s).active!.status,'RESOLVED');assert.deepEqual(s.characters,before);assert.deepEqual(s.campaign,clock);assert.equal(s.dice!.filter(d=>d.status==='Submitted').length,3);assert.equal(s.messages.filter(m=>m.id===s.diceGroups!.batches[0].id).length,1);backupSchema.parse({format:'ravenland-campaign',version:1,session:s});
});
test('ownership, incompatible requests, duplicate readiness, coordinator delegation, and ordinary roll submission are validated',()=>{
 let s=plan();const r=roll('ilva'),req=quarterFor(s).active!.requests[0];s=apply(s,{type:'create',roll:r,metadata});assert.throws(()=>apply(s,{type:'ready',rollId:r.id,requestId:req.id,actorId:'brom'}),/rolling character/);assert.throws(()=>apply(s,{type:'ready',rollId:r.id,requestId:quarterFor(s).active!.requests[1].id,actorId:'ilva'}),/compatible/);assert.throws(()=>apply(s,{type:'submit',rollId:r.id,requestId:req.id}),/coordinator/);
 s=apply(s,{type:'ready',rollId:r.id,requestId:req.id,actorId:'ilva'});const second=roll('ilva');s=apply(s,{type:'create',roll:second,metadata});assert.throws(()=>apply(s,{type:'ready',rollId:second.id,requestId:req.id,actorId:'ilva'}),/already Ready/);s=apply(s,{type:'submit',rollId:second.id,requestId:null});assert.equal(quarterFor(s).active!.requests[0].status,'pending');assert.throws(()=>apply(s,{type:'submit-group',planId:quarterFor(s).active!.id,actorId:'brom'}),/coordinator/);
 s=apply(s,{type:'group-coordinator',coordinatorId:'brom',actorId:'ilva'});assert.equal(groupsFor(s).coordinatorId,'brom');assert.throws(()=>apply(s,{type:'group-coordinator',coordinatorId:'nerys',actorId:'ilva'}),/coordinator/);
 s=manual(s,req.id);assert.equal(s.dice![0].status,'Pending');assert.equal(s.dice![0].result.requestId,null);
});
test('atomic batch submission survives restart and replays idempotently with exactly one consolidated summary',()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-batch-')),file=join(dir,'campaign.sqlite');let repo=new SqliteCampaignRepository(file);try{let record=repo.create(plan());const submit=(c:Record<string,unknown>)=>{const cmd={campaignId:record.id,actionId:randomUUID(),...c};record=executeDice(cmd,repo).record;return cmd};for(const ch of record.session.characters){const r=roll(ch.id);submit({type:'create',roll:r,metadata});submit({type:'ready',rollId:r.id,requestId:quarterFor(record.session).active!.requests.find(req=>req.characterId===ch.id)!.id,actorId:ch.id})}assert.equal(groupReadiness(record.session).ready.length,4);const pending=record.session;repo.close();repo=new SqliteCampaignRepository(file);assert.deepEqual(repo.get(record.id)!.session,pending);assert.throws(()=>getQuarterDayNarration(record.id,'not-submitted',repo),/not found/);
 const cmd=submit({type:'submit-group',planId:quarterFor(record.session).active!.id,actorId:'ilva'}),after=record.session;assert.equal(executeDice(cmd,repo).replayed,true);assert.deepEqual(repo.get(record.id)!.session,after);const packet=getQuarterDayNarration(record.id,cmd.actionId,repo);assert.equal(packet.results.length,4);assert.equal(packet.context.assignments.length,4);assert.equal(packet.context.hex,initialSession.campaign.hex);assert.throws(()=>submit({type:'submit-group',planId:packet.planId,actorId:'ilva'}),/already submitted/);repo.close();repo=new SqliteCampaignRepository(file);assert.equal(executeDice(cmd,repo).replayed,true);assert.deepEqual(repo.get(record.id)!.session,after);assert.deepEqual(getQuarterDayNarration(record.id,packet.id,repo),packet);
 }finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
test('an invalid saved result rolls back the entire batch rather than partially resolving other characters',()=>{
 const repo=new SqliteCampaignRepository(':memory:');try{let record=repo.create(plan());for(const ch of record.session.characters){const r=roll(ch.id);record=executeDice({campaignId:record.id,actionId:randomUUID(),type:'create',roll:r,metadata},repo).record;record=executeDice({campaignId:record.id,actionId:randomUUID(),type:'ready',rollId:r.id,requestId:quarterFor(record.session).active!.requests.find(req=>req.characterId===ch.id)!.id,actorId:ch.id},repo).record}
 record.session.dice![3].result.successes=99;record=repo.update(record.id,record.revision,record.session);const before=structuredClone(record.session),actionId=randomUUID();assert.throws(()=>executeDice({campaignId:record.id,actionId,type:'submit-group',planId:quarterFor(record.session).active!.id,actorId:'ilva'},repo),/Success total/);assert.deepEqual(repo.get(record.id)!.session,before);assert.equal(repo.db.prepare('SELECT 1 FROM journey_actions WHERE action_id=?').get(actionId),undefined);
 }finally{repo.close()}
});
