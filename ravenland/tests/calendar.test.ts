import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {initialSession} from '../src/lib/mock';
import {previewCalendar,applyCalendar,type CalendarCommand,calendarReceipts} from '../src/server/calendar/service';
import {ravenlandPhases,calendarView,activitySeason} from '../src/lib/campaign-calendar';
import {displayDate,sameDay,fantasyDayDistance} from '../src/lib/calendar';
import {advanceQuarter,nextDate} from '../src/lib/journey/clock';
import {fresh,ensureNeeds,stateFor} from '../src/server/activities/state';
import {injuryProgress} from '../src/lib/injury-timeline';
import {executeEnvironment} from '../src/server/transitions/commands';
import {establishWeather} from '../src/server/transitions/weather';
import {backupSchema} from '../src/lib/validation';
import {saveCharacter} from '../src/server/character-service';
import {syncConsequences} from '../src/server/consequences/registry';
import {newConsequence,saveConsequence,readConsequences} from '../src/server/consequences/store';
import {privateInjuryContext,guardInjuryDisclosure} from '../src/server/calendar/injury-context';
const calendar={phases:ravenlandPhases.map((name,i)=>({name,days:i%2?46:45})),source:'Isolated Table GM boundary ruling; not a claimed official festival schedule',reason:'All eight 45/46-day boundaries reviewed explicitly for this isolated campaign.'};
function fixture(){const repo=new SqliteCampaignRepository(':memory:'),s=structuredClone(initialSession);s.campaign.date='13th Stillfall, 1165';s.campaign.quarter='Morning';s.campaign.startingConditions={date:'12th Stillfall, 1165',quarter:'Morning',hex:'T05',location:'Belderand',terrain:'Plains',provenance:'Isolated historical evidence'};s.characters[0].sheet={...s.characters[0].sheet,'critical-injuries':'Effects remain',injuries:[{id:randomUUID(),name:'Private leg injury',sustainedDate:'12th Stillfall, 1165',sustainedQuarter:'Morning',duration:'6',unit:'days',permanent:false,status:'active',source:'Actual recorded result reference',treatment:'',recordedAt:new Date().toISOString()}]};stateFor(s);s.activityState!.settings.season='Autumn';s.activityState!.settings.checkpoint='Morning';s.activityState!.settings.effectiveDate='12th Stillfall, 1165';ensureNeeds(s);s.activityState!.needs.forEach(n=>{n.status='Satisfied';n.receiptId=randomUUID()});s.activityState!.provisions.push({itemId:randomUUID(),ownerId:s.characters[0].id,kind:'Vegetables',date:'12th Stillfall, 1165',quarter:'Night',chefRank:0,hazard:null});const r=repo.create(s),principal={playerId:'trusted-local',mode:'trusted-local' as const,grants:[{campaignId:r.id,characterIds:r.session.characters.map(c=>c.id)}]};const command=(category:CalendarCommand['category'],patch:Partial<CalendarCommand>={})=>({campaignId:r.id,revision:repo.get(r.id)!.revision,requestId:randomUUID(),actorId:r.session.characters[0].id,category,reason:'Explicit reviewed correction in an isolated campaign; preserve original mechanics.',...patch});const apply=(c:CalendarCommand)=>{const p=previewCalendar(repo,c,principal);return applyCalendar(repo,c,p.previewHash,principal)};return {repo,r,principal,command,apply};}
test('reviewed eight-phase boundaries advance four quarters, 45/46-day phases, year and legacy offsets',()=>{
 assert.deepEqual(advanceQuarter('12th Springrise, 1165','Morning',calendar),{date:'12th Springrise, 1165',quarter:'Day'});
 assert.deepEqual(advanceQuarter('12th Springrise, 1165','Night',calendar),{date:'13th Springrise, 1165',quarter:'Morning'});
 assert.equal(nextDate('45th Springrise, 1165',calendar),'1st Springwane, 1165');assert.equal(nextDate('46th Winterwane, 1165',calendar),'1st Springrise, 1166');
 assert.equal(displayDate('12th Springrise, 1165 (+1 day)',calendar),'13th Springrise, 1165');
});
test('Stillfall correction preserves chronology, needs, freshness, injury effects and immutable history; retry is atomic',()=>{const f=fixture();try{
 f.apply(f.command('calendar-configuration',{calendar}));assert.equal(f.repo.get(f.r.id)!.session.activityState!.settings.season,null);assert.equal(f.repo.get(f.r.id)!.session.environment!.weatherStatus,'established');assert.equal(f.repo.get(f.r.id)!.session.campaign.weather,f.r.session.campaign.weather);const before=f.repo.get(f.r.id)!,original=structuredClone(before.session),i=original.characters[0].sheet!.injuries![0];
 const c=f.command('phase-label',{fromPhase:'Stillfall',toPhase:'Springrise',year:1165}),preview=previewCalendar(f.repo,c,f.principal);assert.equal(preview.preview.after.clock.date,'13th Springrise, 1165');assert.equal(preview.preview.blockers.length,0);assert.deepEqual(f.repo.get(f.r.id),before,'preview is read-only');
 const result=applyCalendar(f.repo,c,preview.previewHash,f.principal),s=result.record.session;
 assert.equal(s.campaign.startingConditions!.date,'12th Springrise, 1165');assert.equal(s.campaign.date,'13th Springrise, 1165');assert.equal(s.campaign.quarter,'Morning');assert.equal(activitySeason(s),'Spring');
 assert.deepEqual(s.activityState,original.activityState);assert.deepEqual(s.characters,original.characters);assert.deepEqual(s.dice,original.dice);assert.deepEqual(s.dayTracker,original.dayTracker);assert.deepEqual(s.campsites,original.campsites);assert.deepEqual(s.calendarState,original.calendarState);
 assert.equal(fresh(s,s.activityState!.provisions[0]),true);ensureNeeds(s);assert.equal(s.activityState!.needs.length,original.activityState!.needs.length);
 assert.equal(sameDay('13th Stillfall, 1165',s.campaign.date,s.environment?.calendar),true);assert.equal(fantasyDayDistance(i.sustainedDate,s.campaign.date,s.environment?.calendar),1);
 assert.match(injuryProgress(i,{...s.campaign,calendar:s.environment?.calendar}),/5 days remaining.*18th Springrise/);
 assert.equal(applyCalendar(f.repo,c,preview.previewHash,f.principal).replayed,true);assert.equal(calendarReceipts(f.repo,f.r.id).length,2);
 const restored=f.repo.create(backupSchema.parse({format:'ravenland-campaign',version:1,session:s}).session);assert.equal(calendarView(restored.session).season,'Spring');assert.deepEqual(restored.session.calendarState,s.calendarState);
 }finally{f.repo.close()}});
