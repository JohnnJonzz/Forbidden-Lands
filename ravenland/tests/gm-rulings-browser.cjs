const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync, readFileSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  { createHash, randomUUID } = require("node:crypto"),
  net = require("node:net");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-rulings-browser-")),
    filename = path.join(folder, "isolated.sqlite"),
    callsFile = path.join(folder, "calls.jsonl");
  const load = async (file) =>
    import(pathToFileURL(path.join(root, file)).href);
  const { worldFixture, syntheticWorldRules } = await load(
      "tests/fixtures/world-state.ts",
    ),
    { SqliteCampaignRepository } = await load("src/server/sqlite.ts"),
    { quarterDayGM } = await load("src/server/journey/gm-contract.ts"),
    { dispatchWorldAction } = await load("src/server/world/dispatcher.ts"),
    { worldState } = await load("src/server/world/context.ts"),
    { newConsequence, saveConsequence, readConsequences } = await load(
      "src/server/consequences/store.ts",
    ),
    { CompendiumStore } = await load("src/server/compendium/store.ts"),
    { syncConsequenceRecords, executeConsequence } = await load(
      "src/server/consequences/service.ts",
    ),
    { rulings } = await load("src/server/rulings/store.ts");
  const f = worldFixture(filename);
  quarterDayGM(f.repo).requestForm(f.r.id);
  syntheticWorldRules(f.repo, f.r.id);
  const id = f.r.id,
    actor = f.patient.id,
    principal = f.principal,
    injuryId = f.injury.id;
  const second = newConsequence(
    id,
    {
      ...f.injury.source,
      id: "second-browser-injury",
      procedureId: "second-browser-injury",
    },
    "lethal_injury",
    "Second test injury",
  );
  second.visibility = "Party Known";
  second.characterIds = [actor];
  second.state.deadline = structuredClone(f.injury.state.deadline);
  saveConsequence(f.repo, second);
  dispatchWorldAction(
    {
      type: "reconcile",
      campaignId: id,
      characterId: actor,
      requestId: randomUUID(),
      sceneId: f.e.id,
      expectedState: worldState(f.repo, id),
      reason: "Isolated fixture: old narration remains unverified.",
      confirmed: true,
    },
    f.repo,
    principal,
  );
  dispatchWorldAction(
    f.propose("interact", { interaction: "speak" }),
    f.repo,
    principal,
  );
  const baseline = JSON.stringify(f.repo.get(id).session.characters),
    source = JSON.stringify(
      f.repo.db
        .prepare("SELECT state_json FROM combat_encounters WHERE campaign_id=?")
        .all(id),
    );
  f.repo.close();
  const token = "controlled-hosted-player-012345678901234567890",
    env = {
      ...process.env,
      RAVENLAND_DB_PATH: filename,
      RAVENLAND_AI_MODE: "openai",
      OPENAI_API_KEY: "CONTROLLED_NO_PAID_CALLS",
      RAVENLAND_RULING_CALLS: callsFile,
      RAVENLAND_PLAYER_GRANTS: JSON.stringify([
        {
          playerId: "hosted-player",
          tokenHash: createHash("sha256").update(token).digest("hex"),
          grants: [{ campaignId: id, characterIds: [actor] }],
        },
      ]),
      NODE_OPTIONS:
        (process.env.NODE_OPTIONS || "") +
        " --import=" +
        pathToFileURL(path.join(root, "tests/fixtures/ruling-provider.mjs"))
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
  const current = () => db((r) => r.get(id)),
    elapsed = () =>
      db((r) =>
        readConsequences(r, id)
          .filter((c) => c.state.deadline)
          .map((c) => c.state.deadline.elapsed),
      );
  async function until(fn) {
    for (let i = 0; i < 500; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Timed out: " + logs.slice(-3000));
  }
  async function start(hosted = false) {
    server = spawn(
      process.execPath,
      hosted
        ? [
            "node_modules/next/dist/bin/next",
            "dev",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(port),
          ]
        : ["scripts/dev-local.mjs", "--port", String(port)],
      { cwd: root, env },
    );
    server.stdout.on("data", (d) => (logs += d));
    server.stderr.on("data", (d) => (logs += d));
    await until(async () => {
      try {
        return (await fetch(url + "/api/player-access?campaignId=" + id)).ok;
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
    const count = current().session.messages.length;
    await page.getByLabel("Player action", { exact: true }).fill(text);
    await page
      .getByRole("button", { name: "Send action", exact: true })
      .click();
    await until(async () => {
      const errors = (await page.getByRole("alert").allTextContents())
        .map((v) => v.trim())
        .filter(Boolean);
      if (errors.length) throw Error(errors.join(" "));
      return current().session.messages.length >= count + 2;
    });
    await until(async () => (await page.locator(".ai-stream").count()) === 0);
    return current().session.messages.at(-1);
  }
  function unchanged() {
    assert.equal(JSON.stringify(current().session.characters), baseline);
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
    assert.ok(
      db((r) =>
        readConsequences(r, id)
          .filter((c) => c.state.deadline)
          .every(
            (c) => c.state.deadline.value === 4 && c.state.resolution === null,
          ),
      ),
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
    await page.goto(url + "/campaigns/" + id);
    await page.getByLabel("Player action", { exact: true }).waitFor();
    const reply = await say("Continue the story.");
    assert.match(reply.text, /bounded speak/);
    assert.doesNotMatch(reply.text, /intends to interact/);
    assert.deepEqual(elapsed(), [0, 0]);
    assert.ok(
      db((r) =>
        rulings(r, id).some(
          (v) => v.authority === "A" && v.status === "applied",
        ),
      ),
    );
    unchanged();
    const count = readFileSync(callsFile, "utf8").trim().split("\n").length,
      payload = db((r) =>
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
    assert.equal(
      readFileSync(callsFile, "utf8").trim().split("\n").length,
      count,
    );
    // A precise duration is a protected, typed decision; one event updates both clocks.
    db((r) =>
      dispatchWorldAction(
        {
          type: "propose",
          campaignId: id,
          characterId: actor,
          requestId: randomUUID(),
          sceneId: f.e.id,
          expectedState: worldState(r, id),
          action: f.action("search"),
        },
        r,
        principal,
      ),
    );
    await page.reload();
    const panel = page.getByRole("region", { name: "GM rulings", exact: true });
    await panel
      .getByRole("button", { name: "Resolve duration ruling", exact: true })
      .waitFor();
    const answers = [
      "rounds",
      "1",
      "Explicit test ruling: one actual elapsed round for this supported action.",
    ];
    page.on("dialog", (d) => d.accept(answers.shift()).catch(() => {}));
    await panel
      .getByRole("button", { name: "Resolve duration ruling", exact: true })
      .click();
    await until(() => elapsed().every((v) => v === 1));
    unchanged();
    // Matching house-rule interpretation can clear its own hold without changing either deadline.
    db((r) => {
      new CompendiumStore(r).save(id, {
        title: "Browser Healing exception",
        body: "Isolated test interpretation.",
        topic: "Combat",
        documentType: "House Rule",
        visibility: "Player Visible",
        sourceReference: "Test only",
        overrideScope: "Lifesaving Healing",
      });
      syncConsequenceRecords(r, id);
    });
    await page.reload();
    await panel
      .getByRole("button", { name: "Resolve healing rule ruling", exact: true })
      .first()
      .waitFor();
    answers.push(
      undefined,
      "Explicitly use the verified official procedure for only this named injury.",
    );
    await panel
      .getByRole("button", { name: "Resolve healing rule ruling", exact: true })
      .first()
      .click();
    await until(() =>
      db((r) =>
        rulings(r, id).some(
          (v) => v.domain === "healing_rule" && v.status === "applied",
        ),
      ),
    );
    assert.deepEqual(elapsed(), [1, 1]);
    unchanged();
    db((r) =>
      executeConsequence(
        {
          type: "adjudication",
          campaignId: id,
          characterId: actor,
          requestId: randomUUID(),
          consequenceId: injuryId,
          note: "Protected browser timing question remains unresolved.",
          confirmed: true,
        },
        r,
        principal,
      ),
    );
    await page.reload();
    await panel
      .getByText(/Protected browser timing question/)
      .first()
      .waitFor();
    await page.goto("about:blank");
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + id);
    await panel
      .getByText(/Protected browser timing question/)
      .first()
      .waitFor();
    assert.deepEqual(elapsed(), [1, 1]);
    unchanged();
    // Hosted mode has no stamped local-controller capability. Neither anonymous
    // requests nor a real player token plus a forged GM label can mutate GM state.
    await page.goto("about:blank");
    await stop();
    await start(true);
    const headers = { "Content-Type": "application/json" },
      weather = {
        type: "weather",
        campaignId: id,
        revision: current().revision,
        actionId: randomUUID(),
        description: "Forged weather",
        source: "Manual",
        unverifiedEffects: "",
      };
    let response = await fetch(url + "/api/journey", {
      method: "POST",
      headers,
      body: JSON.stringify(weather),
    });
    assert.ok([401, 403].includes(response.status));
    response = await fetch(url + "/api/journey", {
      method: "POST",
      headers: { ...headers, authorization: "Bearer " + token, "x-role": "gm" },
      body: JSON.stringify(weather),
    });
    assert.equal(response.status, 403);
    response = await fetch(url + "/api/campaigns", {
      method: "PUT",
      headers: { ...headers, authorization: "Bearer " + token, "x-role": "gm" },
      body: JSON.stringify({
        id,
        revision: current().revision,
        session: current().session,
      }),
    });
    assert.equal(response.status, 403);
    const view = await (
      await fetch(
        url +
          "/api/rulings?" +
          new URLSearchParams({ campaignId: id, characterId: actor }),
        { headers: { authorization: "Bearer " + token } },
      )
    ).json();
    assert.equal(view.localController, false);
    assert.ok(view.rulings.some((r) => r.status === "awaiting_review"));
    assert.ok(view.rulings.every((r) => !("facts" in r) && !("sources" in r)));
    assert.deepEqual(elapsed(), [1, 1]);
    unchanged();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: main chat routine AI ruling without approval; recorded precise duration affects two deadlines once; no theft/recovery; scope-matched Healing override; persistent protected hold; UI/refresh/replay/reopen/server restart; hosted anonymous/forged-GM mutations denied; no paid calls.",
    );
  } catch (e) {
    console.error(
      logs
        .split("\n")
        .filter((v) => /error|Error|ravenland.ai.request|POST \/api/.test(v))
        .slice(-18)
        .join("\n"),
    );
    throw e;
  } finally {
    await browser?.close();
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
