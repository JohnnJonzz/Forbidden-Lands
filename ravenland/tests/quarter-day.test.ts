import {applyDiceCommand} from '../src/lib/dice/engine';
import {executeDice} from '../src/server/dice/service';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialSession} from '../src/lib/mock';
import type {Session} from '../src/lib/types';
import {applyQuarterCommand,quarterFor,defaultAssignments,directionBetween,matchingRequests,journeyContext} from '../src/lib/journey/quarter-engine';
import {quarterCommandSchema,type StructuredRoll} from '../src/lib/journey/quarter-schema';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {executeJourney} from '../src/server/journey/service';
const hex=(coordinate:string,column:number,row:number)=>({coordinate,column,row,terrain:'Forest',region:null,printedFeatures:[],waterways:[],routes:[]});
const m=hex('M22',12,11),n=hex('N21',13,10),geo={lookup:(id:string)=>id==='M22'?m:id==='N21'?n:null,adjacent:(a:string,b:string)=>a==='M22'&&b==='N21',calibrated:true};
const initial=():Session=>({...structuredClone(initialSession),campaign:{...initialSession.campaign,hex:'M22',date:'2026-12-31',quarter:'Night'}});
const command=(input:Record<string,unknown>)=>quarterCommandSchema.parse({campaignId:randomUUID(),revision:1,actionId:randomUUID(),...input});
const apply=(s:Session,input:Record<string,unknown>)=>applyQuarterCommand(s,command(input),geo,'now');
test('defaults, activity restrictions, authoritative destinations and Ravenland compass direction',()=>{
 let s=initial();s=apply(s,{type:'quarter-settings',settings:{weatherMode:'Manual',leader:'ilva',watch:'brom',hike:'No roll (manual ruling)'},weather:'Snow'});
 const a=defaultAssignments(s,true);assert.equal(a[0].activity,'Lead the Way');assert.equal(a[1].activity,'Keep Watch');assert.equal(a[2].activity,'Hike');assert.equal(a[2].skill,'No roll');assert.equal(defaultAssignments(s,false)[0].activity,'Rest');
 assert.equal(directionBetween(m,n),'Northeast');assert.equal(directionBetween(m,hex('L23',11,11)),'Southwest');assert.equal(directionBetween(m,hex('M20',12,10)),'North');
 assert.throws(()=>apply(s,{type:'quarter-draft',traveling:true,destination:'X99',assignments:a}),/adjacent/);
 assert.throws(()=>apply(s,{type:'quarter-draft',traveling:false,destination:'',assignments:a}),/incompatible/);
 assert.equal(s.campaign.weather,'Snow');
});
test('structured roll matching, no premature movement, manual adjudication, rollover and duplicate protection',()=>{
 let s=initial();const a=defaultAssignments(s,true);a[0].activity='Lead the Way';a[0].skill='Survival';a[1].activity='Keep Watch';a[1].skill='Scouting';a[2].skill='No roll';a[3].skill='No roll';
 s=apply(s,{type:'quarter-draft',traveling:true,destination:'N21',assignments:a});const id=quarterFor(s).active!.id;
 s=apply(s,{type:'quarter-confirm',planId:id,confirmed:true});assert.equal(s.campaign.hex,'M22');assert.equal(s.campaign.quarter,'Night');assert.equal(quarterFor(s).active!.requests.length,2);
 assert.throws(()=>apply(s,{type:'quarter-advance',planId:id,confirmed:true}),/Resolve/);
 assert.throws(()=>apply(s,{type:'quarter-draft',traveling:false,destination:'',assignments:defaultAssignments(s,false)}),/cannot be edited/);
 const request=quarterFor(s).active!.requests[0];const roll:StructuredRoll={id:randomUUID(),characterId:'ilva',skill:'Survival',attribute:[6,1],skillDice:[6],negativeSkill:false,gear:[2],artifacts:[{sides:8,value:8}],successes:4,pushed:true,attributeDamage:1,gearDamage:0,willpower:1,quarterDayId:null,requestId:null};
 assert.equal(matchingRequests(s,roll).length,1);assert.equal(matchingRequests(s,{...roll,skill:'Melee'}).length,0);
 s=apply(s,{type:'quarter-roll',roll});assert.equal(quarterFor(s).active!.requests[0].status,'pending');assert.throws(()=>apply(s,{type:'quarter-roll',roll}),/already recorded/);
 const linked={...roll,id:randomUUID(),quarterDayId:id,requestId:request.id};s=apply(s,{type:'quarter-roll',roll:linked});assert.equal(quarterFor(s).active!.requests[0].status,'completed');assert.throws(()=>apply(s,{type:'quarter-roll',roll:{...linked,id:randomUUID()}}),/does not match/);
 const remaining=quarterFor(s).active!.requests[1];s=apply(s,{type:'quarter-manual',planId:id,requestId:remaining.id,notes:'Controller reviewed conditions: watch successful',confirmed:true});assert.equal(quarterFor(s).active!.status,'RESOLVED');assert.equal(s.campaign.hex,'M22');
 assert.throws(()=>apply(s,{type:'quarter-advance',planId:id,confirmed:true}),/coordinator/);s=applyDiceCommand(s,{campaignId:randomUUID(),actionId:randomUUID(),type:'submit-group',planId:id,actorId:'ilva'},geo,'2026-10-27T12:00:00.000Z',()=>6);assert.throws(()=>apply(s,{type:'quarter-advance',planId:id,confirmed:true}),/adjudicate/);
 s=apply(s,{type:'quarter-travel-ruling',planId:id,approved:true,notes:'Controller verified terrain rate and compatibility; arrival this quarter',confirmed:true});s=apply(s,{type:'quarter-advance',planId:id,confirmed:true});assert.equal(s.campaign.hex,'N21');assert.equal(s.campaign.quarter,'Morning');assert.equal(s.campaign.date,'2027-01-01');assert.equal(quarterFor(s).history[0].status,'ADVANCED');assert.throws(()=>apply(s,{type:'quarter-advance',planId:id,confirmed:true}),/missing/);assert.equal(journeyContext(s).campaign.hex,'N21');
});
test('same SQLite saves pending requests and idempotent advance across repository restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-quarter-')),path=join(dir,'campaign.sqlite');let repo=new SqliteCampaignRepository(path);try{
 let record=repo.create(initial());const submit=(input:Record<string,unknown>)=>{const cmd={campaignId:record.id,revision:record.revision,actionId:randomUUID(),...input};record=executeJourney(cmd,repo).record;return cmd};
 submit({type:'quarter-draft',traveling:false,destination:'',assignments:defaultAssignments(record.session,false)});const id=quarterFor(record.session).active!.id;submit({type:'quarter-confirm',planId:id,confirmed:true});const before=record.session;repo.close();repo=new SqliteCampaignRepository(path);assert.deepEqual(repo.get(record.id)!.session,before);
 for(const r of quarterFor(record.session).active!.requests)submit({type:'quarter-manual',planId:id,requestId:r.id,notes:'Manual ruling: no roll needed for resting here',confirmed:true});
 record=executeDice({campaignId:record.id,actionId:randomUUID(),type:'submit-group',planId:id,actorId:'ilva'},repo).record;const cmd=submit({type:'quarter-advance',planId:id,confirmed:true});const after=record.session;assert.equal(executeJourney(cmd,repo).replayed,true);repo.close();repo=new SqliteCampaignRepository(path);assert.equal(executeJourney(cmd,repo).replayed,true);assert.deepEqual(repo.get(record.id)!.session,after);
 }finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
test('cancellation retains history and does not spend time',()=>{let s=initial();s=apply(s,{type:'quarter-draft',traveling:false,destination:'',assignments:defaultAssignments(s,false)});s=apply(s,{type:'quarter-cancel',planId:quarterFor(s).active!.id,confirmed:true});assert.equal(s.campaign.quarter,'Night');assert.equal(s.campaign.hex,'M22');assert.equal(quarterFor(s).history[0].status,'CANCELLED')});
