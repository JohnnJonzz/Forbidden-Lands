const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  { mkdtempSync, rmSync } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  net = require("node:net"),
  { randomUUID, createHash } = require("node:crypto");
const { createSyntheticProfile } = require("../scripts/phase7-setup.ts"),
  { SqliteCampaignRepository } = require("../src/server/sqlite.ts"),
  { upgradeRollQueue } = require("../src/server/gameplay/upgrade.ts"),
  { upgradeTestRuns } = require("../src/server/gameplay/test-runs.ts");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-b2-security-")),
    p = createSyntheticProfile(path.join(folder, "profile")),
    file = path.join(p.root, "phase7-profile.json"),
    repo = new SqliteCampaignRepository(p.database);
  upgradeRollQueue(repo, file);
  upgradeTestRuns(repo, file);
  const token = randomUUID() + randomUUID(),
    grants = [
      {
        playerId: "ordinary-player",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        grants: [
          {
            campaignId: p.campaignId,
            characterIds: repo
              .get(p.campaignId)
              .session.characters.map((c) => c.id),
          },
        ],
      },
    ],
    before = repo.get(p.campaignId),
    run = repo.db.prepare("SELECT run_id FROM phase7_test_runs").get().run_id;
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
  try {
    const env = {
      ...process.env,
      RAVENLAND_PHASE7_PROFILE: file,
      RAVENLAND_DB_PATH: p.database,
      RAVENLAND_SOURCEBOOK_DIR: p.sourcebooks,
      RAVENLAND_IMAGE_DIR: p.images,
      RAVENLAND_PLAYER_GRANTS: JSON.stringify(grants),
    };
    delete env.RAVENLAND_LOCAL_RUNTIME_KEY;
    delete env.OPENAI_API_KEY;
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: root, env },
    );
    server.stdout.on("data", (d) => (logs += d));
    server.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 250; i++) {
      try {
        if ((await fetch(url)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
        extraHTTPHeaders: { Authorization: "Bearer " + token },
      }),
      page = await context.newPage();
    await page.goto(url + "/campaigns/" + p.campaignId + "/play");
    await page.getByRole("button", { name: "Tell the GM" }).waitFor();
    assert.equal(
      await page.getByText("Development Testing", { exact: true }).count(),
      0,
    );
    const denied = await page.evaluate(
      async ({ id, run }) => {
        const get = await fetch(
            "/api/gameplay/testing?" +
              new URLSearchParams({ campaignId: id, actorId: "ilva" }),
          ),
          post = await fetch("/api/gameplay/testing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaignId: id,
              actorId: "ilva",
              operationId: crypto.randomUUID(),
              runId: run,
              previewHash: "a".repeat(64),
              confirmation: "Create Fresh Synthetic Test Baseline",
            }),
          }),
          legacy = await fetch("/api/journey", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
        return {
          get: get.status,
          getBody: await get.json(),
          post: post.status,
          postBody: await post.json(),
          legacy: legacy.status,
        };
      },
      { id: p.campaignId, run },
    );
    assert.equal(denied.get, 403);
    assert.notEqual(denied.post, 200);
    assert.match(denied.postBody.error, /actual Table GM/);
    assert.equal(denied.legacy, 409);
    assert.deepEqual(repo.get(p.campaignId), before);
    const unauth = await browser.newPage();
    await unauth.goto(url);
    const no = await unauth.evaluate(
      async (id) => (await fetch("/api/gameplay?campaignId=" + id)).status,
      p.campaignId,
    );
    assert.equal(no, 403);
    assert.equal(
      await unauth.getByText("Development Testing", { exact: true }).count(),
      0,
    );
    // Assign the actual authenticated identity: same token now genuinely is Table GM.
    repo.db
      .prepare("INSERT INTO table_gm_settings VALUES (?,?,?,?,?)")
      .run(
        p.campaignId,
        "ordinary-player",
        1,
        "test-controller",
        new Date().toISOString(),
      );
    await page.reload();
    await page.getByText("Development Testing", { exact: true }).waitFor();
    const allowed = await page.evaluate(
      async (id) =>
        (
          await fetch(
            "/api/gameplay/testing?" +
              new URLSearchParams({ campaignId: id, actorId: "ilva" }),
          )
        ).status,
      p.campaignId,
    );
    assert.equal(allowed, 200);
    assert.deepEqual(repo.get(p.campaignId), before);
    console.log(
      "PASS hosted Chromium: authenticated ordinary player cannot see or execute Development Testing; no credentials denied; legacy mutation blocked; actual Table GM assignment enables reviewed preview; no campaign state changed.",
    );
  } finally {
    await browser?.close();
    if (server?.exitCode === null)
      await new Promise((r) => {
        server.once("exit", r);
        server.kill("SIGTERM");
      });
    repo.close();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