test('starting metadata never rewinds the current state; GM authority, stale previews and fabricated phase lengths fail closed',()=>{const f=fixture();try{
 const initial=f.repo.get(f.r.id)!.session.campaign,c=f.command('starting-conditions',{starting:{...initial.startingConditions!,date:'1st Springrise, 1165'}});f.apply(c);assert.equal(f.repo.get(f.r.id)!.session.campaign.date,initial.date);
 assert.throws(()=>previewCalendar(f.repo,f.command('calendar-configuration',{calendar}),{playerId:'player',grants:f.principal.grants}),/Table GM/);
 assert.throws(()=>previewCalendar(f.repo,f.command('calendar-configuration',{calendar:{...calendar,phases:[{name:'Springrise',days:30}]}}),f.principal),/eight/);
 const pending=f.command('calendar-configuration',{calendar}),p=previewCalendar(f.repo,pending,f.principal);f.apply(f.command('starting-conditions',{starting:initial.startingConditions}));assert.throws(()=>applyCalendar(f.repo,pending,p.previewHash,f.principal),/changed/);
 }finally{f.repo.close()}});
test('corrections cannot skip elapsed obligations; injury metadata has audited recovery preview without healing',()=>{const f=fixture();try{
 f.apply(f.command('calendar-configuration',{calendar}));f.apply(f.command('phase-label',{fromPhase:'Stillfall',toPhase:'Springrise',year:1165}));
 const c=f.command('date-normalization',{date:'19th Springrise, 1165'}),p=previewCalendar(f.repo,c,f.principal);assert.match(p.preview.blockers.join(' '),/elapsed time/);assert.throws(()=>applyCalendar(f.repo,c,p.previewHash,f.principal),/elapsed time/);
 const i=f.repo.get(f.r.id)!.session.characters[0].sheet!.injuries![0],fix=f.command('injury-timeline',{injury:{characterId:f.r.session.characters[0].id,id:i.id,sustainedDate:'12th Springrise, 1165',sustainedQuarter:'Morning',duration:'1'}}),review=previewCalendar(f.repo,fix,f.principal);assert.match(review.preview.recoveryPreview!.after!,/Healing due/);applyCalendar(f.repo,fix,review.previewHash,f.principal);
 const ch=f.repo.get(f.r.id)!.session.characters[0];assert.equal(ch.sheet!.injuries![0].status,'active');assert.equal(ch.sheet!['critical-injuries'],'Effects remain');assert.throws(()=>saveCharacter({campaignId:f.r.id,characterId:ch.id,before:ch.sheet,sheet:{...ch.sheet,injuries:[...ch.sheet!.injuries!,{...ch.sheet!.injuries![0],id:randomUUID()}]}},f.repo),/Table GM/);assert.throws(()=>saveCharacter({campaignId:f.r.id,characterId:ch.id,before:ch.sheet,sheet:{...ch.sheet,injuries:[{...ch.sheet!.injuries![0],duration:'9'}]}},f.repo),/Table GM/);
 }finally{f.repo.close()}});
