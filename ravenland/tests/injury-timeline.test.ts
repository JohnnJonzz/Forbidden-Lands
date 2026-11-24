import {test} from 'node:test';
import assert from 'node:assert/strict';
import {injuryProgress,type InjuryRecord} from '../src/lib/injury-timeline';
import {characterSheetSchema} from '../src/lib/character-sheet';
const injury:InjuryRecord={id:crypto.randomUUID(),name:'Recorded injury',sustainedDate:'13th Springrise, 1165',sustainedQuarter:'Morning',duration:'6',unit:'days',permanent:false,status:'active',source:'Recorded result — no generated dice',treatment:'',recordedAt:new Date().toISOString()};
test('healing countdown follows game dates and quarters without mutating injury effects',()=>{
 const before=structuredClone(injury);
 assert.match(injuryProgress(injury,{date:'14th of Springrise, 1165',quarter:'Day'}),/4.75 days remaining.*19th Springrise, 1165 Morning/);
 assert.equal(injuryProgress(injury,{date:'19th Springrise, 1165',quarter:'Morning'}),'Healing due · confirm recovery');
 assert.deepEqual(injury,before);
 assert.match(injuryProgress({...injury,duration:'6',unit:'hours'},{date:injury.sustainedDate,quarter:'Morning'}),/6 hours remaining/);
 assert.equal(injuryProgress({...injury,duration:'6',unit:'hours'},{date:injury.sustainedDate,quarter:'Day'}),'Healing due · confirm recovery');
});
test('unknown legacy dates, unresolved durations, permanent injuries and clock corrections stay explicit',()=>{
 const now={date:'14th Springrise, 1165',quarter:'Morning' as const};
 assert.equal(injuryProgress({...injury,sustainedDate:''},now),'Date unknown');
 assert.equal(injuryProgress({...injury,duration:''},now),'Healing time requires review');
 assert.equal(injuryProgress({...injury,permanent:true},now),'Permanent');
 assert.match(injuryProgress(injury,{date:'12th Springrise, 1165',quarter:'Night'}),/review required/);
 assert.equal(injuryProgress(injury,{date:'1st Summerwane, 1165',quarter:'Morning'}),'Calendar requires review');
 assert.equal(injuryProgress({...injury,status:'healed'},now),'Healing confirmed manually');
});
test('reviewed calendar boundaries and legacy offsets calculate without using wall time',()=>{
 const calendar={phases:[{name:'Springrise',days:45},{name:'Springwane',days:46}],source:'Table GM',reason:'Reviewed boundaries for this isolated fixture.'};
 assert.match(injuryProgress({...injury,sustainedDate:'44th Springrise, 1165'},{date:'2nd Springwane, 1165',quarter:'Morning',calendar}),/3 days remaining.*5th Springwane, 1165 Morning/);
 assert.match(injuryProgress(injury,{date:'13th Springrise, 1165 (+2 days)',quarter:'Morning'}),/4 days remaining/);
});
test('sheet validation round trips notes and injury metadata; invalid and duplicate records are rejected',()=>{
 const sheet={'critical-injuries':'Existing effects unchanged',injuries:[injury]};
 assert.deepEqual(characterSheetSchema.parse(sheet),sheet);
 assert.equal(characterSheetSchema.safeParse({...sheet,injuries:[injury,injury]}).success,false);
 for(const duration of ['D6','-1','0','Infinity'])assert.equal(characterSheetSchema.safeParse({...sheet,injuries:[{...injury,duration}]}).success,false);
});
test('private dated records are visible only to owner and GM, independent of public backstory',async()=>{
 const {getLocalRepository}=await import('../src/server/sqlite');
 const {initialSession}=await import('../src/lib/mock');
 const {privateCharacterRecord}=await import('../src/server/creatures/context');
 const {createHash}=await import('node:crypto');
 const previousPath=process.env.RAVENLAND_DB_PATH,previousGrants=process.env.RAVENLAND_PLAYER_GRANTS;
 process.env.RAVENLAND_DB_PATH=':memory:';
 const repo=getLocalRepository();
 try{
  const session=structuredClone(initialSession);session.characters[0].sheet={injuries:[injury],backstory:'Public background','backstory-visibility':'Party Known'};
  const record=repo.create(session),token='isolated-owner-injury-timeline-token';
  process.env.RAVENLAND_PLAYER_GRANTS=JSON.stringify([{playerId:'owner',tokenHash:createHash('sha256').update(token).digest('hex'),grants:[{campaignId:record.id,characterIds:[session.characters[0].id]}]}]);
  assert.equal(privateCharacterRecord(new Request('https://example.test/api/campaigns'),record).session.characters[0].sheet?.injuries,undefined);
  const owner=new Request('https://example.test/api/campaigns',{headers:{authorization:'Bearer '+token}});
  assert.deepEqual(privateCharacterRecord(owner,record).session.characters[0].sheet?.injuries,[injury]);
  repo.db.prepare('INSERT INTO table_gm_settings VALUES (?,?,?,?,?)').run(record.id,'owner',1,'trusted-local',new Date().toISOString());
  const another={...record,session:{...session,characters:[...session.characters,{...session.characters[0],id:'other-private',sheet:{injuries:[injury]}}]}};
  assert.deepEqual(privateCharacterRecord(owner,another).session.characters.at(-1)?.sheet?.injuries,[injury]);
 }finally{repo.close();if(previousPath===undefined)delete process.env.RAVENLAND_DB_PATH;else process.env.RAVENLAND_DB_PATH=previousPath;if(previousGrants===undefined)delete process.env.RAVENLAND_PLAYER_GRANTS;else process.env.RAVENLAND_PLAYER_GRANTS=previousGrants;}
});
