const { chromium } = require('playwright'), assert = require('node:assert/strict'), { spawn, execFileSync } = require('node:child_process'), { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs'), { tmpdir } = require('node:os'), path = require('node:path'), { pathToFileURL } = require('node:url'), { createHash, randomUUID } = require('node:crypto'), net = require('node:net');
(async () => {
    const root = path.resolve(__dirname, '..'), folder = mkdtempSync(path.join(tmpdir(), 'raven-68d-browser-')), file = path.join(folder, 'db.sqlite'), env = { ...process.env, RAVENLAND_DB_PATH: file, RAVENLAND_SOURCEBOOK_DIR: path.join(folder, 'books'), RAVENLAND_AI_MODE: 'openai', OPENAI_API_KEY: '', RAVENLAND_NARRATIVE_DICE_FILE: path.join(folder, 'dice.json'), NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + ' --import=' + pathToFileURL(path.join(__dirname, 'fixtures/combat-narrative-random.mjs')).href }, load = p => import(pathToFileURL(path.join(root, p)).href);
    writeFileSync(env.RAVENLAND_NARRATIVE_DICE_FILE, JSON.stringify({ token: randomUUID(), faces: [], value: 1 }));
    let repo, server, browser, logs = '';
    const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }), url = 'http://127.0.0.1:' + port;
    async function start(hosted = false) { server = spawn(process.execPath, hosted ? ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)] : ['scripts/dev-local.mjs', '--port', String(port)], { cwd: root, env }); server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d); for (let i = 0; i < 200; i++) {
        try {
            if ((await fetch(url)).ok)
                return;
        }
        catch { }
        await new Promise(r => setTimeout(r, 200));
    } throw Error(logs.slice(-2500)); }
    async function stop() { if (server?.exitCode === null)
        await new Promise(r => { server.once('exit', r); server.kill('SIGTERM'); }); }
    async function until(fn) { for (let i = 0; i < 200; i++) {
        if (await fn())
            return;
        await new Promise(r => setTimeout(r, 100));
    } console.log('UNSETTLED', JSON.stringify((await current()).session.messages.slice(-3)), JSON.stringify((await current()).session.dice?.slice(-1))); throw Error('State did not settle. ' + logs.slice(-2000)); }
    async function current() { return (await (await fetch(url + '/api/campaigns?id=' + campaign.id)).json()).record; }
    let campaign;
    try {
        execFileSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-map.ts'], { cwd: root, env });
        const { SqliteCampaignRepository } = await load('src/server/sqlite.ts'), { initialSession } = await load('src/lib/mock.ts'), { SourcebookLibrary } = await load('src/server/sourcebooks/library.ts'), { FileSourcebookStorage } = await load('src/server/sourcebooks/storage.ts');
        repo = new SqliteCampaignRepository(file);
        const session = structuredClone(initialSession);
        Object.assign(session.campaign, { name: 'Isolated Phase 6.8d', hex: 'U06', location: 'U06', terrain: 'Forest', date: '12th Stillfall, 1165', quarter: 'Evening', weather: 'Clear' });
        session.messages = [];
        session.journal = [];
        session.characters.forEach((c, i) => { c.name = ['Grogahx', 'Edrus', 'Elyanna', 'Rose Underbough'][i]; c.profession = i === 0 ? 'Druid' : c.profession; c.sheet = { name: c.name, kin: c.kin, profession: c.profession, ...Object.fromEntries(['strength', 'agility', 'wits', 'empathy'].flatMap(a => [[`attr-${a}`, '3'], [`attr-${a}-regular`, '3']])), pride: 'I protect my friends', 'dark-secret': 'A synthetic old regret', relationships: 'Four companions on the trail', gear: i === 0 ? [{ item: 'Supplies', weight: 'Normal', quantity: '3', itemId: randomUUID() }] : [], weapons: [], talents: i === 0 ? [{ name: 'Path of the Beast', rank: '3', type: 'P', desc: '' }] : [], 'skill-survival': '1', 'skill-scouting': '1', 'skill-marksmanship': '1', 'skill-healing': '1', willpower: '3', 'res-food': 'D8', 'res-water': 'D8', 'res-arrows': 'None', 'res-torches': 'None', 'coin-gold': '0', 'coin-silver': '0', 'coin-copper': '0' }; });
        session.characters[1].sheet.backstory = 'I was raised by the village smith and seek the lost eastern forge.';
        session.characters[1].sheet['backstory-visibility'] = 'Party Known';
        campaign = repo.create(session);
        const library = new SourcebookLibrary(repo, new FileSourcebookStorage(path.join(folder, 'books')));
        for (const [name, title] of [['Forbidden_Lands_Players_Handbook_5th_printing.pdf', 'Forbidden Lands Players Handbook'], ['Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf', 'Forbidden Lands Gamemasters Guide']]) {
            const bytes = readFileSync(path.join(process.env.RAVENLAND_REAL_SOURCEBOOK_DIR || '/tmp/ravenland-private-sourcebooks', name)), doc = await library.upload(campaign.id, { title, category: 'Rules', visibility: 'GM Only' }, name, new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }));
            await library.index(campaign.id, doc.document.id);
        }
        const hs = structuredClone(session);
        hs.campaign.name = 'Isolated Phase 6.8d Hunting';
        hs.characters[1].sheet.gear = [{ item: 'Hunting trap', quantity: '1', weight: 'Normal', itemId: randomUUID() }];
        const huntCampaign = repo.create(hs);
        repo.db.prepare('INSERT INTO campaign_sourcebooks(campaign_id,document_id) SELECT ?,id FROM source_documents WHERE campaign_id=?').run(huntCampaign.id, campaign.id);
        repo.close();
        repo = null;
        await start();
        browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }), page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error')
            console.log('BROWSER_CONSOLE_ERROR', m.text()); });
        page.setDefaultTimeout(30000);
        await page.goto(url + '/campaigns/' + campaign.id);
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        await page.getByRole('button', { name: 'Journey Settings', exact: true }).click();
        await page.getByLabel('Current in-world season').selectOption('Autumn');
        await page.getByRole('button', { name: 'Save daily settings', exact: true }).click();
        await until(async () => (await current()).session.activityState?.settings.season === 'Autumn');
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await page.getByRole('button', { name: 'Quarter-Day Activities', exact: true }).click();
        const form = page.locator('.quarter-chat-form');
        const activities = form.getByLabel('Activity', { exact: true });
        await activities.nth(0).selectOption('Forage');
        await activities.nth(1).selectOption('Make Camp');
        await activities.nth(2).selectOption('Sleep');
        await activities.nth(3).selectOption('Keep Watch');
        await form.getByRole('button', { name: 'Assign quarter-day activities', exact: true }).click();
        await page.getByRole('region', { name: 'Resolved quarter activities' }).waitFor();
        await page.getByRole('button', { name: 'Prepare Grogahx Forage', exact: true }).click();
        await until(async () => (await current()).session.activityState.entries[0].activities[0].request);
        async function sheetRoll(characterIndex, step, successes = 1, resourceValue = 3) { const ch = (await current()).session.characters[characterIndex], sheet = await context.newPage(); sheet.on('pageerror', e => errors.push(e.message)); await sheet.goto(url + '/campaigns/' + campaign.id + '/characters/' + ch.id); const frame = sheet.frameLocator('iframe'); await frame.locator('#name').waitFor(); await sheet.getByRole('button', { name: 'Stage requested ' + step, exact: true }).click(); await frame.locator('body').evaluate((_element, { successes, resourceValue }) => { let n = 0; Math.random = () => ((n++ < successes ? 6 : resourceValue) - .5) / 6; }, { successes, resourceValue }); const before = (await current()).session.dice?.length ?? 0; await frame.locator('#btn-roll-pool').click(); try {
            await until(async () => ((await current()).session.dice?.length ?? 0) > before);
        }
        catch (e) {
            console.log('ROLLDEBUG', errors, await frame.locator('body').evaluate(() => ({ summary: document.getElementById('dice-summary').textContent, push: document.getElementById('push-status').textContent, staged: app.stagedRoll, roll: app.currentRoll })), await sheet.getByRole('alert').allTextContents());
            throw e;
        } await sheet.close(); }
        await sheetRoll(1, 'camp', 1);
        await sheetRoll(0, 'forage', 2);
        await until(async () => (await current()).session.activityState.entries[0].activities.every(a => a.status === 'Resolved'));
        assert.equal((await current()).session.characters[0].sheet.gear.find(g => g.item === 'Vegetables').quantity, '2');
        await page.getByText('Ready to complete quarter-day', { exact: true }).waitFor();
        await page.screenshot({ path: path.join(root, 'docs/phase6-8d-evening-activities.png'), fullPage: true });
        await page.getByRole('button', { name: 'Complete quarter-day', exact: true }).click();
        await until(async () => (await current()).session.campaign.quarter === 'Night');
        assert.equal((await current()).session.chatJourney.updates.filter(u => u.kind === 'completed').length, 1);
        assert.ok((await current()).session.messages.some(m => m.text.includes('handling food and water')));
        console.log('CHECK native Evening complete');
        assert.equal((await current()).session.campsites[0].availability, 'active');
        await page.locator('.camp-indicator summary').filter({ hasText: 'At Camp' }).waitFor();
        await page.getByRole('button', { name: 'Quarter-Day Activities', exact: true }).click();
        let nightForm = page.locator('.quarter-chat-form');
        for (const [i, a] of ['Sleep', 'Sleep', 'Keep Watch', 'Sleep'].entries())
            await nightForm.getByLabel('Activity', { exact: true }).nth(i).selectOption(a);
        await nightForm.getByRole('button', { name: 'Assign quarter-day activities', exact: true }).click();
        await until(async () => (await current()).session.activityState.entries.length === 2);
        for (const i of [0, 1, 3]) {
            const a = (await current()).session.activityState.entries[1].activities[i];
            assert.equal(a.stage, 'using-camp');
            assert.equal(a.request, null);
        }
        const { executeActivity } = await load('src/server/activities/service.ts');
        repo = new SqliteCampaignRepository(file);
        const ids = session.characters.map(c => c.id), principal = { playerId: 'trusted-local', mode: 'trusted-local', grants: [{ campaignId: campaign.id, characterIds: ids }] };
        for (const id of ids)
            for (const target of ['food', 'water']) {
                const r = repo.get(campaign.id);
                executeActivity(repo, { campaignId: campaign.id, revision: r.revision, requestId: randomUUID(), actorId: id, operation: 'resource', target, confirmed: true }, principal);
                repo.close();
                repo = null;
                await sheetRoll(ids.indexOf(id), 'daily ' + target, 0, 3);
                repo = new SqliteCampaignRepository(file);
            }
        repo.close();
        repo = null;
        await page.reload();
        await page.getByRole('region', { name: 'Resolved quarter activities' }).last().waitFor();
        const review = page.locator('[id="day-form-' + (await current()).session.chatJourney.forms.at(-1).id + '"]').locator('.environment-review');
        await review.locator('summary').first().click();
        await review.getByLabel('Environment review reason').fill('Reviewed the supplied Ravenland Hex-Flower Weather v2.0 for this synthetic campaign; preserve current manual weather and authorize daily Morning advancement.');
        const flower = review.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Ravenland hex-flower v2.0 · Table GM' }) }).first();
        await flower.locator('summary').first().click();
        await review.getByLabel('Seasonal phase', { exact: true }).selectOption('fallwane');
        await review.getByLabel(/Apply v2.0 Lead the Way/).check();
        await review.getByLabel(/Authorize one hex-flower step/).check();
        const before = await current(), oldWeather = before.session.campaign.weather;
        await review.getByRole('button', { name: 'Activate Ravenland hex-flower', exact: true }).click();
        await until(async () => (await current()).session.environment?.hexFlower?.enabled);
        assert.equal((await current()).session.campaign.weather, oldWeather);
        await page.locator('[role=status]:visible').filter({ hasText: 'Ready to complete quarter-day' }).last().waitFor();
        const snapshot = await current(), dice = structuredClone(snapshot.session.dice), history = structuredClone(snapshot.session.dayTracker), needs = structuredClone(snapshot.session.activityState.needs), camp = structuredClone(snapshot.session.campsites);
        await page.getByRole('button', { name: 'Complete quarter-day', exact: true }).last().click();
        await until(async () => (await current()).session.campaign.quarter === 'Morning');
        let morning = await current();
        assert.equal(morning.session.campaign.date, '13th Stillfall, 1165');
        assert.equal(morning.session.campaign.hex, 'U06');
        assert.deepEqual(morning.session.dice, dice);
        assert.deepEqual(morning.session.dayTracker, history);
        assert.deepEqual(morning.session.activityState.needs, needs);
        assert.deepEqual(morning.session.campsites, camp);
        assert.equal(morning.session.environment.hexFlower.day, 2);
        const weather = morning.session.environment.weather.find(w => w.id === morning.session.environment.currentWeatherId);
        assert.equal(weather.draws.filter(d => d.dimension.startsWith('navigation')).length, 2);
        assert.equal(weather.period, '13th Stillfall, 1165');
        const transition = await (await fetch(url + '/api/environment?' + new URLSearchParams({ campaignId: campaign.id, characterId: ids[0] }))).json();
        const sceneId = 'transition:' + transition.transition.id, scene = morning.session.messages.find(m => m.id === sceneId);
        assert.match(scene.text, /Night ends.*Morning begins/s);
        assert.ok(scene.text.includes(weather.description));
        assert.equal(scene.provider, 'application');
        assert.equal(transition.transition.narration.status, 'fallback');
        assert.match(transition.transition.narration.error, /unavailable/);
        assert.equal(morning.session.messages.filter(m => m.id === sceneId).length, 1);
        assert.equal(morning.session.chatJourney.forms.at(-1).entryId, null);
        assert.equal(morning.session.activityState.entries.length, 2);
        await page.locator('.conversation .message-text p').filter({ hasText: /^The Night ends. Morning begins on 13th Stillfall/ }).waitFor();
        assert.equal(await page.getByText('A world beyond', { exact: false }).count(), 0);
        await page.locator('.camp-indicator summary').filter({ hasText: 'At Camp' }).waitFor();
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        await page.screenshot({ path: path.join(root, 'docs/phase6-8d-morning-desktop.png'), fullPage: true });
        await page.reload();
        await page.locator('.conversation .message-text p').filter({ hasText: /^The Night ends. Morning begins on 13th Stillfall/ }).waitFor();
        assert.equal((await current()).session.messages.filter(m => m.id === sceneId).length, 1);
        assert.deepEqual((await current()).session.environment.weather, morning.session.environment.weather);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('button.mobile-menu').click();
        await page.locator('.sidebar').waitFor();
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        await page.screenshot({ path: path.join(root, 'docs/phase6-8d-sidebar-mobile.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
        await page.close();
        await stop();
        await start();
        const reopened = await current();
        assert.deepEqual(reopened.session.environment, morning.session.environment);
        assert.deepEqual(reopened.session.campaign, morning.session.campaign);
        assert.equal(reopened.session.messages.filter(m => m.id === sceneId).length, 1);
        assert.deepEqual(errors, []);
        console.log('PASS Phase 6.8d original-PDF browser: real Evening Camp/Forage sheet rolls, three Night sleepers/Elyanna Watch, all daily needs satisfied, reviewed v2.0 activation preserving manual weather, one Morning hex-flower step and saved dice, direct 13th Stillfall date, automatic missing-model fallback scene, same U06/camp, unchanged original rolls/history/needs, desktop/mobile compact sidebar without slogan, reload and server restart without extra weather/clock/narration. No paid model calls.');
    }
    catch (e) {
        console.error('BROWSER_FAILURE', e);
        const debugPage = browser?.contexts()[0]?.pages().find(p => p.url().includes('/campaigns/') && !p.url().includes('/characters/'));
        if (debugPage)
            console.log('ENVDEBUG', await debugPage.locator('.environment-review:visible').evaluateAll(es => es.map(e => ({ open: e.open, text: e.innerText.slice(0, 2500) }))).catch(() => []));
        console.error(logs.slice(-4500));
        throw e;
    }
    finally {
        repo?.close();
        await browser?.close();
        await stop();
        rmSync(folder, { recursive: true, force: true });
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