test('calendar corrections preserve outstanding lethal countdowns and privacy; milestones cannot disclose private injuries',()=>{const f=fixture();try{
 const v=newConsequence(f.r.id,{kind:'journal',id:'saved-original',encounterId:null,procedureId:null},'lethal_injury','Existing lethal obligation');v.state.deadline={unit:'days',dice:1,modifier:0,value:2,rollId:randomUUID(),elapsed:1,observedRound:0,clockDate:'13th Stillfall, 1165',clockQuarter:'Morning',clockReviewRequired:false};saveConsequence(f.repo,v);
 syncConsequences(f.repo,f.r.id);assert.equal(readConsequences(f.repo,f.r.id)[0].state.deadline!.clockReviewRequired,false);const original=readConsequences(f.repo,f.r.id);f.apply(f.command('calendar-configuration',{calendar}));f.apply(f.command('phase-label',{fromPhase:'Stillfall',toPhase:'Springrise',year:1165}));syncConsequences(f.repo,f.r.id);assert.deepEqual(readConsequences(f.repo,f.r.id),original);
 const s=f.repo.get(f.r.id)!.session;assert.equal(privateInjuryContext(f.repo,f.r.id,s,null).records.length,0);assert.match(privateInjuryContext(f.repo,f.r.id,s,f.principal).records[0].progress,/5 days remaining/);assert.match(guardInjuryDisclosure(s,'Your Private leg injury has healed.'),/privately|Private recovery/);
 }finally{f.repo.close()}});
test('weather activation derives calendar phase; manual weather is retained and seasonal Morning step is idempotent',()=>{const f=fixture();try{
 f.apply(f.command('calendar-configuration',{calendar}));f.apply(f.command('phase-label',{fromPhase:'Stillfall',toPhase:'Springrise',year:1165}));let r=f.repo.get(f.r.id)!;const c={campaignId:r.id,revision:r.revision,requestId:randomUUID(),actorId:r.session.characters[0].id,operation:'activate-hex-flower',temperatureMode:'seasonal',authorizeDailyAdvancement:true,approveReplacement:false,reason:'Explicitly activate daily campaign protocol after reviewing the corrected calendar.',confirmed:true};
 assert.throws(()=>executeEnvironment(f.repo,{...c,phase:'winterrise'},f.principal),/calendar/);executeEnvironment(f.repo,c,f.principal);r=f.repo.get(f.r.id)!;assert.equal(r.session.environment!.hexFlower!.phase,'springrise');assert.equal(r.session.campaign.weather,f.r.session.campaign.weather);
 const s=r.session;s.campaign.date='1st Springwane, 1165';s.campaign.quarter='Morning';let rolls=0;const first=establishWeather(s,'new-morning',()=>{rolls++;return 1});assert.equal(first!.hexFlower!.phase,'springwane');const count=rolls;assert.equal(establishWeather(s,'retry',()=>{throw Error('No reroll')}),first);assert.equal(rolls,count);
 }finally{f.repo.close()}});
