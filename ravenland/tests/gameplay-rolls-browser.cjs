const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  {
    mkdtempSync,
    rmSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    existsSync,
  } = require("node:fs"),
  path = require("node:path"),
  { tmpdir } = require("node:os"),
  { pathToFileURL } = require("node:url"),
  net = require("node:net");
const { rollFixture } = require("./phase7-roll-fixture.ts");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-7b-browser-")),
    f = await rollFixture(folder),
    control = path.join(folder, "dice.json"),
    modelLog = path.join(folder, "models.log");
  writeFileSync(control, JSON.stringify({ value: 6 }));
  const env = {
    ...process.env,
    RAVENLAND_TEST_DICE_FILE: control,
    RAVENLAND_TEST_MODEL_LOG: modelLog,
    NODE_OPTIONS:
      (process.env.NODE_OPTIONS || "") +
      " --import=" +
      pathToFileURL(path.join(__dirname, "fixtures/phase7-dice-runtime.mjs"))
        .href,
  };
  delete env.OPENAI_API_KEY;
  const port = await new Promise((r) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const p = server.address().port;
        server.close(() => r(p));
      });
    }),
    url = "http://127.0.0.1:" + port;
  let server,
    browser,
    logs = "";
  const errors = [],
    requests = [];
  async function until(fn) {
    for (let i = 0; i < 250; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error("Timed out. " + logs.slice(-2200));
  }
  async function start() {
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
  function value(n) {
    writeFileSync(control, JSON.stringify({ value: n }));
  }
  try {
    const before = f.repo.get(f.id).session;
    await start();
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/")) requests.push(new URL(r.url()).pathname);
    });
    await page.goto(url + "/campaigns/" + f.id + "/play");
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill(
        "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.",
      );
    await page.getByRole("button", { name: "Tell the GM" }).click();
    await until(async () => f.all().length === 3);
    await page
      .getByRole("heading", { name: "Pending Rolls", exact: true })
      .waitFor();
    const activityId = f.all()[0].activityId;
    async function sheet(procedure) {
      const r = f.find(procedure);
      await page.goto(
        url +
          "/campaigns/" +
          f.id +
          "/characters/" +
          r.characterId +
          "?request=" +
          r.id,
      );
      await page.locator('[data-procedure="' + procedure + '"]').waitFor();
    }
    await sheet("camp");
    value(6);
    await page
      .locator("[data-procedure=camp]")
      .getByRole("button", { name: "Roll Survival", exact: true })
      .click();
    await until(async () => f.find("camp").status === "resolved");
    // Exercise the existing embedded skill control as well as the universal linked tray.
    await sheet("watch");
    value(6);
    const iframe = page.frameLocator('iframe[title*="character sheet"]');
    await iframe
      .getByRole("button", { name: "Stage Scouting dice", exact: true })
      .waitFor();
    await page
      .frames()
      .find((f) => f.url().includes("character-sheet-"))
      .evaluate(() => {
        Math.random = () => {
          throw Error("Phase 7 sheet must not generate tentative local faces");
        };
      });
    await iframe
      .getByRole("button", { name: "Stage Scouting dice", exact: true })
      .click();
    await iframe.locator("#btn-roll-pool").click();
    await until(async () => f.find("watch").status === "resolved");
    await sheet("forage");
    value(2);
    await page
      .locator("[data-procedure=forage]")
      .getByRole("button", { name: "Roll Survival", exact: true })
      .click();
    await until(
      async () => f.find("forage").status === "awaiting_push_decision",
    );
    await page
      .getByRole("button", { name: "Keep result", exact: true })
      .click();
    await until(async () => !!f.find("forage-mishap"));
    value(3);
    await page
      .locator("[data-procedure=forage-mishap]")
      .getByRole("button", { name: "Roll D6", exact: true })
      .click();
    await until(async () => !!f.find("forage-duration"));
    value(4);
    await page
      .locator("[data-procedure=forage-duration]")
      .getByRole("button", { name: "Roll D6", exact: true })
      .click();
    await until(async () => f.find("forage-duration").status === "resolved");
    await page
      .locator("[data-procedure=forage-duration] > p")
      .filter({ hasText: /RUN becomes a slow action for 4 days/ })
      .waitFor();
    const saved = f.repo.get(f.id),
      ids = saved.session.dice.map((d) => d.id);
    assert.equal(ids.length, 5);
    assert.deepEqual(saved.session.characters, before.characters);
    assert.deepEqual(saved.session.campaign, before.campaign);
    assert.equal(f.all().length, 5);
    assert.equal(
      f.all().every((r) => r.status === "resolved"),
      true,
    );
    await page.reload();
    await page
      .locator("[data-procedure=forage-duration] > p")
      .filter({ hasText: /RUN becomes a slow action for 4 days/ })
      .waitFor();
    assert.deepEqual(
      f.repo.get(f.id).session.dice.map((d) => d.id),
      ids,
    );
    const second = await browser.newPage();
    await second.goto(url + "/campaigns/" + f.id + "/characters/ilva");
    await second
      .locator("[data-procedure=forage-duration] > p")
      .filter({ hasText: /RUN becomes a slow action for 4 days/ })
      .waitFor();
    assert.deepEqual(
      f.repo.get(f.id).session.dice.map((d) => d.id),
      ids,
    );
    await second.close();
    const out =
      process.env.RAVENLAND_BROWSER_ARTIFACT_DIR ||
      path.join(folder, "screens");
    mkdirSync(out, { recursive: true });
    await page.screenshot({
      path: path.join(out, "phase7b-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
      .locator("[data-procedure=forage-duration] > p")
      .filter({ hasText: /RUN becomes a slow action for 4 days/ })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await until(
      async () =>
        await page
          .locator("iframe")
          .evaluate(
            (el) =>
              !!el.contentDocument?.querySelector("#attr-strength") &&
              el.clientHeight + 8 >=
                el.contentDocument.documentElement.scrollHeight,
          ),
    );
    await page
      .getByRole("combobox", { name: "Dice expression", exact: true })
      .selectOption("D20");
    assert.equal(
      await page
        .getByRole("button", { name: "Roll miscellaneous dice", exact: true })
        .isEnabled(),
      true,
    );
    await page.screenshot({
      path: path.join(out, "phase7b-mobile.png"),
      fullPage: true,
    });
    await stop();
    await start();
    await page.goto(url + "/campaigns/" + f.id + "/play");
    await page.getByTestId("current-quarter").waitFor();
    assert.equal(
      await page.getByTestId("current-quarter").innerText(),
      "Evening",
    );
    assert.deepEqual(
      f.repo.get(f.id).session.dice.map((d) => d.id),
      ids,
    );
    assert.equal(
      f.repo.db.prepare("SELECT COUNT(*) n FROM ai_requests").get().n,
      0,
    );
    assert.equal(
      f.repo.db.prepare("SELECT COUNT(*) n FROM ai_usage").get().n,
      0,
    );
    assert.equal(
      existsSync(modelLog) ? readFileSync(modelLog, "utf8") : "",
      "",
    );
    assert.equal(
      requests.some((p) =>
        [
          "/api/gm",
          "/api/journey",
          "/api/quarter-resolution",
          "/api/combat",
        ].includes(p),
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: "PASS",
        activityId,
        requests: 5,
        savedRolls: ids.length,
        foragingMishap: 3,
        healingDays: 4,
        permanentInjuryApplied: false,
        clock: "Evening",
        modelRequests: 0,
        desktop: "1440x1000",
        mobile: "390x844",
        reloadRestartSecondWindow: true,
        screenshots: out,
      }),
    );
  } finally {
    if (browser) await browser.close();
    await stop();
    f.close();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
