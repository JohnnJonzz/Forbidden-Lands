// Real sourcebooks, isolated SQLite, controlled SDK transport and dice only.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync}=require('node:fs');
const {tmpdir}=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),net=require('node:net');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder=mkdtempSync(path.join(tmpdir(),'raven-consequences-browser-'));
 const books=process.env.RAVENLAND_REAL_SOURCEBOOK_DIR||path.join(root,'tests/fixtures/private-sourcebooks'),diceFile=path.join(folder,'dice.json');
 for(const name of ['Forbidden_Lands_Players_Handbook_5th_printing.pdf','Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf'])assert.ok(existsSync(path.join(books,name)),'Actual PDF required: '+name);
 const dice=(faces)=>writeFileSync(diceFile,JSON.stringify({token:crypto.randomUUID(),value:2,faces}));dice([]);
 const env={...process.env,RAVENLAND_DB_PATH:path.join(folder,'db.sqlite'),RAVENLAND_REAL_SOURCEBOOK_DIR:books,RAVENLAND_PLAYER_GRANTS:'[]',RAVENLAND_AI_MODE:'openai',OPENAI_API_KEY:'CONTROLLED_TEST_ONLY',RAVENLAND_SETUP_FIDELITY_TEST:'1',RAVENLAND_ROLL_TIMING_TEST:'1',RAVENLAND_COMBAT_WORKFLOW_TEST:'1',RAVENLAND_CONSEQUENCE_TEST:'1',RAVENLAND_NARRATIVE_DICE_FILE:diceFile,RAVENLAND_AI_FIXTURE_LOG:path.join(folder,'sdk.jsonl'),NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --import='+pathToFileURL(path.join(root,'tests/fixtures/ai-provider-preload.mjs')).href+' --import='+pathToFileURL(path.join(root,'tests/fixtures/combat-narrative-random.mjs')).href};delete env.NODE_ENV;delete env.RAVENLAND_LOCAL_RUNTIME_KEY;
 const prepared=spawnSync(process.execPath,['--import','tsx','tests/fixtures/combat-workflow-setup.ts'],{cwd:root,env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 const {id,characters}=JSON.parse(prepared.stdout.trim()),actor=characters[0],healer=characters[1];
 const {SqliteCampaignRepository}=await import(pathToFileURL(path.join(root,'src/server/sqlite.ts')).href);
 const db=fn=>{const repo=new SqliteCampaignRepository(env.RAVENLAND_DB_PATH);try{return fn(repo)}finally{repo.close()}};
 const raw=()=>db(r=>{const row=r.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 1').get(id);return row?JSON.parse(row.state_json):null});
 const lethal=()=>db(r=>{const row=r.db.prepare("SELECT state_json FROM campaign_consequences WHERE campaign_id=? AND category='lethal_injury'").get(id);return row?JSON.parse(row.state_json):null});
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),url='http://127.0.0.1:'+port;
 let server,browser,page,logs='';
 async function until(fn){for(let i=0;i<500;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,80))}throw Error('Timed out: '+logs.slice(-1800))}
 const current=async()=>(await(await fetch(url+'/api/campaigns?id='+id)).json()).record;
 async function stop(){if(server&&server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>server.kill('SIGKILL'),5000);server.once('exit',()=>{clearTimeout(timer);resolve()});server.kill('SIGTERM')})}
 async function start(){server=spawn(process.execPath,['scripts/dev-local.mjs','--port',String(port)],{cwd:root,env});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);await until(async()=>{try{return(await fetch(url+'/api/player-access?campaignId='+id)).ok}catch{return false}})}
 try{
  await start();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(40000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept('Rose is an established bystander, present and able to reach Edrus safely, with an unused slow action.').catch(()=>{}));
  await page.goto(url+'/campaigns/'+id);await page.getByLabel('Player action',{exact:true}).waitFor();await until(async()=>(await current()).session.chatJourney?.forms?.length);
  const panel=page.locator('.combat-panel').filter({has:page.getByLabel('Broken cause')}),baseline=structuredClone((await current()).session.campaign);
  const idle=()=>until(async()=>await page.locator('.ai-stream').count()===0);
  async function say(text){await idle();const n=(await current()).session.messages.length;await page.getByLabel('Player action',{exact:true}).fill(text);await page.getByRole('button',{name:'Send action',exact:true}).click();await until(async()=>(await current()).session.messages.length>=n+2);await idle();return(await current()).session.messages.at(-1)}
  async function open(who=actor){await page.getByRole('button',{name:'Open '+who.name+' character sheet',exact:true}).click();const f=page.frameLocator('iframe');await f.locator('#name').waitFor();return f}
  async function close(){if(await page.getByRole('button',{name:'Close panel',exact:true}).count())await page.getByRole('button',{name:'Close panel',exact:true}).click()}
  async function roll(f,button,faces){await f.locator('body').evaluate((_e,values)=>{window.savedRandom=Math.random;let i=0;Math.random=()=>((values[i++]??2)-.5)/6},faces);const known=new Set(((await current()).session.dice??[]).map(d=>d.id));await button.click();const card=await until(async()=>(await current()).session.dice?.find(d=>!known.has(d.id)));await f.locator('body').evaluate(()=>Math.random=window.savedRandom);return card}
  async function attach(f){await until(async()=>await f.locator('#btn-attach-chat').isEnabled());await f.locator('#btn-attach-chat').click();await page.getByRole('region',{name:'Attached dice result'}).waitFor()}
  dice([1,1]);await say('Begin a new encounter within The Hollow Watch with only Edrus and one bandit armed with a sword at Arm. The bandit wants to rob Edrus.');
  await say('I end my turn.');dice([6,6,6,2,2,2,2]);await say('No defense.');assert.equal(raw().history[0].results[0].afterArmor,4);
  let f=await open();await f.getByRole('button',{name:'strength damage 4 of 4',exact:true}).click();await until(async()=>raw().combatants.find(a=>a.id===actor.id).broken);await close();
  await panel.getByLabel('Broken cause').selectOption('slash');await until(async()=>raw().combatants.find(a=>a.id===actor.id).brokenProcedures[0].stage==='roll');await idle();
  f=await open();const critical=await roll(f,f.getByRole('button',{name:'D66',exact:true}),[6,4]);await attach(f);await say('This is the saved critical injury result.');
  assert.equal(raw().status,'ended');assert.equal(raw().outcome.kind,'player_defeat');assert.equal(raw().combatants[0].brokenProcedures[0].value,64);assert.equal(lethal().state.deadline.value,null);
  const source=JSON.stringify(raw()),chars=structuredClone((await current()).session.characters);assert.equal(chars[0].sheet['attr-strength'],'0');assert.match(chars[0].sheet['critical-injuries'],/Slit throat/i);
  const ordinary=await say('What happens now?');assert.match(ordinary.text,/D6.*character sheet/);assert.match(ordinary.text,/rounds/);assert.doesNotMatch(ordinary.text,/What do you do now/);assert.equal(JSON.stringify(raw()),source);assert.equal(lethal().state.deadline.elapsed,0);
  await page.getByRole('button',{name:'Urgent consequence',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Open sheet for Injury deadline',exact:true}).waitFor();assert.equal(lethal().state.deadline.value,null);
  // Reopen the same SQLite database on an actual development-server restart.
  await page.goto('about:blank');await stop();await start();await page.goto(url+'/campaigns/'+id);await page.getByRole('button',{name:'Open sheet for Injury deadline',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open sheet for Injury deadline',exact:true}).click();f=page.frameLocator('iframe');await page.getByRole('button',{name:'Stage requested Injury deadline',exact:true}).click();const deadline=await roll(f,f.locator('#btn-roll-pool'),[5]);assert.equal(deadline.metadata.utility.kind,'Procedure');assert.deepEqual(deadline.metadata.utility.faces,[5]);await attach(f);await say('The requested injury deadline.');
  assert.equal(lethal().state.deadline.value,5);assert.equal(lethal().state.deadline.elapsed,0);assert.equal(lethal().state.deadline.rollId,deadline.id);const saved=JSON.stringify(lethal());
  const originalRequest=db(r=>JSON.parse(r.db.prepare("SELECT payload FROM ai_requests WHERE campaign_id=? AND kind='roll' ORDER BY updated_at DESC LIMIT 1").get(id).payload));
  const repeated=await page.request.post(url+'/api/gm',{data:originalRequest});assert.equal(repeated.status(),200);assert.equal(JSON.stringify(lethal()),saved);
  await page.reload();await page.getByLabel('Actual healer',{exact:true}).selectOption(healer.id);await page.getByRole('button',{name:'Act as '+healer.name,exact:true}).click();await until(async()=>await page.locator('#speaker').inputValue()===healer.id);
  await page.getByLabel('Actual healer',{exact:true}).selectOption(healer.id);await page.getByText('Treatment access / elapsed time adjudication',{exact:true}).click();await page.getByRole('button',{name:'Confirm treatment access',exact:true}).click();await until(async()=>lethal().state.sceneAccess?.healerIds.includes(healer.id));
  await page.getByRole('button',{name:'Prepare lifesaving Healing',exact:true}).click();await until(async()=>lethal().state.attempts.length===1);const attempt=lethal().state.attempts[0];assert.deepEqual(attempt.pool,{attribute:'empathy',base:3,skill:2,gear:0,modifier:-1});
  await page.getByRole('button',{name:'Open healer’s sheet',exact:true}).click();f=page.frameLocator('iframe');await page.getByRole('button',{name:'Stage requested Lifesaving Healing',exact:true}).click();const treatment=await roll(f,f.locator('#btn-roll-pool'),[6,2,2,2]);assert.equal(treatment.result.successes,1);assert.equal(treatment.procedureContext.step,'treatment');await attach(f);await say('Rose submits her lifesaving Healing result.');
  assert.equal(lethal().state.resolution,'survived_critical');assert.equal(lethal().state.attempts[0].rollId,treatment.id);assert.equal(lethal().state.attempts[0].status,'succeeded');assert.equal(lethal().state.deadline.elapsed,0);assert.equal(JSON.stringify(raw()),source);assert.deepEqual((await current()).session.characters,chars);assert.deepEqual((await current()).session.campaign,baseline);
  await say('What is the bandit doing now?');assert.match((await current()).session.messages.at(-1).text,/Broken|critical injury/);assert.deepEqual((await current()).session.characters,chars);
  const calls=readFileSync(env.RAVENLAND_AI_FIXTURE_LOG,'utf8').trim().split('\n').map(JSON.parse),contexts=calls.filter(c=>c.format==='ravenland_gm_turn').map(c=>JSON.parse(c.input.find(m=>m.role==='user').content[0].text).context);
  const handoff=contexts.find(c=>c.consequences?.focus?.patient?.sourceCritical?.value===64);assert.ok(handoff);assert.match(handoff.encounterOutcome.confirmedSetupDeclaration,/rob/);assert.equal(handoff.consequences.focus.patient.survivingNPCs.length,1);assert.ok(contexts.some(c=>c.consequences?.recentResolutions.some(r=>r.state.resolution==='survived_critical')));assert.deepEqual(errors,[]);
  console.log('PASS: actual PDFs; supported combat/critical64; urgent ordinary chat; Broken/inventory/time/NPC motive preserved; refresh and server restart; sheet D6, saved binding/replay; confirmed actual healer, source-backed Healing pool, sheet attach/Send and persistent survival without attribute recovery.');
 }catch(error){await page?.screenshot({path:'/tmp/ravenland-consequences-failure.png',fullPage:true}).catch(()=>{});throw error}finally{await browser?.close();await stop();rmSync(folder,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
