import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSync,constants,readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {SourcebookLibrary} from '../src/server/sourcebooks/library';
import {FileSourcebookStorage} from '../src/server/sourcebooks/storage';
import {extractPDF} from '../src/server/sourcebooks/extract';
import {groundedWeaponAnswer} from '../src/server/sourcebooks/mechanical-facts';
import {retrieveRules,citationsFor} from '../src/server/sourcebooks/retrieval';
import {initialSession} from '../src/lib/mock';
import {AIService} from '../src/server/ai/service';
import type {GMProvider} from '../src/server/ai/provider';
import {weaponRequest} from '../src/lib/rules/weapon-request';
import {playerInputCases} from './fixtures/attack-input-cases';
import {prepareAction} from '../src/server/action-preparation';
import {executeDice} from '../src/server/dice/service';
import {rollRequestId,savedRollFingerprint} from '../src/server/dice/gm-submission';
const files=['Forbidden_Lands_Players_Handbook_5th_printing.pdf','Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf'],fixtureDir=process.env.RAVENLAND_REAL_SOURCEBOOK_DIR??join(process.cwd(),'tests/fixtures/private-sourcebooks'),required=process.env.RAVENLAND_REQUIRE_REAL_SOURCEBOOKS==='1';
const unavailable=files.filter(file=>{try{accessSync(join(fixtureDir,file),constants.R_OK);return false}catch{return true}});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Never assert against an entire passage/string: assertion output must not dump books.
const check=(ok:unknown,message:string)=>assert.ok(!!ok,message);
test('REAL fifth-printing sourcebooks: extraction, persisted FTS and complete retrieval pipeline', {skip:unavailable.length&&!required?'SKIPPED: real PDFs missing/unreadable in '+fixtureDir+'; no synthetic substitution.':false},async t=>{
 check(!unavailable.length,'BLOCKED: supply both actual private PDF fixtures in '+fixtureDir+'; no synthetic substitution.');
 const tracked=execFileSync('git',['ls-files','--','*.pdf','*.PDF','tests/fixtures/private-sourcebooks'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);check(!tracked.some(path=>/Forbidden_Lands_.*\.pdf$/i.test(path)||path.includes('private-sourcebooks/')&&!path.endsWith('/README.md')),'Licensed fixture or extraction artifact is tracked by Git');
 const dir=mkdtempSync(join(tmpdir(),'ravenland-real-pdf-tests-')),filename=join(dir,'isolated.sqlite'),storage=new FileSourcebookStorage(join(dir,'private-books'));let repo:SqliteCampaignRepository|undefined;const report:{directFTS:unknown[];sources:unknown[];checks:unknown[];pagination:unknown[];limitations:string[]}={directFTS:[],sources:[],checks:[],pagination:[],limitations:[]},previousMode=process.env.RAVENLAND_AI_MODE;
 try{
  repo=new SqliteCampaignRepository(filename);const campaign=repo.create(structuredClone(initialSession)),id=campaign.id,ids:string[]=[];
  for(let i=0;i<files.length;i++){const bytes=readFileSync(join(fixtureDir,files[i]));check(bytes.subarray(0,5).toString()==='%PDF-','Fixture is not a PDF: '+files[i]);const library=new SourcebookLibrary(repo,storage),doc=(await library.upload(id,{title:i===0?"Forbidden Lands Player's Handbook":"Forbidden Lands Gamemaster's Guide",category:'Rules',visibility:i===0?'Public Rules':'GM Only'},files[i],new ReadableStream({start(c){c.enqueue(bytes);c.close()}}))).document,indexed=await library.index(id,doc.id),chunks=Number(repo.db.prepare('SELECT COUNT(*) AS n FROM source_chunks WHERE document_id=?').get(doc.id)?.n),postings=Number(repo.db.prepare('SELECT COUNT(*) AS n FROM source_search_docsize f JOIN source_chunks c ON c.rowid=f.id WHERE c.document_id=?').get(doc.id)?.n);check(indexed.status==='Indexed'&&indexed.processedPages===indexed.pageCount,'Real extraction/indexing did not complete: '+files[i]);check(indexed.pageCount===(i===0?212:268),'Unexpected fifth-printing page count: '+files[i]);check(chunks>0&&chunks===postings,'Real FTS postings do not cover stored chunks');ids.push(doc.id);report.sources.push({file:files[i],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceId:doc.id,visibility:indexed.visibility,pages:indexed.pageCount,chunks,postings});t.diagnostic(JSON.stringify({file:files[i],status:indexed.status,pages:indexed.pageCount,chunks}));}
  repo.close();repo=new SqliteCampaignRepository(filename);const db=repo,library=new SourcebookLibrary(db,storage),before=digest({campaign:db.get(id)!.session.campaign,characters:db.get(id)!.session.characters,journal:db.get(id)!.session.journal,dayTracker:db.get(id)!.session.dayTracker}),permissionBefore=digest(db.db.prepare('SELECT id,visibility FROM source_documents ORDER BY id').all());check(Number(db.db.prepare('SELECT COUNT(*) AS n FROM curated_rules').get()?.n)===0,'PDF regression must not depend on curated summaries');
  for(const [query,expectedPage] of [['Hunter',29],['Longbow',107],['Ready Weapon Aim Shoot',102],['Fighter',28]] as const){const hits=library.search({campaignId:id,documentId:ids[0],query},'player',40);check(hits.some(p=>p.startPage===expectedPage),'Real raw FTS does not contain expected page for '+query);report.directFTS.push({query,hits:hits.length,pages:[...new Set(hits.map(p=>p.startPage))]});}
  function run(name:string,question:string,pages:number[],extra?:(r:ReturnType<typeof retrieveRules>)=>void){const r=retrieveRules(db,id,question,'chat',{diagnostics:true}),raw=library.search({campaignId:id,documentId:ids[0],query:question},'player',40);for(const page of pages)check(r.passages.some(p=>p.documentId===ids[0]&&p.startPage===page),'Real evidence missing for '+name+' at physical PDF p. '+page);check(r.passages.every(p=>p.documentId!==ids[1]),'GM-only source entered '+name);check(r.estimatedTokens<=r.budgetTokens,'Context budget exceeded for '+name);for(const c of citationsFor(r))check(!!db.db.prepare('SELECT 1 FROM source_chunks WHERE id=? AND document_id=? AND start_page=?').get(c.chunkId,c.documentId,c.startPage),'Citation is not a real stored passage: '+name);extra?.(r);report.checks.push({name,status:'PASS',intent:r.planner?.plan.intent,profile:r.planner?.plan.profile,rawHits:raw.length,rawPages:raw.slice(0,8).map(p=>p.startPage),selected:r.passages.map(p=>({sourceId:p.documentId,chunkId:p.chunkId,physicalPage:p.startPage})),missing:r.planner?.missingTopics,targetedRetries:r.planner?.targetedRetries,retriedRequirements:r.planner?.retriedRequirements,searches:r.audit?.searches?.map(q=>({stage:q.stage,query:q.query,pages:[...new Set(q.hits.map(h=>h.physicalPage))]})),mechanical:r.mechanicalFacts?{attackSuccesses:r.mechanicalFacts.request.attackSuccesses,allocatedDamageSuccesses:r.mechanicalFacts.request.damageSuccesses,inputIssues:r.mechanicalFacts.request.inputIssues,hitThreshold:r.mechanicalFacts.firstHit.value,thresholdStatus:r.mechanicalFacts.firstHit.status,extraDamage:r.mechanicalFacts.extraDamage.value,calculation:r.mechanicalFacts.calculation,hitEvidence:r.mechanicalFacts.firstHit.evidence.map(e=>({sourceId:e.documentId,chunkId:e.chunkId,physicalPage:e.physicalPage}))}:undefined});return r}
  await t.test('Hunter profession: actual key attribute and five skills',()=>{run('Hunter',"What is the Hunter profession's key attribute and five skills?",[29],r=>{const text=r.passages.find(p=>p.startPage===29)!.text;check(/KEY ATTRIBUTE:\s*Agility/i.test(text),'Hunter attribute not present in selected real entry');check(/SKILLS:\s*Stealth,\s*Move,\s*Marksmanship,\s*Scouting,\s*Survival/i.test(text),'Actual five Hunter skills not present together');})});
  const explicit="Using the official Player's Handbook PDF, find the Hunter profession description on printed page 25. Identify its key attribute and five listed skills. Do not use curated rules summaries.";
  await t.test('Explicit handbook and printed-page request stays bound to the original PDF',()=>{run('Hunter explicit',explicit,[29],r=>{check(r.planner?.plan.sourcePreference==='pdf_only','Explicit original-source constraint lost');check(r.planner?.plan.pageReference?.kind==='printed'&&r.planner.plan.pageReference.value===25,'Printed reference lost');check(r.passages.every(p=>p.documentId===ids[0]),'Curated/other source substituted for handbook');})});
  await t.test('Longbow: actual ranged table and Grip column',()=>{run('Longbow ratings',"What are the Longbow's Gear Bonus, Damage, and Range?",[107],r=>{const fields=r.mechanicalFacts?.weapons[0].fields;check(fields?.gearBonus.value===2&&fields.damage.value===1&&fields.range.value==='Long','Actual Longbow ratings were not read from its table');})});
  await t.test('Longbow damage: both equipment table and actual extra-success procedure',()=>{run('Longbow damage','How much damage does a Longbow inflict with three successes?',[107,102],r=>{check(r.mechanicalFacts?.weapons[0].fields.damage.value===1,'Real weapon Damage input missing');check(r.mechanicalFacts?.extraDamage.status==='verified'&&r.mechanicalFacts.extraDamage.value===1,'Real ranged damage procedure missing');check(r.mechanicalFacts?.firstHit.status==='verified'&&r.mechanicalFacts.firstHit.value===1,'Actual hit threshold is not verified');check(r.mechanicalFacts!.calculation.status==='verified'&&r.mechanicalFacts!.calculation.damage===3,'Real three-success calculation is not verified')});});
  await t.test('Ready Weapon, Aim and Shoot: real labeled procedures, not contents/index',()=>{run('Ranged action sequence','Explain Ready Weapon, Aim, and Shoot in ranged combat.',[101,102],r=>{for(const label of ['READY\\s+WEAPON','AIM','SHOOT'])check(r.passages.some(p=>new RegExp('\\b'+label+'\\s*:\\s*(?:Fast|Slow)\\s+action','i').test(p.text)),'Actual action definition missing: '+label);check(r.planner?.coverage.every(c=>c.status==='covered'),'Named action coverage is incomplete');})});
  await t.test('PDF fallback without a Markdown profession summary',()=>{run('Fighter fallback',"What is the Fighter profession's key attribute?",[28],r=>check(r.passages.some(p=>/^FIGHTER\s*$/m.test(p.text)),'Fighter entry body heading not found'));});
  await t.test('GM-only real Guide is indexed but excluded from all player paths',()=>{const query='weather',admin=library.search({campaignId:id,documentId:ids[1],query},'admin',20),player=library.search({campaignId:id,documentId:ids[1],query},'player',20);check(admin.length>0,'Real Guide query did not exercise private indexed content');check(player.length===0,'Private real Guide passages leaked through raw player search');const r=retrieveRules(db,id,'Explain the rules for weather.','chat',{diagnostics:true});check(!r.passages.some(p=>p.documentId===ids[1]),'Private Guide selected by planner');check(!JSON.stringify(r).includes(ids[1]),'Private Guide metadata leaked into player retrieval');report.checks.push({name:'GM-only Guide security',status:'PASS',privateIndexHits:admin.length,playerHits:player.length});});
  await t.test('Final provider context receives selected real Hunter evidence and valid citations',async()=>{process.env.RAVENLAND_AI_MODE='openai';let calls=0;const provider:GMProvider={async generate(input){calls++;const ctx=input as {context:{rules:ReturnType<typeof retrieveRules>}};check(ctx.context.rules.passages.some(p=>p.documentId===ids[0]&&p.startPage===29),'Real Hunter evidence did not reach provider boundary');check(!ctx.context.rules.passages.some(p=>p.documentId===ids[1]),'Private Guide reached provider');return {provider:'openai',model:'context-capture-only',inputTokens:0,outputTokens:0,output:{narration:'Integration check: reference context received.',actions:[],memoryProposals:[],selectedImageId:null}}},async test(){return {model:'context-capture-only',inputTokens:0,outputTokens:0}}};const requestId=randomUUID(),reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId,kind:'chat',action:explicit});check(calls===1,'Provider-boundary check did not execute');check(reply.sources?.some(s=>s.documentId===ids[0]&&s.startPage===29),'Final citation lost real PDF evidence');report.checks.push({name:'Final provider context',status:'PASS',sources:reply.sources?.map(s=>({sourceId:s.documentId,chunkId:s.chunkId,physicalPage:s.startPage}))});});
  for(const [successes,damage] of [['three',3],['one',1],['zero',0]] as const){
   await t.test('Real Longbow attack with '+successes+' successes: evidence, calculation and final reply',async()=>{
    const question='A character fires a Longbow and rolls '+successes+' successes. How much damage does the attack inflict before armor?';
    const r=run('Ordinary Longbow '+successes,question,[107,102,46]),facts=r.mechanicalFacts!;
    check(facts.firstHit.status==='verified'&&facts.firstHit.value===1,'Real attack threshold missing');
    check(facts.extraDamage.status==='verified'&&facts.weapons[0].fields.damage.status==='verified','Mechanical inputs missing');
    check(facts.calculation.status==='verified'&&facts.calculation.damage===damage,'Incorrect real attack damage');
    check(facts.calculation.hit===(damage>0),'Incorrect hit/miss classification');
    check((r.planner?.targetedRetries??0)<=1,'Targeted retry limit exceeded');
    for(const e of [...facts.firstHit.evidence,...facts.extraDamage.evidence,...facts.weapons[0].fields.damage.evidence]){
     check(r.passages.some(p=>p.chunkId===e.chunkId&&p.text.replace(/\s+/g,' ').includes(e.quote.replace(/\s+/g,' '))),'Mechanical input citation is not selected source evidence');
    }
    check(facts.firstHit.evidence.some(e=>e.physicalPage===46)&&facts.firstHit.evidence.some(e=>e.physicalPage===102),'Threshold lacks general rule or attack-roll link');
    process.env.RAVENLAND_AI_MODE='openai';let calls=0;
    const provider:GMProvider={async generate(){calls++;throw Error('Reference answer must not call AI')},async test(){throw Error('No external calls')}};
    const reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId:randomUUID(),kind:'chat',action:question});
    check(calls===0&&reply.provider==='application'&&!reply.actions.length,'Reference calculation called AI or proposed state changes');
    check(reply.narration.includes(damage===0?'no hit, 0 damage before armor':'= '+damage+' damage before armor'),'Verified result missing from final answer');
    for(const page of [107,102,46])check(reply.sources?.some(c=>c.documentId===ids[0]&&c.startPage===page),'Final answer lost a mechanical citation');
   });
  }
  await t.test('Player-supplied counts and allocations survive the real-PDF pipeline and final streamed replies',async()=>{
   process.env.RAVENLAND_AI_MODE='openai';const provider:GMProvider={async generate(){throw Error('No model call for verified reference calculations')},async test(){throw Error('No model call')}};
   for(const c of playerInputCases){
    const r=run('Player inputs: '+c.name,c.question,[107,102,46]),facts=r.mechanicalFacts!,requestId=randomUUID();
    check(weaponRequest(c.question)?.attackSuccesses===c.attack,'Extraction changed player count: '+c.name);
    check(r.planner?.plan.weaponFacts?.attackSuccesses===c.attack&&facts.request.attackSuccesses===c.attack,'Planner or validator changed player count: '+c.name);
    check(facts.firstHit.value===1&&facts.calculation.additionalSuccesses===Math.max(0,c.attack-1),'Hit requirement confused with rolled successes');
    check(facts.calculation.status==='verified'&&facts.calculation.damageSuccesses===c.allocated&&facts.calculation.damage===c.damage,'Damage allocation or calculation changed player input');
    let stream='';const reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId,kind:'chat',action:c.question},e=>{if(e.type==='text')stream+=e.text});
    check(reply.provider==='application'&&!reply.actions.length&&reply.narration===stream,'Final reply and streamed answer differ');
    check(reply.narration.includes('With '+c.attack+' attack successes'),'Final answer changed player successes');
    check(reply.narration.includes(c.damage===0?'no hit, 0 damage before armor':'= '+c.damage+' damage before armor'),'Final answer damage is incorrect');
    if(c.allocated!==Math.max(0,c.attack-1))check(reply.narration.includes(c.allocated+' of the '+Math.max(0,c.attack-1)+' additional successes'),'Partial allocation not explained');
    const row=db.db.prepare('SELECT payload,context_json FROM ai_requests WHERE campaign_id=? AND id=?').get(id,requestId)!;
    check(JSON.parse(row.payload as string).action===c.question,'Request parsing changed original question');
    check(JSON.parse(row.context_json as string).rules.mechanicalFacts.request.attackSuccesses===c.attack,'Saved context changed player successes');
    for(const page of [46,102,107])check(reply.sources?.some(s=>s.documentId===ids[0]&&s.startPage===page),'Final answer lost mechanical evidence');
   }
  });
  await t.test('Bare roll reports preserve supplied numbers and request the missing weapon',async()=>{
   const provider:GMProvider={async generate(){throw Error('No model call')},async test(){throw Error('No model call')}};
   for(const action of ['I rolled three successes.','I rolled 3 successes.','I rolled three sixes.']){
    const reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId:randomUUID(),kind:'chat',action});
    check(reply.narration.includes('supplied 3 successes')&&reply.narration.includes('Which weapon'),'Missing weapon was invented or supplied count changed');
   }
  });
  await t.test('Missing/ambiguous player inputs remain unverified despite complete real rules',async()=>{
   const provider:GMProvider={async generate(){throw Error('No model call')},async test(){throw Error('No model call')}};
   for(const action of ['How much Longbow damage?','How much Longbow damage with three or four successes?','Longbow: three successes, but I spend four extra successes on damage. How much damage?']){
    const r=retrieveRules(db,id,action,'chat');check(r.mechanicalFacts?.calculation.status==='unverified','Player input was silently defaulted or clamped');
    const reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId:randomUUID(),kind:'chat',action});
    check(/clarify/i.test(reply.narration)&&reply.narration.includes('unverified'),'Final reply did not qualify missing or ambiguous input');
   }
  });
  await t.test('Real Heavy Crossbow reuses the evidenced hit rule without a Longbow special case',async()=>{
   const r=run('Heavy Crossbow damage','How much damage does a Heavy Crossbow inflict with three successes?',[107,102,46]),facts=r.mechanicalFacts!;
   check(facts.weapons[0].fields.damage.status==='verified'&&facts.firstHit.status==='verified','Crossbow source inputs missing');
   check(facts.calculation.status==='verified'&&facts.calculation.damage===Number(facts.weapons[0].fields.damage.value)+2*Number(facts.extraDamage.value),'Crossbow calculation did not reuse source-based rules');
   const provider:GMProvider={async generate(){throw Error('No model call')},async test(){throw Error('No model call')}};
   const reply=await new AIService(db,provider).run({campaignId:id,characterId:db.get(id)!.session.characters[0].id,requestId:randomUUID(),kind:'chat',action:'For a Heavy Crossbow attack: I rolled three sixes. How much damage before armor?'});
   check(reply.narration.includes('With 3 attack successes')&&reply.narration.includes('= '+facts.calculation.damage+' damage before armor'),'Crossbow final answer changed supplied successes or weapon rating');
  });
  await t.test('One targeted retry recovers the real threshold after a controlled initial candidate omission',()=>{
   const search=SourcebookLibrary.prototype.search;
   SourcebookLibrary.prototype.search=function(input,scope,limit){
    const hits=search.call(this,input,scope,limit);
    // Withhold only the initial candidate; the targeted query still uses real FTS.
    return (input as {query:string}).query==='sixes succeed success action'?hits:hits.filter(p=>p.documentId!==ids[0]||p.startPage!==46);
   };
   try{
    const r=run('Targeted threshold recovery','A character fires a Longbow and rolls three successes. How much damage does the attack inflict before armor?',[107,102,46]);
    check(r.mechanicalFacts?.calculation.status==='verified'&&r.mechanicalFacts.calculation.damage===3,'Targeted real evidence did not restore calculation');
    check(r.planner?.targetedRetries===1&&r.planner.retriedRequirements.includes('first-hit'),'Missing threshold did not use the bounded retry');
    const queries=r.audit?.searches?.filter(s=>s.stage==='targeted'&&s.query==='sixes succeed success action');
    check(queries?.length===1&&queries[0].hits.some(h=>h.documentId===ids[0]&&h.physicalPage===46),'Targeted FTS did not return the actual threshold passage');
   }finally{SourcebookLibrary.prototype.search=search}
  });
  await t.test('Missing real threshold evidence retains an unverified answer after one bounded retry',()=>{
   // Model an incomplete authorized index in this disposable fixture, then restore it.
   db.db.exec('SAVEPOINT missing_threshold');
   try{
    db.db.prepare('DELETE FROM source_chunks WHERE document_id=? AND start_page=46').run(ids[0]);
    const r=run('Missing threshold','A character fires a Longbow and rolls three successes. How much damage does the attack inflict before armor?',[107,102]);
    check(r.mechanicalFacts?.weapons[0].fields.damage.status==='verified'&&r.mechanicalFacts.extraDamage.status==='verified','Missing-evidence test lost unrelated mechanical inputs');
    check(r.mechanicalFacts!.firstHit.status==='missing'&&r.mechanicalFacts!.calculation.status==='unverified','Missing threshold was assumed');
    check(r.planner?.targetedRetries===1&&r.planner.retriedRequirements.includes('first-hit'),'Missing rule did not receive one bounded retry');
    check(r.audit?.searches?.filter(s=>s.stage==='targeted'&&s.query==='sixes succeed success action').length===1,'Missing threshold retrieval repeated or absent');
    check(groundedWeaponAnswer(r)?.includes('numerical damage result remains unverified'),'Missing evidence no longer produces the safe response');
   }finally{db.db.exec('ROLLBACK TO missing_threshold; RELEASE missing_threshold')}
  });
  await t.test('Authorized character preparation uses real official skill, attribute, weapon and pool evidence without writes',async()=>{
   db.db.exec('SAVEPOINT character_preparation');
   try{
    const record=db.get(id)!,actor=record.session.characters[0];
    actor.sheet={'attr-agility':'3','attr-agility-regular':'4','skill-marksmanship':'2','cond-hungry':false,'cond-thirsty':false,'cond-sleepy':false,'cond-cold':false,talents:[],weapons:[{name:'Longbow',bonus:'2',dmg:'1',range:'Long',skill:'marksmanship',artifact:'None',equipped:true}],'dark-secret':'NEVER_EXPOSE_CHARACTER_SECRET'};
    db.update(id,record.revision,record.session);
    const principal={playerId:'real-fixture-owner',grants:[{campaignId:id,characterIds:[actor.id]}]},changes=db.db.prepare('SELECT total_changes() AS n').get()!.n;
    const p=prepareAction(db,{campaignId:id,characterId:actor.id,declaration:'I shoot the bandit with my longbow.'},principal);
    check(p.status==='ready','Real preparation missing: '+p.missing.join('; '));
    check(p.basePool?.base===3&&p.basePool.skill===2&&p.basePool.gear===2&&p.basePool.total===7,'Real character pool is incorrect');
    check(p.ruleInputs.skill==='marksmanship'&&p.ruleInputs.attribute==='agility'&&p.ruleInputs.poolRuleVerified,'Real skill/attribute/pool evidence is missing');
    check(!JSON.stringify(p).includes('NEVER_EXPOSE'),'Character secret entered proposal');
    check(db.db.prepare('SELECT total_changes() AS n').get()!.n===changes,'Preparation wrote database state');
    report.checks.push({name:'Authorized character Longbow preparation',status:'PASS',basePool:p.basePool,ruleInputs:p.ruleInputs,sourcePages:p.sources.map(s=>s.startPage),evidence:p.evidence.map(e=>({kind:e.kind,chunkId:e.chunkId,physicalPage:e.physicalPage})),databaseWrites:0});

   }finally{db.db.exec('ROLLBACK TO character_preparation; RELEASE character_preparation')}
  });
  await t.test('A real-PDF Longbow declaration requests its verified roll without an Equipped flag or mechanical state changes',async()=>{
   const original=db.get(id)!.session.characters;
   const r=db.get(id)!,actor=r.session.characters[0];actor.sheet={'attr-agility':'3','attr-agility-regular':'4','skill-marksmanship':'2','cond-hungry':false,'cond-thirsty':false,'cond-sleepy':false,'cond-cold':false,talents:[],weapons:[{name:'Longbow',bonus:'2',skill:'marksmanship',artifact:'None'}],'dark-secret':'NEVER_EXPOSE_CHARACTER_SECRET','res-arrows':'12'};db.update(id,r.revision,r.session);
   const principal={playerId:'real-fixture-owner',grants:[{campaignId:id,characterIds:[actor.id]}]};
   try{
    const mechanicalBefore=JSON.stringify({...db.get(id)!.session,messages:[]}),requestId=randomUUID();
    const reply=await new AIService(db,{async generate(){throw Error('A declaration must await its submitted roll, not call the narrator')},async test(){throw Error('No paid API call')}},principal).run({campaignId:id,characterId:actor.id,requestId,kind:'chat',action:'I shoot the bandit with my longbow.'});
    const ctx=JSON.parse(db.db.prepare('SELECT context_json FROM ai_requests WHERE campaign_id=? AND id=?').get(id,requestId)!.context_json as string);
    check(ctx.actionPreparation.basePool.total===7,'Real pool did not reach the saved declaration');check(ctx.retrievalContext.actor.attributes.agility.current===3,'Actual current Agility was lost');check(ctx.retrievalContext.actor.story.darkSecret==='NEVER_EXPOSE_CHARACTER_SECRET','Party-known character background was omitted');
    check(reply.provider==='application'&&reply.narration.includes('Roll Marksmanship')&&reply.narration.includes('Submit to GM')&&reply.narration.includes('= 7 dice'),'Verified preparation did not request the existing roll workflow');check(JSON.stringify({...db.get(id)!.session,messages:[]})===mechanicalBefore,'Declaration modified mechanical campaign state');
    report.checks.push({name:'Real Longbow declaration safeguard without Equipped',status:'PASS',basePool:7,mechanicalStateUnchanged:true});
   }finally{const current=db.get(id)!;current.session.characters=original;db.update(id,current.revision,current.session)}
  });
  await t.test('A verified submitted roll reaches the provider with actual successes and official ranged PDF evidence, without resolving mechanics',async()=>{
   const actor=db.get(id)!.session.characters[0],rollId=randomUUID();executeDice({campaignId:id,actionId:randomUUID(),type:'create',roll:{id:rollId,characterId:actor.id,skill:'Marksmanship',attribute:[6,2],skillDice:[6],gear:[],artifacts:[],negativeSkill:false,successes:2,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null},metadata:{attribute:'agility',isArmor:false,weaponIndex:null,weaponDamage:null}},db);
   const card=db.get(id)!.session.dice!.find(c=>c.id===rollId)!,beforeRoll=db.get(id)!.session,principal={playerId:'real-roll-owner',grants:[{campaignId:id,characterIds:[actor.id]}]};let captured=false;let pages:number[]=[];
   const reply=await new AIService(db,{async generate(input){const ctx=(input as any).context;check(ctx.rollSubmission.successes===2,'Saved successes were lost at provider boundary');check(ctx.rollSubmission.optionalSuccessAllocation===null,'Optional successes were allocated automatically');check(ctx.rules.passages.some((p:any)=>p.documentId===ids[0]&&p.startPage===102),'Official ranged attack procedure was not retrieved for submitted dice');check(!ctx.rules.passages.some((p:any)=>p.documentId===ids[1]),'Private Guide reached submitted-roll provider');pages=ctx.rules.passages.map((p:any)=>p.startPage);captured=true;return {provider:'openai' as const,model:'verified-roll-context-capture',inputTokens:0,outputTokens:0,output:{narration:'The recorded shot result is ready for interpretation. Choose any optional effect.',actions:[],memoryProposals:[],selectedImageId:null}}},async test(){throw Error('No paid API call')}},principal).run({campaignId:id,requestId:rollRequestId(id,rollId),kind:'roll',action:'',characterId:actor.id,rollId,rollFingerprint:savedRollFingerprint(card)});
   const afterRoll=db.get(id)!.session;check(captured&&reply.actions.length===0,'Verified dice did not reach narration-only pipeline');check(JSON.stringify(afterRoll.characters)===JSON.stringify(beforeRoll.characters)&&JSON.stringify(afterRoll.campaign)===JSON.stringify(beforeRoll.campaign)&&JSON.stringify(afterRoll.journal)===JSON.stringify(beforeRoll.journal),'Dice narration changed character/campaign mechanics');report.checks.push({name:'Verified dice submission with real ranged rules',status:'PASS',successes:2,optionalSuccessAllocation:null,sourcePages:pages,mechanicalStateUnchanged:true});
  });
  await t.test('Printed-page evidence is observed from the original file, never a hardcoded offset',async()=>{await extractPDF(join(fixtureDir,files[0]),()=>{},(page,_text,evidence)=>{if([29,46,101,102,107].includes(page))report.pagination.push({physicalPage:page,pdfPageLabel:evidence?.pageLabel??null,observedFooterLabels:evidence?.footerLabels??[]})});for(const [physical,printed] of [[29,'25'],[46,'42'],[107,'103']] as const)check(report.pagination.some(value=>{const p=value as {physicalPage:number;pdfPageLabel:string|null;observedFooterLabels:string[]};return p.physicalPage===physical&&(p.pdfPageLabel===printed||p.observedFooterLabels.includes(printed))}),'Printed footer not verified on real physical page '+physical);});
  check(digest({campaign:db.get(id)!.session.campaign,characters:db.get(id)!.session.characters,journal:db.get(id)!.session.journal,dayTracker:db.get(id)!.session.dayTracker})===before,'Live/mechanical campaign state changed');check(digest(db.db.prepare('SELECT id,visibility FROM source_documents ORDER BY id').all())===permissionBefore,'Source visibility changed during real tests');
  t.diagnostic('REAL_SOURCEBOOK_REPORT '+JSON.stringify(report));
 }finally{repo?.close();rmSync(dir,{recursive:true,force:true});if(previousMode===undefined)delete process.env.RAVENLAND_AI_MODE;else process.env.RAVENLAND_AI_MODE=previousMode;check(!existsSync(dir),'Temporary real-sourcebook database was not cleaned up');}
});
