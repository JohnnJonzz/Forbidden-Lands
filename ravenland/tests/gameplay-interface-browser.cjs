const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync, mkdirSync } = require("node:fs"),
  path = require("node:path"),
  { tmpdir } = require("node:os"),
  net = require("node:net");
const { rollFixture } = require("./phase7-roll-fixture.ts"),
  { upgradeTestRuns } = require("../src/server/gameplay/test-runs.ts"),
  { preparePhase7Map } = require("../src/server/gameplay/prepare-map.ts"),
  { executeGameplay } = require("../src/server/gameplay/service.ts");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-7b2-browser-")),
    f = await rollFixture(folder);
  // Simulate an upgraded Windows profile with Elyanna's existing Watch roll and Push.
  executeGameplay(
    f.repo,
    {
      type: "declare",
      text: "Grogahx rests, Edrus rests, Elyanna keeps watch, and Rose rests.",
      campaignId: f.id,
      actorId: f.actor,
      operationId: require("node:crypto").randomUUID(),
      campaignRevision: f.repo.get(f.id).revision,
      activityRevision: null,
    },
    f.principal,
    f.file,
  );
  f.run(f.find("watch"), "roll", 2);
  f.run(f.find("watch"), "push", 6);
  const preserved = f.repo.get(f.id);
  upgradeTestRuns(f.repo, f.file);
  await preparePhase7Map(f.repo, f.file);
  const books = f.repo.db.prepare("SELECT * FROM source_documents").all(),
    chunks = f.repo.db.prepare("SELECT COUNT(*) n FROM source_chunks").get().n;
  const port = await new Promise((r) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const n = s.address().port;
        s.close(() => r(n));
      });
    }),
    url = "http://127.0.0.1:" + port;
  let browser,
    server,
    logs = "";
  const errors = [],
    requests = [];
  async function until(fn) {
    for (let i = 0; i < 300; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error("Timeout " + logs.slice(-1800));
  }
  async function start() {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.RAVENLAND_PHASE7_PROFILE;
    server = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/dev-phase7.ts",
        "--directory",
        f.p.root,
        "--port",
        String(port),
      ],
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
  const out =
    process.env.RAVENLAND_BROWSER_ARTIFACT_DIR ||
    path.join(folder, "screenshots");
  mkdirSync(out, { recursive: true });
  try {
    await start();
    browser = await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    let page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/"))
        requests.push({ method: r.method(), path: new URL(r.url()).pathname });
    });
    await page.goto(url + "/campaigns/" + f.id);
    await page.waitForURL("**/play");
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.equal(
      await page.locator(".brand").innerText(),
      "FORBIDDEN LANDS\nTHE RAVENLAND CHRONICLES",
    );
    assert.equal(await page.locator(".sidebar .party-member").count(), 4);
    assert.deepEqual(f.repo.get(f.id), preserved);
    assert.equal(
      await page
        .locator('details:has(> summary:text-is("Advanced Diagnostics"))')
        .getAttribute("open"),
      null,
    );
    await page.screenshot({
      path: path.join(out, "phase7b2-desktop.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await page
      .getByRole("group", { name: "Interactive Ravenland map" })
      .waitFor();
    await page.getByText(/Party: V09/).waitFor();
    await page.getByRole("button", { name: "Zoom in" }).click();
    assert.deepEqual(f.repo.get(f.id), preserved);
    await page.getByLabel("Inspect hex", { exact: true }).selectOption("V09");
    assert.equal(
      await page.getByRole("button", { name: /Plan journey/ }).isEnabled(),
      false,
    );
    await page.screenshot({
      path: path.join(out, "phase7b2-map.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await page.getByRole("heading", { name: "Journal & history" }).waitFor();
    assert.deepEqual(f.repo.get(f.id), preserved);
    await page.getByRole("button", { name: "Characters", exact: true }).click();
    const [sheet] = await Promise.all([
      page.waitForEvent("popup"),
      page
        .locator("main")
        .getByRole("button", { name: "Open Elyanna character sheet" })
        .click(),
    ]);
    await sheet.locator("iframe").waitFor();
    await sheet.close();
    assert.deepEqual(f.repo.get(f.id), preserved);
    await page
      .getByRole("button", { name: "Conversation", exact: true })
      .click();
    await page.getByText("Development Testing", { exact: true }).click();
    await page
      .getByRole("button", { name: "Revise Activity Plan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm revised activity plan" })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: /Saved dice/ })
      .waitFor();
    assert.deepEqual(f.repo.get(f.id), preserved);
    const stale = await page.evaluate(
      async (id) =>
        await (await fetch("/api/gameplay?campaignId=" + id)).json(),
      f.id,
    );
    await page
      .getByRole("button", {
        name: "Create Fresh Synthetic Test Baseline",
        exact: true,
      })
      .click();
    const preview = page.getByRole("region", { name: "Reset preview" });
    await preview.waitFor();
    assert.deepEqual(f.repo.get(f.id), preserved);
    await preview.getByRole("checkbox").check();
    await preview
      .getByRole("button", {
        name: "Confirm Create Fresh Synthetic Test Baseline",
        exact: true,
      })
      .click();
    await until(
      async () =>
        f.repo.get(f.id).session.dice?.length === 0 ||
        !f.repo.get(f.id).session.dice,
    );
    await page
      .getByTestId("activity-status")
      .filter({ hasText: "Awaiting declaration" })
      .waitFor();
    assert.equal(f.repo.get(f.id).id, preserved.id);
    assert.equal(
      f.repo.get(f.id).session.characters.find((c) => c.id === "nerys").sheet
        .willpower,
      "3",
    );
    const denied = await page.evaluate(async (old) => {
      const r = await fetch("/api/gameplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "declare",
          text: "Everyone rests.",
          campaignId: old.campaignId,
          actorId: old.actorId,
          operationId: crypto.randomUUID(),
          campaignRevision: old.campaignRevision,
          activityRevision: old.activity.revision,
          runId: old.run.id,
        }),
      });
      return { status: r.status, body: await r.json() };
    }, stale);
    assert.equal(denied.status, 400);
    assert.match(denied.body.error, /test run has changed/);
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill(
        "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.",
      );
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await page.locator("[data-procedure=camp]").waitFor();
    await page
      .getByRole("button", { name: "Revise Activity Plan", exact: true })
      .click();
    await page.getByLabel("Elyanna", { exact: true }).selectOption("Sleep");
    await page
      .getByRole("button", { name: "Confirm revised activity plan" })
      .click();
    await until(async () =>
      JSON.parse(
        f.repo.db
          .prepare(
            "SELECT state_json FROM phase7_activities WHERE id=(SELECT current_activity_id FROM phase7_campaigns WHERE campaign_id=?)",
          )
          .get(f.id).state_json,
      ).assignments.some(
        (a) => a.characterId === "nerys" && a.activity === "Sleep",
      ),
    );
    assert.equal(f.all().filter((q) => q.status !== "superseded").length, 3);
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill("Finish Evening and advance to Night.");
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await page.getByText(/The campaign remains at Evening/).waitFor();
    assert.equal(f.repo.get(f.id).session.campaign.quarter, "Evening");
    const [editable] = await Promise.all([
      page.waitForEvent("popup"),
      page
        .locator(".sidebar")
        .getByRole("button", { name: "Open Elyanna character sheet" })
        .click(),
    ]);
    await editable
      .getByRole("heading", { name: "Pending Rolls", exact: true })
      .waitFor();
    await until(
      async () =>
        (await editable
          .frameLocator("iframe")
          .locator("#attr-wits-regular")
          .inputValue()) === "3",
    );
    await editable
      .frameLocator("iframe")
      .getByRole("button", { name: "Increase wits", exact: true })
      .click();
    await until(
      async () =>
        f.repo.get(f.id).session.characters.find((c) => c.id === "nerys").sheet[
          "attr-wits"
        ] === "4",
    );
    await editable.close();
    const current = f.repo.get(f.id),
      run = f.repo.db
        .prepare("SELECT run_id FROM phase7_test_runs")
        .get().run_id;
    await page.reload();
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.deepEqual(f.repo.get(f.id), current);
    assert.equal(
      f.repo.db.prepare("SELECT run_id FROM phase7_test_runs").get().run_id,
      run,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "Toggle campaign sidebar" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Open Elyanna character sheet" })
        .isVisible(),
      true,
    );
    await page.screenshot({
      path: path.join(out, "phase7b2-mobile.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Close sidebar" }).click();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await page
      .getByRole("group", { name: "Interactive Ravenland map" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("button", { name: "Conversation", exact: true })
      .click();
    await page.screenshot({
      path: path.join(out, "phase7b2-mobile-conversation.png"),
      fullPage: false,
    });
    await page.close();
    await stop();
    await start();
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/"))
        requests.push({ method: r.method(), path: new URL(r.url()).pathname });
    });
    await page.goto(url + "/campaigns/" + f.id + "/play");
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.deepEqual(f.repo.get(f.id), current);
    assert.equal(
      f.repo.db.prepare("SELECT run_id FROM phase7_test_runs").get().run_id,
      run,
    );
    assert.deepEqual(
      f.repo.db.prepare("SELECT * FROM source_documents").all(),
      books,
    );
    assert.equal(
      f.repo.db.prepare("SELECT COUNT(*) n FROM source_chunks").get().n,
      chunks,
    );
    assert.equal(
      requests.some((r) =>
        [
          "/api/journey",
          "/api/journey/status",
          "/api/gm",
          "/api/dice",
          "/api/combat",
          "/api/quarter-resolution",
        ].includes(r.path),
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Chromium desktop/mobile: familiar shared dashboard, read-only map and Journal, roster and actual sheet popup, preserved old Elyanna Push, guarded post-roll revision, explicit archive/reset, new plan/revision, stale run rejection, Evening remains open, indexed private sources, refresh and restart. Screenshots: " +
        out,
    );
  } finally {
    await browser?.close();
    await stop();
    f.close();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
