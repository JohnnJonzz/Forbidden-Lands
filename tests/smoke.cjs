const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'forbidden-sheet-'));
const backup=path.join(temp,'character.json');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  for(const name of ['index.html']) {
   const context=await browser.newContext(); const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto('http://127.0.0.1:8000/'+encodeURIComponent(name));
   assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/text\/html/);
   assert.match(await page.title(),/Forbidden Lands/);
   assert.equal(await page.locator('[id^="skill-"]').count(),16);
   await page.locator('#name').fill('Onboarding Adventurer'); await page.locator('#name').blur();
   const rows=await page.locator('#gear-table tbody tr').count();
   await page.getByRole('button',{name:'+ Add Gear',exact:true}).click();
   assert.equal(await page.locator('#gear-table tbody tr').count(),rows+1);
   await page.locator('#gear-table tbody tr').last().locator('input').first().fill('Rope');
   await page.locator('#gear-table tbody tr').last().locator('input').first().blur();
   await page.reload();
   assert.equal(await page.locator('#name').inputValue(),'Onboarding Adventurer');
   assert.equal(await page.locator('#gear-table tbody tr').last().locator('input').first().inputValue(),'Rope');
   if(name==='index.html'){
    await page.locator('#attr-strength').fill('3');
    await page.locator('#attr-strength').blur();
    await page.locator('#skills-list .btn-roll').first().click();
    assert.ok((await page.locator('#dice-results').textContent()).trim().length>0);
    await page.getByRole('button',{name:'+ New',exact:true}).click();
    assert.equal(await page.locator('#character-select option').count(),2);
   }
   assert.deepEqual(errors,[]);console.log('PASS '+name+': HTML response, initialization, editing, gear, reload persistence'+(name==='index.html'?', dice and roster':''));
   await page.locator('#character-select').selectOption({index:0});
   assert.equal(await page.locator('#name').inputValue(),'Onboarding Adventurer');
   await page.locator('#gear-table tbody tr').last().locator('input').first().fill('A \"quoted\" <rope>');
   await page.reload();
   assert.equal(await page.locator('#gear-table tbody tr').last().locator('input').first().inputValue(),'A \"quoted\" <rope>');
   await page.evaluate(()=>{app.currentRoll={label:'Might', attribute:'strength', isPushed:false, dice:[{type:'base',value:1},{type:'base',value:6},{type:'skill',value:6}]}; document.getElementById('attr-strength').value=3;document.getElementById('willpower').value=0;app.pushRoll();});
   assert.equal(await page.locator('#attr-strength').inputValue(),'2');
   assert.equal(await page.locator('#willpower').inputValue(),'1');
   const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Export JSON'}).click();
   await (await download).saveAs(backup);
   await page.locator('#import-file').setInputFiles(backup);
   await page.waitForFunction(()=>document.querySelectorAll('#character-select option').length===3);
   assert.equal(await page.locator('#name').inputValue(),'Onboarding Adventurer');
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.locator('#name').isVisible());
   assert.deepEqual(errors,[]);
   console.log('PASS roster switching, quoted text, pushed banes, JSON export/import, mobile');
   await context.close();
  }
 } finally {await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
