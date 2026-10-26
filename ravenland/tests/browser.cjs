const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(process.env.BASE_URL||'http://127.0.0.1:3000');assert.equal(response.status(),200);
 await page.getByRole('heading',{name:'The Hollow Watch'}).waitFor();
 await page.getByLabel('Player action').fill('I inspect the wagon');await page.getByRole('button',{name:'Send action'}).click();
 await page.getByText(/small wooden box/).waitFor();assert.equal(await page.getByRole('log').locator('article').count(),5);
 await page.getByRole('button',{name:'Map',exact:true}).click();await page.getByRole('img',{name:/Illustrative hex map/}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Characters',exact:true}).click();assert.equal(await page.locator('.character-card').count(),4);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Dice Roller',exact:true}).click();await page.getByLabel('Base dice').fill('3');await page.getByLabel('Skill dice').fill('-1');await page.getByRole('button',{name:'Roll pool'}).click();assert.equal(await page.locator('.die').count(),5);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Journal',exact:true}).click();await page.getByLabel('Entry title').fill('The box');await page.getByLabel('Notes',{exact:true}).fill('A voice inside the wagon.');await page.getByRole('button',{name:'Add entry'}).click();await page.getByRole('heading',{name:'The box'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Campaign Settings',exact:true}).click();await page.getByLabel('Campaign name').fill('Our Ravenland');await page.getByLabel('Quarter day').selectOption('Night');await page.getByLabel('Journey objective').fill('Open the mysterious box.');await page.getByRole('button',{name:'Apply changes'}).click();await page.keyboard.press('Escape');assert.match(await page.locator('.objective').textContent(),/Open the mysterious box/);assert.match(await page.locator('.world-data').textContent(),/Night/);assert.match(await page.locator('.campaign-badge').textContent(),/Our Ravenland/);
 await page.screenshot({path:'/tmp/ravenland-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Toggle campaign sidebar'}).click();await page.getByRole('button',{name:'Close sidebar'}).click();await page.getByRole('button',{name:'Journal',exact:true}).click();await page.getByRole('heading',{name:'The box'}).waitFor();await page.keyboard.press('Escape');await page.screenshot({path:'/tmp/ravenland-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS desktop/mobile chat, mock response, all five panels, dice, journal, settings, focus dismissal, no page errors');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
