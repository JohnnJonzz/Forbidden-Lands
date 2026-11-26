const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process"),
  { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs"),
  path = require("node:path"),
  { tmpdir } = require("node:os"),
  { pathToFileURL } = require("node:url"),
  { randomUUID } = require("node:crypto"),
  net = require("node:net");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-68f-browser-")),
    file = path.join(folder, "db.sqlite"),
    env = {
      ...process.env,
      RAVENLAND_DB_PATH: file,
      RAVENLAND_SOURCEBOOK_DIR: path.join(folder, "books"),
      RAVENLAND_AI_MODE: "openai",
      OPENAI_API_KEY: "",
      RAVENLAND_NARRATIVE_DICE_FILE: path.join(folder, "dice.json"),
      NODE_OPTIONS:
        (process.env.NODE_OPTIONS || "") +
        " --import=" +
        pathToFileURL(
          path.join(__dirname, "fixtures/combat-narrative-random.mjs"),
        ).href,
    },
    load = (p) => import(pathToFileURL(path.join(root, p)).href);
  writeFileSync(
    env.RAVENLAND_NARRATIVE_DICE_FILE,
    JSON.stringify({ token: randomUUID(), value: 1 }),
  );
  let repo,
    server,
    browser,
    logs = "",
    campaign,
    encounterCampaign;
  const port = await new Promise((r) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => r(p));
      });
    }),
    url = "http://127.0.0.1:" + port;
  async function start() {
    server = spawn(
      process.execPath,
      ["scripts/dev-local.mjs", "--port", String(port)],
      { cwd: root, env },
    );
    server.stdout.on("data", (d) => (logs += d));
    server.stderr.on("data", (d) => (logs += d));
    await until(async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    });
  }
  async function stop() {
    if (server?.exitCode === null)
      await new Promise((r) => {
        server.once("exit", r);
        server.kill("SIGTERM");
      });
  }
  async function until(fn) {
    for (let i = 0; i < 250; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (campaign) {
      const snapshot = await current();
      console.log(
        "UNSETTLED",
        JSON.stringify({
          clock: snapshot.session.campaign,
          dice: snapshot.session.dice?.map((d) => ({
            id: d.id,
            skill: d.result.skill,
            successes: d.result.successes,
            context: d.journeyContext,
          })),
          messages: snapshot.session.messages.slice(-2),
        }),
      );
      const entryId = snapshot.session.dayTracker?.at(-1)?.id;
      if (entryId)
        console.log(
          "FLOW",
          await (
            await fetch(
              url +
                "/api/quarter-resolution?" +
                new URLSearchParams({
                  campaignId: campaign.id,
                  entryId,
                  actorId: snapshot.session.characters[0].id,
                }),
            )
          ).text(),
        );
    }
    throw Error("State did not settle: " + logs.slice(-1800));
  }
  async function current() {
    return (
      await (await fetch(url + "/api/campaigns?id=" + campaign.id)).json()
    ).record;
  }
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/prepare-map.ts"],
      { cwd: root, env },
    );
    const { SqliteCampaignRepository } = await load("src/server/sqlite.ts"),
      { initialSession } = await load("src/lib/mock.ts"),
      { SourcebookLibrary } = await load("src/server/sourcebooks/library.ts"),
      { FileSourcebookStorage } = await load(
        "src/server/sourcebooks/storage.ts",
      );
    repo = new SqliteCampaignRepository(file);
    const s = structuredClone(initialSession);
    Object.assign(s.campaign, {
      name: "Isolated 6.8f acceptance",
      hex: "V07",
      location: "V07",
      terrain: "Dark Forest",
      date: "13th Springrise, 1165",
      quarter: "Day",
      weather: "Saved clear weather",
    });
    s.messages = [];
    s.journal = [];
    s.characters.forEach((c, i) => {
      c.name = ["Grogahx", "Edrus", "Elyanna", "Rose Underbough"][i];
      c.sheet = {
        ...Object.fromEntries(
          ["strength", "agility", "wits", "empathy"].flatMap((a) => [
            [`attr-${a}`, "3"],
            [`attr-${a}-regular`, "3"],
          ]),
        ),
        weapons: [],
        gear: [],
        talents: [],
        willpower: "3",
        "skill-survival": "0",
        "skill-scouting": "0",
        "res-food": "D8",
        "res-water": "D8",
      };
    });
    campaign = repo.create(s);
    const library = new SourcebookLibrary(
      repo,
      new FileSourcebookStorage(env.RAVENLAND_SOURCEBOOK_DIR),
    );
    for (const [name, title] of [
      [
        "Forbidden_Lands_Players_Handbook_5th_printing.pdf",
        "Forbidden Lands Players Handbook",
      ],
      [
        "Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf",
        "Forbidden Lands Gamemasters Guide",
      ],
    ]) {
      const bytes = readFileSync(
          path.join(
            process.env.RAVENLAND_REAL_SOURCEBOOK_DIR ||
              "/tmp/ravenland-private-sourcebooks",
            name,
          ),
        ),
        doc = await library.upload(
          campaign.id,
          { title, category: "Rules", visibility: "GM Only" },
          name,
          new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
        );
      await library.index(campaign.id, doc.document.id);
    }
    encounterCampaign = repo.create(s);
    repo.db
      .prepare(
        "INSERT INTO campaign_sourcebooks (campaign_id,document_id) SELECT ?,document_id FROM campaign_sourcebooks WHERE campaign_id=?",
      )
      .run(encounterCampaign.id, campaign.id);
    repo.db
      .prepare(
        "INSERT OR IGNORE INTO campaign_sourcebooks (campaign_id,document_id) SELECT ?,id FROM source_documents WHERE campaign_id=?",
      )
      .run(encounterCampaign.id, campaign.id);
    repo.close();
    repo = null;
    console.log("CHECK seeded original PDFs");
    await start();
    console.log("CHECK server ready");
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1080 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(30000);
    await page.goto(url + "/campaigns/" + campaign.id);
    console.log("CHECK campaign loaded");
    await page
      .getByRole("button", { name: "Quarter-Day Activities", exact: true })
      .click();
    const form = page.locator(".quarter-chat-form");
    await form.getByLabel("AI GM Assisted quarter-day resolution").check();
    await form.getByLabel("Automatically complete this quarter").check();
    await form
      .getByLabel("Party Traveling", { exact: true })
      .selectOption("Yes");
    await form.getByLabel("Destination", { exact: true }).selectOption("V09");
    const activities = form.getByLabel("Activity", { exact: true });
    await activities.nth(0).selectOption("Hike");
    await activities.nth(1).selectOption("Lead the Way");
    await activities.nth(2).selectOption("Hike");
    await activities.nth(3).selectOption("Keep Watch");
    assert.equal(await form.getByRole("radio").count(), 0);
    await form
      .getByRole("button", { name: "Submit to Game Master", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Quarter-day resolution" })
      .getByText("Awaiting roll", { exact: true })
      .waitFor();
    const region = page.getByRole("region", { name: "Quarter-day resolution" });
    assert.equal(
      await region.getByLabel("Actual ending hex").isVisible(),
      false,
    );
    assert.equal(
      await region.getByLabel("Weather for next quarter").isVisible(),
      false,
    );
    assert.equal(
      await region
        .locator("details")
        .filter({ hasText: "Advanced Table GM Review" })
        .getAttribute("open"),
      null,
    );
    const ch = (await current()).session.characters[1],
      sheet = await context.newPage();
    await sheet.goto(
      url + "/campaigns/" + campaign.id + "/characters/" + ch.id,
    );
    await sheet
      .getByRole("button", {
        name: "Stage requested Lead the Way",
        exact: true,
      })
      .click();
    const frame = sheet.frameLocator("iframe");
    await frame.locator("body").evaluate(() => {
      let n = 0;
      Math.random = () => ((n++ === 0 ? 6 : 3) - 0.5) / 6;
    });
    await frame.locator("#btn-roll-pool").click();
    await until(
      async () => (await current()).session.campaign.quarter === "Evening",
    );
    await sheet.close();
    await until(async () =>
      (await current()).session.messages.some((m) =>
        m.id.startsWith("transition:"),
      ),
    );
    let r = await current();
    assert.equal(r.session.campaign.hex, "V09");
    assert.equal(r.session.campaign.weather, "Saved clear weather");
    assert.equal(r.session.dayTracker.length, 1);
    assert.equal(
      r.session.chatJourney.updates.filter((u) => u.kind === "completed")
        .length,
      1,
    );
    await page.reload();
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.screenshot({
      path: path.join(root, "docs/phase6-8f-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(root, "docs/phase6-8f-mobile.png"),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + campaign.id);
    r = await current();
    assert.equal(r.session.campaign.hex, "V09");
    assert.equal(
      r.session.chatJourney.updates.filter((u) => u.kind === "completed")
        .length,
      1,
    );
    campaign = encounterCampaign;
    writeFileSync(
      env.RAVENLAND_NARRATIVE_DICE_FILE,
      JSON.stringify({ token: randomUUID(), value: 6 }),
    );
    await page.goto(url + "/campaigns/" + campaign.id);
    await page
      .getByRole("button", { name: "Quarter-Day Activities", exact: true })
      .click();
    const nextForm = page.locator(".quarter-chat-form");
    await nextForm.getByLabel("AI GM Assisted quarter-day resolution").check();
    await nextForm.getByLabel("Automatically complete this quarter").check();
    await nextForm
      .getByLabel("Party Traveling", { exact: true })
      .selectOption("Yes");
    await nextForm
      .getByLabel("Destination", { exact: true })
      .selectOption("V09");
    for (const [i, a] of [
      "Hike",
      "Lead the Way",
      "Hike",
      "Keep Watch",
    ].entries())
      await nextForm
        .getByLabel("Activity", { exact: true })
        .nth(i)
        .selectOption(a);
    await nextForm
      .getByRole("button", { name: "Submit to Game Master", exact: true })
      .click();
    const secondSheet = await context.newPage();
    await secondSheet.goto(
      url + "/campaigns/" + campaign.id + "/characters/" + ch.id,
    );
    await secondSheet
      .getByRole("button", {
        name: "Stage requested Lead the Way",
        exact: true,
      })
      .click();
    const secondFrame = secondSheet.frameLocator("iframe");
    await secondFrame.locator("body").evaluate(() => {
      let n = 0;
      Math.random = () => ((n++ === 0 ? 6 : 3) - 0.5) / 6;
    });
    await secondFrame.locator("#btn-roll-pool").click();
    await until(async () => (await current()).session.campaign.hex === "V09");
    const watchSheet = await context.newPage();
    await watchSheet.goto(
      url +
        "/campaigns/" +
        campaign.id +
        "/characters/" +
        (await current()).session.characters[3].id,
    );
    await watchSheet
      .getByRole("button", { name: "Stage requested Keep Watch", exact: true })
      .click();
    const watchFrame = watchSheet.frameLocator("iframe");
    await watchFrame.locator("body").evaluate(() => {
      let n = 0;
      Math.random = () => ((n++ === 0 ? 6 : 3) - 0.5) / 6;
    });
    await watchFrame.locator("#btn-roll-pool").click();

    await until(async () => {
      const r = await current();
      return r.session.messages.some((m) => m.id.startsWith("quarter-scene:"));
    });
    await secondSheet.close();
    await watchSheet.close();
    assert.equal((await current()).session.campaign.quarter, "Day");
    assert.equal((await current()).session.campaign.hex, "V09");
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + campaign.id);
    const secondRegion = page.getByRole("region", {
      name: "Quarter-day resolution",
    });
    await secondRegion
      .getByText("Encounter interruption", { exact: true })
      .waitFor();
    await secondRegion
      .getByText("Specific encounter or outcome review", { exact: true })
      .click();
    await secondRegion
      .getByRole("button", {
        name: "Skip this encounter for testing",
        exact: true,
      })
      .click();
    await secondRegion
      .getByLabel("Reason", { exact: true })
      .fill(
        "For testing purposes, skip this encounter and continue the story and quarter-day.",
      );
    await secondRegion
      .getByRole("button", { name: "Confirm skip", exact: true })
      .click();
    await until(
      async () => (await current()).session.campaign.quarter === "Evening",
    );
    assert.equal(
      (await current()).session.chatJourney.updates.filter(
        (u) => u.kind === "completed",
      ).length,
      1,
    );
    assert.ok(
      (await current()).session.journal.some(
        (j) => j.title === "Skipped — Table GM Testing Override",
      ),
    );
    console.log(
      "PASS: positive actual-source scene persisted across server restart; explicit reviewed Table GM skip resumed the same journey and completed once.",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: original-PDF desktop/mobile menu → staged sheet roll → automatic V07→V09/Evening; saved weather; no routine admin form; restart/reload once.",
    );
  } catch (e) {
    console.error(e, logs.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await stop();
    repo?.close();
    rmSync(folder, { recursive: true, force: true });
  }
})();