test('unmappable legacy history establishes a verified current anchor without inventing elapsed time',()=>{const f=fixture();try{
 const r=f.repo.get(f.r.id)!;r.session.dayTracker=[{id:randomUUID(),planId:'old-imported-record',date:'1st Unmapped, 1164',quarter:'Morning',weather:'Clear',from:r.session.campaign.hex,destination:'',endingHex:r.session.campaign.hex,direction:'',traveling:false,travelRuling:'',assignments:[],submittedAt:new Date().toISOString(),notes:'Legacy evidence with an unknown calendar',narrative:'',status:'Completed'}];f.repo.update(r.id,r.revision,r.session);
 f.apply(f.command('calendar-configuration',{calendar}));const s=f.repo.get(r.id)!.session;assert.equal(s.calendarState!.anchorDate,s.campaign.date);assert.equal(s.calendarState!.elapsedQuarters,0);assert.equal(s.dayTracker![0].date,'1st Unmapped, 1164');
 }finally{f.repo.close()}});
test('label correction preserves verified within-quarter time, narrative estimates and original ledger events',async()=>{const f=fixture();try{
 const {advanceTime}=await import('../src/server/time/service'),{journeyStatus}=await import('../src/server/journey/status'),{journeyFor}=await import('../src/lib/journey/engine');
 const r=f.repo.get(f.r.id)!;r.session.journey=journeyFor(r.session);r.session.journey.workflow={intents:[],rumors:[],estimates:[{id:randomUUID(),at:new Date().toISOString(),clock:{date:r.session.campaign.date,quarter:r.session.campaign.quarter,hex:r.session.campaign.hex},description:'An established short conversation',minutes:10,confidence:'approximate',sourceMessageId:'original-source'}]};f.repo.update(r.id,r.revision,r.session,{workflowValidated:true});
 advanceTime(f.repo,{campaignId:r.id,eventId:'verified-fifteen-minutes',sceneId:'campaign:'+r.id,unit:'minutes',amount:15,source:'Isolated verified time receipt',authority:{kind:'human_controller',id:'trusted-local'},reason:'Exactly fifteen minutes were established before this calendar label review.'});
 const before=journeyStatus(f.repo,r.id).time,ledger=f.repo.db.prepare("SELECT result_json FROM consequence_commands WHERE campaign_id=? AND request_id LIKE 'time:%'").all(r.id);
 f.apply(f.command('calendar-configuration',{calendar}));f.apply(f.command('phase-label',{fromPhase:'Stillfall',toPhase:'Springrise',year:1165}));
 const after=journeyStatus(f.repo,r.id).time;assert.equal(after.verifiedMinutes,15);assert.deepEqual(after.estimates,before.estimates);assert.deepEqual(after.events,before.events);assert.deepEqual(f.repo.db.prepare("SELECT result_json FROM consequence_commands WHERE campaign_id=? AND request_id LIKE 'time:%'").all(r.id),ledger);
 }finally{f.repo.close()}});
test('saved overloaded movement scopes survive a label correction but not another quarter, location or combat turn',async()=>{
 const {equivalentMovementScope}=await import('../src/server/logistics/overload');const c={...calendar,labelAliases:[{from:'Stillfall',to:'Springrise',year:1165}]};
 assert.equal(equivalentMovementScope('Hike:13th Stillfall, 1165:Morning:U06','Hike:13th Springrise, 1165:Morning:U06',c),true);
 assert.equal(equivalentMovementScope('Hike:12th Stillfall, 1165 (+1 day):Morning:U06','Hike:13th Springrise, 1165:Morning:U06',c),true);
 for(const target of ['Hike:13th Springrise, 1165:Day:U06','Hike:14th Springrise, 1165:Morning:U06','Hike:13th Springrise, 1165:Morning:V07','Run:encounter:2:actor:1'])assert.equal(equivalentMovementScope('Hike:13th Stillfall, 1165:Morning:U06',target,c),false);
 assert.equal(equivalentMovementScope('Run:encounter:1:actor:1','Run:encounter:2:actor:1',c),false);
});
