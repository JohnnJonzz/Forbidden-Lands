// Exercises the actual composer -> /api/gm -> SDK decision -> dispatcher path.
// Only a temporary database and test-process SDK transport are used.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync, writeFileSync, readFileSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  net = require("node:net");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-postcombat-browser-")),
    filename = path.join(folder, "db.sqlite"),
    control = path.join(folder, "mode.json"),
    log = path.join(folder, "sdk.jsonl");
  const { worldFixture, syntheticWorldRules } = await import(
      pathToFileURL(path.join(root, "tests/fixtures/world-state.ts")).href
    ),
    { seedOldSetup, continueScene, liveWorldRequest } = await import(
      pathToFileURL(path.join(root, "tests/fixtures/post-combat-routing.ts"))
        .href
    ),
    { SqliteCampaignRepository } = await import(
      pathToFileURL(path.join(root, "src/server/sqlite.ts")).href
    ),
    { quarterDayGM } = await import(
      pathToFileURL(path.join(root, "src/server/journey/gm-contract.ts")).href
    );
  const f = worldFixture(filename);
  quarterDayGM(f.repo).requestForm(f.r.id);
  syntheticWorldRules(f.repo, f.r.id);
  const oldSetup = seedOldSetup(f, "superseded"),
    id = f.r.id,
    characterId = f.patient.id,
    injuryId = f.injury.id,
    aftermathId = f.aftermath.id,
    source = JSON.stringify(
      f.repo.db
        .prepare("SELECT state_json FROM combat_encounters WHERE campaign_id=?")
        .all(id),
    ),
    characters = JSON.stringify(f.repo.get(id).session.characters),
    clock = JSON.stringify(f.repo.get(id).session.campaign);
  f.repo.close();
  writeFileSync(control, JSON.stringify({ mode: "normal" }));
  const env = {
    ...process.env,
    RAVENLAND_DB_PATH: filename,
    RAVENLAND_AI_MODE: "openai",
    OPENAI_API_KEY: "CONTROLLED_TEST_ONLY",
    RAVENLAND_PLAYER_GRANTS: "[]",
    RAVENLAND_ROUTING_FIXTURE: control,
    RAVENLAND_ROUTING_LOG: log,
    NODE_OPTIONS:
      (process.env.NODE_OPTIONS || "") +
      " --import=" +
      pathToFileURL(path.join(root, "tests/fixtures/post-combat-provider.mjs"))
        .href,
  };
  delete env.NODE_ENV;
  delete env.RAVENLAND_LOCAL_RUNTIME_KEY;
  const port = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
    }),
    url = "http://127.0.0.1:" + port;
  let server,
    browser,
    page,
    logs = "";
  const db = (fn) => {
    const r = new SqliteCampaignRepository(filename);
    try {
      return fn(r);
    } finally {
      r.close();
    }
  };
  const current = () => db((r) => r.get(id));
  const injury = () =>
    db((r) =>
      JSON.parse(
        r.db
          .prepare("SELECT state_json FROM campaign_consequences WHERE id=?")
          .get(injuryId).state_json,
      ),
    );
  const worldEvents = () =>
    db((r) =>
      r.db
        .prepare(
          "SELECT result_json FROM consequence_commands WHERE campaign_id=? AND json_extract(result_json,'$.worldEvent') IS NOT NULL ORDER BY created_at,rowid",
        )
        .all(id)
        .map((v) => JSON.parse(v.result_json).worldEvent),
    );
  const calls = () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
  async function until(fn) {
    for (let i = 0; i < 500; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Timed out: " + logs.slice(-3000));
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
        return (
          await fetch(
            url +
              "/api/world-actions?" +
              new URLSearchParams({ campaignId: id, characterId }),
          )
        ).ok;
      } catch {
        return false;
      }
    });
  }
  async function stop() {
    if (server && server.exitCode === null)
      await new Promise((resolve) => {
        const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
        server.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        server.kill("SIGTERM");
      });
  }
  async function say(text) {
    await until(async () => (await page.locator(".ai-stream").count()) === 0);
    const prior = current().session.messages.length;
    await page.getByLabel("Player action", { exact: true }).fill(text);
    await page
      .getByRole("button", { name: "Send action", exact: true })
      .click();
    await until(async () => {
      const alerts = (await page.getByRole("alert").allTextContents())
        .map((s) => s.trim())
        .filter(Boolean);
      if (alerts.length) throw Error("Chat route failed: " + alerts.join(" "));
      return current().session.messages.length >= prior + 2;
    });
    await until(async () => (await page.locator(".ai-stream").count()) === 0);
    return current().session.messages.at(-1);
  }
  function unchanged() {
    assert.equal(injury().state.deadline.value, 4);
    assert.equal(injury().state.deadline.elapsed, 0);
    assert.equal(injury().state.resolution, null);
    assert.equal(
      db(
        (r) =>
          r.db
            .prepare(
              "SELECT count(*) AS n FROM combat_encounters WHERE campaign_id=? AND status='active'",
            )
            .get(id).n,
      ),
      0,
    );
    assert.equal(JSON.stringify(current().session.characters), characters);
    assert.equal(JSON.stringify(current().session.campaign), clock);
    assert.equal(
      db((r) =>
        JSON.stringify(
          r.db
            .prepare(
              "SELECT state_json FROM combat_encounters WHERE campaign_id=?",
            )
            .all(id),
        ),
      ),
      source,
    );
    assert.equal(
      db(
        (r) =>
          JSON.parse(
            r.db
              .prepare(
                "SELECT state_json FROM campaign_consequences WHERE id=?",
              )
              .get(aftermathId).state_json,
          ).status,
      ),
      "pending",
    );
  }
  try {
    await start();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(40000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", async (r) => {
      if (r.url().endsWith("/api/gm")) {
        const body = await r.text().catch(() => "");
        if (body.includes('\"type\":\"error\"'))
          console.error("GM stream: " + body);
      }
    });
    await page.goto(url + "/campaigns/" + id);
    await page.getByLabel("Player action", { exact: true }).waitFor();
    let reply = await say(continueScene);
    assert.match(reply.text, /observes/);
    assert.match(reply.text, /intends to search|duration/);
    assert.doesNotMatch(
      reply.text,
      /setup is no longer pending|setup has already been used/,
    );
    assert.equal(calls().length, 2);
    assert.equal(
      worldEvents().filter((e) => e.status === "completed").length,
      1,
    );
    assert.equal(
      worldEvents().filter((e) => e.status === "awaiting_adjudication").length,
      1,
    );
    unchanged();
    db((r) =>
      r.db
        .prepare(
          "UPDATE combat_setup_proposals SET status='pending' WHERE id=?",
        )
        .run(oldSetup),
    );
    reply = await say(liveWorldRequest);
    assert.match(reply.text, /duration/);
    assert.doesNotMatch(
      reply.text,
      /setup is no longer pending|Public Rules library does not establish/,
    );
    // A fresh request may choose an alternative to a protected pending action.
    assert.equal(calls().length, 3);
    unchanged();
    const payload = db((r) =>
      JSON.parse(
        r.db
          .prepare(
            "SELECT payload FROM ai_requests WHERE campaign_id=? AND id=?",
          )
          .get(id, reply.aiRequestId).payload,
      ),
    );
    const replay = await page.evaluate(
      async (input) =>
        (
          await (
            await fetch("/api/gm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            })
          ).text()
        )
          .trim()
          .split("\n")
          .map(JSON.parse),
      payload,
    );
    assert.equal(replay.at(-1).reply.replayed, true);
    assert.equal(worldEvents().length, 2);
    assert.equal(calls().length, 3);
    await page.reload();
    await page
      .getByRole("region", { name: "World actions", exact: true })
      .waitFor();
    unchanged();
    // Resolve only the test proposal, without executing it, so a second diagnostic can be exercised.
    const pending = worldEvents().find(
      (e) => e.status === "awaiting_adjudication",
    );
    const declined = await page.evaluate(
      async ({ id, characterId, pendingId }) => {
        const context = (
          await (
            await fetch(
              "/api/world-actions?" +
                new URLSearchParams({ campaignId: id, characterId }),
            )
          ).json()
        ).context;
        return (
          await fetch("/api/world-actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "adjudicate",
              campaignId: id,
              characterId,
              requestId: crypto.randomUUID(),
              expectedState: context.state,
              pendingId,
              decision: "decline",
              duration: null,
              reason: "Isolated test: decline without time or action.",
              confirmed: true,
            }),
          })
        ).ok;
      },
      { id, characterId, pendingId: pending.requestId },
    );
    assert.ok(declined);
    writeFileSync(control, JSON.stringify({ mode: "transfer" }));
    reply = await say("GM, choose the bandit’s next action.");
    assert.match(reply.text, /custody|transfer/);
    assert.equal(worldEvents().at(-1).code, "transfer_unsupported");
    unchanged();
    // An actual new encounter request still enters setup, then a field reply edits that plan.
    reply = await say(
      "Begin a new encounter on a distant forest road near the Watch, with only Edrus and two bandits at Near.",
    );
    assert.doesNotMatch(reply.text, /setup is no longer pending/);
    assert.ok(
      db((r) =>
        r.db
          .prepare(
            "SELECT id FROM combat_setup_proposals WHERE campaign_id=? AND status='pending'",
          )
          .get(id),
      ),
    );
    await say("Change range to Short.");
    assert.equal(
      db(
        (r) =>
          JSON.parse(
            r.db
              .prepare(
                "SELECT proposal_json FROM combat_setup_proposals WHERE campaign_id=? AND status='pending'",
              )
              .get(id).proposal_json,
          ).range,
      ),
      "Short",
    );
    unchanged();
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + id);
    await page.getByLabel("Player action", { exact: true }).waitFor();
    unchanged();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual main chat + controlled SDK; concluded scene with stale superseded/pending setup; ordinary/explicit/full continuation; verified observation and specific pending search/transfer; no restarted combat, altered injury or invented time; replay, refresh, SQLite reopen/server restart; genuine new setup and range clarification. No paid calls.",
    );
  } catch (error) {
    console.error(
      logs
        .split("\n")
        .filter((l) => /error|Error|ravenland.ai.request|api\/gm/.test(l))
        .join("\n"),
    );
    throw error;
  } finally {
    await browser?.close();
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
