const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync, mkdirSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  net = require("node:net");
const { createSyntheticProfile } = require("../scripts/phase7-setup.ts"),
  { SqliteCampaignRepository } = require("../src/server/sqlite.ts");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-phase7-browser-")),
    p = createSyntheticProfile(path.join(folder, "profile")),
    baseEnv = { ...process.env };
  delete baseEnv.RAVENLAND_DB_PATH;
  delete baseEnv.RAVENLAND_PHASE7_PROFILE;
  delete baseEnv.OPENAI_API_KEY;
  const port = await new Promise((r) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const n = s.address().port;
        s.close(() => r(n));
      });
    }),
    url = "http://127.0.0.1:" + port;
  let server,
    browser,
    logs = "";
  const requests = [],
    errors = [];
  async function until(check) {
    for (let i = 0; i < 250; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error("Timeout. " + logs.slice(-2500));
  }
  async function start() {
    server = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/dev-phase7.ts",
        "--directory",
        p.root,
        "--port",
        String(port),
      ],
      { cwd: root, env: baseEnv },
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
  function snapshot() {
    const repo = new SqliteCampaignRepository(p.database, { readOnly: true });
    try {
      const r = repo.get(p.campaignId),
        activities = repo.db
          .prepare("SELECT state_json FROM phase7_activities")
          .all()
          .map((r) => JSON.parse(r.state_json));
      return {
        record: r,
        activities,
        events: repo.db.prepare("SELECT * FROM phase7_events").all(),
        commands: repo.db.prepare("SELECT * FROM phase7_commands").all(),
        old: repo.db.prepare("SELECT * FROM quarter_resolution_commands").all(),
        aiUsage: repo.db.prepare("SELECT * FROM ai_usage").all(),
        transitions: repo.db.prepare("SELECT * FROM quarter_transitions").all(),
      };
    } finally {
      repo.close();
    }
  }
  try {
    const before = snapshot().record;
    await start();
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    let page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/")) requests.push(new URL(r.url()).pathname);
    });
    await page.goto(url + "/campaigns/" + p.campaignId);
    await page.waitForURL("**/play");
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.equal(
      await page.getByTestId("current-quarter").innerText(),
      "Evening",
    );
    assert.equal(snapshot().activities.length, 0);
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill("Grogahx makes camp.");
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await until(
      async () =>
        (await page.getByTestId("activity-status").innerText()) ===
        "clarification",
    );
    const id = await page.getByTestId("activity-id").innerText();
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill("Edrus forages, Elyanna keeps watch, and Rose rests.");
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await until(
      async () =>
        (await page.getByTestId("activity-status").innerText()) === "planned",
    );
    assert.equal(await page.getByTestId("activity-id").innerText(), id);
    await page.getByText("Optional activity planner", { exact: true }).click();
    await page.getByRole("button", { name: "Save party plan" }).click();
    await until(async () => snapshot().commands.length === 3);
    assert.equal(snapshot().activities.length, 1);
    assert.equal(snapshot().activities[0].revision, 2);
    assert.equal(snapshot().events.length, 2);
    assert.deepEqual(snapshot().record, before);
    // A changed planner submission must reject without starting a second plan.
    await page
      .getByLabel("Rose Underbough", { exact: true })
      .selectOption("Sleep");
    await page.getByRole("button", { name: "Save party plan" }).click();
    await page.locator("main [role=alert]").waitFor();
    assert.match(
      await page.locator("main [role=alert]").innerText(),
      /already has a saved plan/,
    );
    assert.equal(
      snapshot().activities[0].assignments.find((a) => a.characterId === "pip")
        .activity,
      "Rest",
    );
    await page.getByRole("button", { name: "Refresh saved activity" }).click();
    await until(
      async () => (await page.locator("main [role=alert]").count()) === 0,
    );
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill("Advance to Night");
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await page.getByRole("status").waitFor();
    assert.match(await page.getByRole("status").innerText(), /not enabled/);
    assert.equal(
      await page.getByTestId("current-quarter").innerText(),
      "Evening",
    );
    assert.equal(
      await page
        .getByRole("button", { name: /complete|roll dice|advance/i })
        .count(),
      0,
    );
    assert.equal(snapshot().old.length, 0);
    assert.equal(snapshot().aiUsage.length, 0);
    assert.equal(snapshot().transitions.length, 0);
    assert.equal(snapshot().activities[0].transitionReceipt, null);
    assert.equal(
      requests.some((x) =>
        [
          "/api/gm",
          "/api/journey",
          "/api/quarter-resolution",
          "/api/dice",
        ].includes(x),
      ),
      false,
    );
    const denied = await page.evaluate(async () => {
      const r = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return { status: r.status, body: await r.json() };
    });
    assert.equal(denied.status, 409);
    assert.match(denied.body.error, /Phase 7/);
    const output =
      process.env.RAVENLAND_BROWSER_ARTIFACT_DIR ||
      path.join(folder, "screenshots");
    mkdirSync(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, "phase7-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByTestId("activity-id").waitFor({state:"attached"});
    assert.equal(await page.getByTestId("activity-id").innerText(), id);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, "phase7-mobile.png"),
      fullPage: true,
    });
    await page.close();
    await stop();
    await start();
    // Reopen a tab after dev-server HMR teardown; assert the same persisted activity.
    page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/campaigns/'+p.campaignId+'/play');
    await page.getByTestId("activity-id").waitFor({state:"attached"});
    assert.equal(await page.getByTestId("activity-id").innerText(), id);
    assert.equal(
      await page.getByTestId("current-quarter").innerText(),
      "Evening",
    );
    assert.deepEqual(snapshot().record, before);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: "PASS",
        milestone: "7.0A",
        desktop: "1440x1000",
        mobile: "390x844",
        sameActivityAcrossInputsReloadRestart: true,
        activityCount: snapshot().activities.length,
        legacyWorkflows: 0,
        clockChanged: false,
        aiCalls: 0,
        liveOpenAITested: false,
        completionReceipts: 0,
        screenshots: output,
      }),
    );
  } finally {
    if (browser) await browser.close();
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
