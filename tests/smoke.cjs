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
   const response=await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8000')+'/'+encodeURIComponent(name));
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
    await page.locator('#attr-strength-regular').fill('4');
    await page.locator('#attr-strength-regular').blur();
    await page.locator('#damage-strength button').first().click();

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
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'4');
   assert.equal(await page.locator('#willpower').inputValue(),'1');
   await page.setViewportSize({width:1440,height:900});
   const sheet = await page.locator('main').boundingBox();
   const pane = await page.locator('#dice-panel').boundingBox();
   assert.ok(pane.x >= sheet.x + sheet.width, 'Dice pane is beside the sheet');
   await page.locator('#gear-table').scrollIntoViewIfNeeded();
   assert.ok((await page.locator('#dice-panel').boundingBox()).y >= 0, 'Dice pane stays visible while scrolling');
   let weapon = page.locator('#weapons-table tbody tr').first();
   await weapon.locator('.w-preset').selectOption({label:'Broadsword'});
   assert.equal(await weapon.locator('.w-name').inputValue(),'Broadsword');
   assert.equal(await weapon.locator('.w-dmg').inputValue(),'2');
   await weapon.locator('.w-preset').selectOption({label:'Short bow'});
   assert.equal(await weapon.locator('.w-skill').inputValue(),'marksmanship');
   await page.locator('#attr-agility-regular').fill('5');
   await page.locator('#attr-agility-regular').blur();
   await page.locator('#damage-agility button').first().click();
   await page.locator('#skill-marksmanship').fill('2');
   await weapon.locator('.btn-roll').click();
   assert.equal(await page.locator('#dice-results .die').count(),8);
   await weapon.locator('.w-name').fill('My custom bow');
   await weapon.locator('.w-bonus').fill('3');
   await weapon.locator('.w-feat').fill('Custom features');
   await page.reload();
   weapon = page.locator('#weapons-table tbody tr').first();
   assert.equal(await weapon.locator('.w-name').inputValue(),'My custom bow');
   assert.equal(await weapon.locator('.w-bonus').inputValue(),'3');
   assert.equal(await weapon.locator('.w-feat').inputValue(),'Custom features');
   assert.equal(await weapon.locator('.w-skill').inputValue(),'marksmanship');
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'4');
   assert.equal(await page.locator('#attr-strength').inputValue(),'2');
   await page.locator('#skill-might').fill('0');
   await page.locator('#skills-list .btn-roll').first().click();
   assert.equal(await page.locator('#dice-results .die').count(),2, 'Roll uses damaged current attribute');
   // Force rolls to the minimum, then maximum, without changing production randomness.
   await page.evaluate(()=>{window.savedRandom = Math.random; Math.random = () => 0;});
   for (const resource of ['food','water','arrows','torches']) {
    await page.locator('#res-' + resource).selectOption('D12');
    for (const next of ['D10','D8','D6','None']) {
     await page.getByRole('button',{name:'Roll ' + resource,exact:true}).click();
     assert.equal(await page.locator('#res-' + resource).inputValue(),next);
     assert.equal(await page.locator('#btn-push').isVisible(),false);
    }
    await page.getByRole('button',{name:'Roll ' + resource,exact:true}).click();
    assert.match(await page.locator('#dice-summary').textContent(),/no resource die/);
    assert.equal(await page.locator('#dice-results .die').count(),0);
   }
   await page.evaluate(()=>{Math.random=()=>0.999;});
   await page.locator('#res-food').selectOption('D8');
   await page.getByRole('button',{name:'Roll food',exact:true}).click();
   assert.equal(await page.locator('#res-food').inputValue(),'D8');
   assert.match(await page.locator('#dice-summary').textContent(),/rolled 8.*Keep D8/);
   await page.evaluate(()=>{Math.random = window.savedRandom;});
   await page.reload();
   assert.equal(await page.locator('#res-food').inputValue(),'D8');
   assert.equal(await page.locator('#res-water').inputValue(),'None');
   const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Export JSON'}).click();
   await (await download).saveAs(backup);
   await page.locator('#import-file').setInputFiles(backup);
   await page.waitForFunction(()=>document.querySelectorAll('#character-select option').length===3);
   assert.equal(await page.locator('#name').inputValue(),'Onboarding Adventurer');
   assert.equal(await page.locator('#weapons-table .w-name').first().inputValue(),'My custom bow');
   assert.equal(await page.locator('#weapons-table .w-skill').first().inputValue(),'marksmanship');
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'4');
   assert.equal(await page.locator('#attr-strength').inputValue(),'2');
   await page.getByRole('button',{name:'Increase strength',exact:true}).click();
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'5');
   assert.equal(await page.locator('#attr-strength').inputValue(),'3');
   assert.equal(await page.locator('#damage-strength [aria-pressed=true]').count(),2);
   await page.locator('#damage-strength button').first().click();
   assert.equal(await page.locator('#attr-strength').inputValue(),'5');
   await page.locator('#damage-strength button').last().click();
   assert.match(await page.locator('#current-strength').textContent(),/Current 0.*Broken/);
   await page.reload();
   await page.locator('#character-select').selectOption({index:2});
   assert.equal(await page.locator('#damage-strength [aria-pressed=true]').count(),5);
   await page.getByRole('button',{name:'Decrease strength',exact:true}).click();
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'4');
   assert.equal(await page.locator('#attr-strength').inputValue(),'0');
   // Legacy backups gain a regular value without overwriting their current value.
   await page.evaluate(()=>{const id='legacy';app.roster[id]={name:'Legacy', 'attr-strength':'3'};app.activeCharId=id;app.loadCharacter(id);});
   assert.equal(await page.locator('#attr-strength-regular').inputValue(),'3');
   assert.equal(await page.locator('#attr-strength').inputValue(),'3');
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>window.scrollTo(0,0));
   assert.ok((await page.locator('#dice-panel').boundingBox()).y < (await page.locator('main').boundingBox()).y);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'No page overflow on mobile');
   await page.emulateMedia({media:'print'});
   assert.equal(await page.locator('#dice-panel').isVisible(),false);
   await page.emulateMedia({media:'screen'});
   assert.ok(await page.locator('#name').isVisible());
   assert.deepEqual(errors,[]);
   console.log('PASS roster switching, quoted text, pushed banes, weapon presets and overrides, ranged attacks, JSON export/import, sidebar, resource depletion and persistence, regular/current attributes, legacy imports, mobile, print');
   await context.close();
  }
 } finally {await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
