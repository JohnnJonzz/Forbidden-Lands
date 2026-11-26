const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process"),
  { mkdtempSync, rmSync, readFileSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  net = require("node:net");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-68f1-browser-")),
    file = path.join(folder, "db.sqlite"),
    load = (p) => import(pathToFileURL(path.join(root, p)).href),
    env = {
      ...process.env,
      RAVENLAND_DB_PATH: file,
      RAVENLAND_SOURCEBOOK_DIR: path.join(folder, "books"),
      RAVENLAND_AI_MODE: "openai",
      OPENAI_API_KEY: "TEST_TRANSPORT_ONLY",
      NODE_OPTIONS:
        (process.env.NODE_OPTIONS || "") +
        " --import=" +
        pathToFileURL(
          path.join(__dirname, "fixtures/stationary-quarter-provider.mjs"),
        ).href,
    };
  let repo,
    server,
    browser,
    logs = "",
    f;
  const port = await new Promise((r) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => r(p));
      });
    }),
    url = "http://127.0.0.1:" + port;
  async function until(fn) {
    for (let i = 0; i < 250; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error("State did not settle. " + logs.slice(-1600));
  }
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
  async function current() {
    return (await (await fetch(url + "/api/campaigns?id=" + f.id)).json())
      .record;
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
      ),
      { stationaryFixture } = await load("tests/stationary-quarter-fixture.ts");
    repo = new SqliteCampaignRepository(file);
    const source = repo.create(structuredClone(initialSession)),
      library = new SourcebookLibrary(
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
          source.id,
          { title, category: "Rules", visibility: "GM Only" },
          name,
          new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
        );
      await library.index(source.id, doc.document.id);
    }
    f = stationaryFixture(repo, source.id);
    const original = f.current(),
      push = JSON.stringify(
        original.session.dice.find((d) => d.id === f.moveId),
      ),
      camp = JSON.stringify(original.session.campsites);
    repo.close();
    repo = null;
    console.log("CHECK original PDFs and V09 Evening fixture ready");
    await start();
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
    page.on("response", async (r) => {
      if (r.url().includes("/api/quarter-resolution") && r.status() >= 400)
        console.log("RECOVERY_ERROR", await r.text());
    });
    page.setDefaultTimeout(30000);
    await page.goto(url + "/campaigns/" + f.id);
    async function say(text) {
      const before = (await current()).session.messages.length;
      await page.getByLabel("Player action", { exact: true }).fill(text);
      await page
        .getByRole("button", { name: "Send action", exact: true })
        .click();
      await until(
        async () => (await current()).session.messages.length >= before + 2,
      );
      await until(async () => (await page.locator(".ai-stream").count()) === 0);
    }
    await say("Describe the camp scene.");
    assert.equal((await current()).session.campaign.quarter, "Evening");
    assert.ok(
      !(await current()).session.messages.some(
        (m) => m.role === "gm" && m.text.includes("Night has begun"),
      ),
    );
    await say("Complete the Quarter Day");
    assert.equal((await current()).session.campaign.quarter, "Evening");
    await say("Avoid");
    let inspection = await (
      await fetch(
        url +
          "/api/quarter-resolution?" +
          new URLSearchParams({
            campaignId: f.id,
            entryId: f.entryId,
            actorId: f.actor,
          }),
      )
    ).json();
    assert.equal(inspection.encounter.status, "scene");
    await say("Let them pass without contact");
    inspection = await (
      await fetch(
        url +
          "/api/quarter-resolution?" +
          new URLSearchParams({
            campaignId: f.id,
            entryId: f.entryId,
            actorId: f.actor,
          }),
      )
    ).json();
    assert.equal(inspection.encounter.status, "resolved");
    await page.reload();
    const panel = page.getByRole("region", { name: "Quarter-day resolution" });
    await panel
      .getByText("Inspect and recover current quarter", { exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Refresh recovery inspection", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Review sprained-ankle correction",
        exact: true,
      })
      .click();
    await panel
      .getByLabel("Correction review reason", { exact: true })
      .fill(
        "Reviewed the original fifth-printing Handbook. Foraging result 3 is the fixed critical, not a snake; preserve the pushed Move card and its existing effects.",
      );
    await panel
      .getByRole("button", {
        name: "Confirm reviewed mishap correction",
        exact: true,
      })
      .click();
    await until(
      async () =>
        (await current()).session.activityState.entries[0].activities[0].request
          ?.context.step === "forage-injury-duration",
    );
    const sheet = await context.newPage();
    await sheet.goto(url + "/campaigns/" + f.id + "/characters/" + f.actor);
    await sheet
      .getByRole("button", {
        name: "Stage requested forage-injury-duration",
        exact: true,
      })
      .click();
    const frame = sheet.frameLocator("iframe");
    await frame.locator("body").evaluate(() => {
      Math.random = () => 0.55;
    });
    await frame.locator("#btn-roll-pool").click();
    await until(
      async () =>
        (await current()).session.activityState.entries[0].activities[0]
          .status === "Resolved",
    );
    await sheet.close();
    await panel.getByText("Mechanically complete", { exact: true }).waitFor();
    const recoveryDetails = panel.locator("details.quarter-recovery");
    if (!(await recoveryDetails.getAttribute("open")))
      await recoveryDetails.locator("summary").click();
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await recoveryDetails.screenshot({
      path: path.join(root, "docs/phase6-8f1-recovery-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    if ((await recoveryDetails.getAttribute("open")) !== null)
      await recoveryDetails.locator("summary").click();
    await panel
      .getByRole("button", { name: "Complete quarter-day", exact: true })
      .waitFor();
    await panel.screenshot({
      path: path.join(root, "docs/phase6-8f1-recovery-mobile.png"),
    });
    await say("Return to camp and complete the Evening quarter-day.");
    await until(
      async () => (await current()).session.campaign.quarter === "Night",
    );
    const completed = await current();
    assert.equal(completed.session.campaign.hex, "V09");
    assert.equal(
      completed.session.campaign.weather,
      original.session.campaign.weather,
    );
    assert.equal(JSON.stringify(completed.session.campsites), camp);
    assert.equal(
      JSON.stringify(completed.session.dice.find((d) => d.id === f.moveId)),
      push,
    );
    assert.equal(
      completed.session.messages.filter((m) => m.id.startsWith("transition:"))
        .length,
      1,
    );
    assert.equal(
      completed.session.messages.filter((m) =>
        m.text.includes("Evening gives way to Night"),
      ).length,
      1,
    );
    assert.equal(completed.session.chatJourney.forms.at(-1).quarter, "Night");
    assert.ok(
      !completed.session.messages.some((m) =>
        /no active conversational journey/i.test(m.text),
      ),
    );
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + f.id);
    assert.equal(
      (await current()).session.messages.filter((m) =>
        m.id.startsWith("transition:"),
      ).length,
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS stationary V09: controlled provider false claims blocked; saved native Scouting; reviewed D6=3 critical; pushed Move preserved; source-supported procession decline; one Night scene/draft; desktop/mobile and restart.",
    );
  } catch (e) {
    if (browser) {
      const pages = browser.contexts()[0]?.pages() ?? [];
      for (const p of pages)
        console.log(
          "VISIBLE_ALERTS",
          await p.getByRole("alert").allTextContents(),
        );
    }
    console.error(e, logs.slice(-2600));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await stop();
    repo?.close();
    rmSync(folder, { recursive: true, force: true });
  }
})();
