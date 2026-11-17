// Isolated SQLite and controlled application intentions. No model or paid API calls.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  net = require("node:net");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-world-browser-")),
    filename = path.join(folder, "db.sqlite");
  const { worldFixture, syntheticWorldRules } = await import(
      pathToFileURL(path.join(root, "tests/fixtures/world-state.ts")).href
    ),
    { dispatchWorldAction } = await import(
      pathToFileURL(path.join(root, "src/server/world/dispatcher.ts")).href
    ),
    { SqliteCampaignRepository } = await import(
      pathToFileURL(path.join(root, "src/server/sqlite.ts")).href
    );
  const {quarterDayGM}=await import(pathToFileURL(path.join(root,'src/server/journey/gm-contract.ts')).href);
  const f = worldFixture(filename);
  quarterDayGM(f.repo).requestForm(f.r.id);
  syntheticWorldRules(f.repo, f.r.id);
  const proposal = f.propose("search");

  const id = f.r.id,
    characterId = f.patient.id,
    injuryId = f.injury.id,
    baseline = JSON.stringify(f.repo.get(id).session.characters);
  f.repo.close();
  const port = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
    }),
    url = "http://127.0.0.1:" + port;
  const env = {
    ...process.env,
    RAVENLAND_DB_PATH: filename,
    RAVENLAND_AI_MODE: "mock",
    RAVENLAND_PLAYER_GRANTS: "[]",
  };
  delete env.NODE_ENV;
  delete env.RAVENLAND_LOCAL_RUNTIME_KEY;
  delete env.OPENAI_API_KEY;
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
  const elapsed = () =>
    db(
      (r) =>
        JSON.parse(
          r.db
            .prepare("SELECT state_json FROM campaign_consequences WHERE id=?")
            .get(injuryId).state_json,
        ).state.deadline.elapsed,
    );
  async function until(fn) {
    for (let i = 0; i < 500; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Timed out: " + logs.slice(-2500));
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
  try {
    await start();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url + "/campaigns/" + id);
    await page.getByLabel('Player action',{exact:true}).waitFor();
    const {worldState}=await import(pathToFileURL(path.join(root,'src/server/world/context.ts')).href);
    db(r=>dispatchWorldAction({...proposal,expectedState:worldState(r,id)},r,f.principal));
    await page.evaluate(()=>window.dispatchEvent(new Event('ravenland:ai-refresh')));
    const panel = page.getByRole("region", {
      name: "World actions",
      exact: true,
    });
    await panel
      .getByRole("button", {
        name: "Adjudicate proposed NPC action and duration",
      })
      .waitFor();
    assert.equal(elapsed(), 0);
    await page.reload();
    await panel
      .getByRole("button", {
        name: "Adjudicate proposed NPC action and duration",
      })
      .waitFor();
    assert.equal(elapsed(), 0);
    const dialogs = [
      "rounds",
      "1",
      "Explicit browser ruling: close access, no resistance, one elapsed round.",
    ];
    page.on("dialog", (d) => d.accept(dialogs.shift()).catch(() => {}));
    await panel
      .getByRole("button", {
        name: "Adjudicate proposed NPC action and duration",
      })
      .click();
    await until(async()=>{const alert=await panel.getByRole('alert').allTextContents();if(alert.length)throw Error('World adjudication rejected: '+alert.join(' '));return elapsed()===1});
    await until(
      async () =>
        (await panel.getByText(/completed the accessible search/).count()) > 0,
    );
    assert.equal(
      db((r) => JSON.stringify(r.get(id).session.characters)),
      baseline,
    );
    const receipt = db((r) =>
      r.db
        .prepare(
          "SELECT request_id,result_json FROM consequence_commands WHERE campaign_id=? AND json_extract(result_json,'$.worldEvent.code')='searched'",
        )
        .get(id),
    );
    assert.ok(receipt);
    assert.equal(
      db((r) => JSON.parse(receipt.result_json).worldEvent.elapsed.amount),
      1,
    );
    await page.reload();
    await panel
      .getByText(/completed the accessible search/)
      .first()
      .waitFor();
    assert.equal(elapsed(), 1);
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + id);
    await panel
      .getByText(/completed the accessible search/)
      .first()
      .waitFor();
    assert.equal(elapsed(), 1);
    assert.deepEqual(errors, []);
    // HTTP ownership and forged client inputs remain subject to dispatcher checks.
    const data = await page.evaluate(
      async ({ id, characterId }) =>
        await (
          await fetch(
            "/api/world-actions?" +
              new URLSearchParams({ campaignId: id, characterId }),
          )
        ).json(),
      { id, characterId },
    );
    assert.equal(data.context.pending, null);
    assert.ok(data.context.recentEvents.some((e) => e.code === "searched"));
    assert.match(await panel.innerText(), /1 rounds/);
    const forged = await page.evaluate(
      async ({ id, characterId, sceneId, state }) => {
        const r = await fetch("/api/world-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "propose",
            campaignId: id,
            characterId,
            requestId: crypto.randomUUID(),
            sceneId,
            expectedState: state,
            action: {
              kind: "observe",
              actorId: characterId,
              targetId: null,
              itemRef: null,
              destination: null,
              interaction: null,
              intent: "forged NPC control",
            },
          }),
        });
        return r.status;
      },
      {
        id,
        characterId,
        sceneId: data.context.sceneId,
        state: data.context.state,
      },
    );
    assert.equal(forged, 403);
    console.log(
      "PASS: world adjudication UI; isolated 4→3 deadline; no inventory mutation; refresh and server restart preserve exactly one event; no paid calls.",
    );
  } finally {
    await browser?.close();
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
