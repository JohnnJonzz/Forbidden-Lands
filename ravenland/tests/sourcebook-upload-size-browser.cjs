const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  { DatabaseSync, backup } = require("node:sqlite"),
  {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    rmSync,
    openSync,
    ftruncateSync,
    closeSync,
  } = require("node:fs"),
  { tmpdir } = require("node:os"),
  path = require("node:path"),
  net = require("node:net"),
  http = require("node:http"),
  { createHash, randomUUID } = require("node:crypto");
const { readProfile } = require("../src/server/gameplay/profile.ts"),
  { SqliteCampaignRepository } = require("../src/server/sqlite.ts"),
  { SourcebookLibrary } = require("../src/server/sourcebooks/library.ts"),
  { FileSourcebookStorage } = require("../src/server/sourcebooks/storage.ts"),
  { requests: rollRequests } = require("../src/server/gameplay/roll-store.ts"),
  { sprainEvidence } = require("../src/server/gameplay/roll-rules.ts"),
  { pdf } = require("./fixtures/sourcebook-pdf.cjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = mkdtempSync(path.join(tmpdir(), "raven-upload-hotfix-")),
    original = readProfile(
      process.env.RAVENLAND_UPLOAD_TEST_PROFILE ||
        "/workspace/phase7-development/phase7-profile.json",
    ),
    dbfile = path.join(folder, "campaign.sqlite");
  // Clone the existing development campaign; never create a replacement campaign.
  const source = new DatabaseSync(original.database, { readOnly: true });
  const sourceCampaign = source
    .prepare("SELECT public_state FROM campaigns WHERE id=?")
    .get(original.campaignId).public_state;
  await backup(source, dbfile);
  source.close();
  const p = {
    ...original,
    root: folder,
    database: dbfile,
    images: path.join(folder, "images"),
    sourcebooks: path.join(folder, "sourcebooks"),
  };
  mkdirSync(p.images);
  mkdirSync(p.sourcebooks);
  writeFileSync(path.join(folder, "phase7-profile.json"), JSON.stringify(p), {
    mode: 0o600,
  });
  const repo = new SqliteCampaignRepository(dbfile),
    id = p.campaignId,
    token = "synthetic-upload-administrator-token-" + randomUUID(),
    env = {
      ...process.env,
      RAVENLAND_GM_REVIEW_TOKEN: token,
      RAVENLAND_SOURCEBOOK_MAX_MB: "64",
    };
  const bookPath =
      process.env.RAVENLAND_UPLOAD_TEST_HANDBOOK ||
      path.join(
        process.env.RAVENLAND_REAL_SOURCEBOOK_DIR ||
          "/tmp/ravenland-private-sourcebooks",
        "Forbidden_Lands_Players_Handbook_5th_printing.pdf",
      ),
    book = readFileSync(bookPath),
    bookHash = createHash("sha256").update(book).digest("hex");
  assert.ok(book.length > 10 * 1048576 && book.length < 64 * 1048576);
  assert.equal(repo.list().length, 1);
  assert.equal(
    repo.db.prepare("SELECT COUNT(*) n FROM source_documents").get().n,
    0,
    "Use an empty development-library snapshot for this acceptance test.",
  );
  const port = await new Promise((r) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const port = s.address().port;
        s.close(() => r(port));
      });
    }),
    url = "http://127.0.0.1:" + port;
  let server,
    browser,
    logs = "",
    verifiedBeforeIndex = false,
    uploadPosts = 0;
  const errors = [];
  async function until(fn) {
    for (let i = 0; i < 350; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error("Timeout. " + logs.slice(-2000));
  }
  async function start() {
    server = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/dev-phase7.ts",
        "--directory",
        folder,
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
  const endpoint = (name, title = "Small upload regression") =>
    url +
    "/api/sourcebooks?" +
    new URLSearchParams({
      campaignId: id,
      title,
      category: "Rules",
      visibility: "GM Only",
      filename: name,
    });
  async function upload(bytes, name, headers = {}) {
    const r = await fetch(endpoint(name), {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "x-ravenland-gm-token": token,
        ...headers,
      },
      body: bytes,
    });
    return { status: r.status, body: await r.json() };
  }
  async function api(c) {
    const r = await fetch(url + "/api/sourcebooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ravenland-gm-token": token,
      },
      body: JSON.stringify({ campaignId: id, ...c }),
    });
    assert.equal(r.status, 200);
    return r.json();
  }
  function docs() {
    return repo.db
      .prepare("SELECT * FROM source_documents ORDER BY uploaded_at,id")
      .all();
  }
  try {
    await start();
    const small = pdf([
      [
        "PRIVATE_UPLOAD_MARKER",
        "A small original synthetic PDF upload fixture.",
      ],
    ]);
    assert.ok(small.length < 10 * 1048576);
    const denied = await upload(small, "denied.pdf", {
      "x-ravenland-gm-token": "wrong-token",
    });
    assert.equal(denied.status, 403);
    assert.equal(docs().length, 0);
    assert.equal(
      (await fetch(url + "/api/sourcebooks?campaignId=" + id)).status,
      403,
    );
    const good = await upload(small, "small.pdf");
    assert.equal(good.status, 200);
    assert.equal(good.body.document.fileSize, small.length);
    assert.equal(good.body.document.visibility, "GM Only");
    const smallDoc = docs()[0];
    assert.deepEqual(
      readFileSync(path.join(p.sourcebooks, smallDoc.storage_key)),
      small,
    );
    assert.equal(
      (await api({ type: "index", documentId: smallDoc.id })).document.status,
      "Indexed",
    );
    assert.deepEqual(
      new SourcebookLibrary(
        repo,
        new FileSourcebookStorage(p.sourcebooks),
      ).search({ campaignId: id, query: "PRIVATE_UPLOAD_MARKER" }, "player"),
      [],
    );
    const beforeMalformed = docs().length;
    const malformed = await upload(Buffer.from("not a PDF"), "bad-header.pdf");
    assert.equal(malformed.status, 400);
    assert.equal(docs().length, beforeMalformed);
    const conflicting = await upload(small, "conflicting-size.pdf", {
      "x-ravenland-upload-size": String(small.length + 50),
    });
    assert.equal(conflicting.status, 400);
    assert.match(conflicting.body.error, /disagree/);
    assert.equal(docs().length, beforeMalformed);
    const oversize = await upload(
      Buffer.alloc(64 * 1048576 + 1),
      "oversize.pdf",
    );
    assert.equal(oversize.status, 413);
    assert.match(oversize.body.error, /64 MB/);
    assert.equal(docs().length, beforeMalformed);
    assert.equal(
      readdirSync(p.sourcebooks).some((f) => f.endsWith(".tmp")),
      false,
    );
    // Real interrupted chunked HTTP upload: no document or temporary file remains.
    await new Promise((resolve) => {
      const req = http.request(endpoint("interrupted.pdf"), {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "x-ravenland-gm-token": token,
          "x-ravenland-upload-size": String(small.length + 1000),
        },
      });
      req.on("error", () => resolve());
      req.on("close", resolve);
      req.flushHeaders();
      req.write(small.subarray(0, 50));
      setTimeout(() => req.destroy(), 30);
    });
    assert.equal(docs().length, beforeMalformed);
    assert.equal((await fetch(url)).ok, true);
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
      if (
        r.method() === "POST" &&
        r.url().includes("/api/sourcebooks") &&
        r.headers()["content-type"] === "application/pdf"
      )
        uploadPosts++;
    });
    await page.goto(url + "/campaigns/" + id + "/play");
    await page
      .getByLabel("Party declaration", { exact: true })
      .fill(
        "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.",
      );
    await page
      .getByRole("button", { name: "Tell the GM", exact: true })
      .click();
    await until(async () => rollRequests(repo, id).length === 3);
    assert.ok(
      rollRequests(repo, id).every(
        (r) => r.status === "awaiting_mechanical_review",
      ),
    );
    await page
      .getByRole("button", { name: "Rules Library", exact: true })
      .click();
    const library = page.getByRole("region", {
      name: "Sourcebook Library",
      exact: true,
    });
    await library
      .getByLabel("Sourcebook administrator token", { exact: true })
      .fill(token);
    await library
      .getByRole("button", { name: "Unlock Sourcebook Library", exact: true })
      .click();
    await library.getByLabel("Sourcebook PDF", { exact: true }).waitFor();
    assert.match(await library.innerText(), /Maximum 64 MB/);
    // Frontend oversize guard reports the failure without even sending an upload.
    const largeFile = path.join(folder, "too-large.pdf"),
      fd = openSync(largeFile, "wx");
    ftruncateSync(fd, 64 * 1048576 + 1);
    closeSync(fd);
    await library
      .getByLabel("Sourcebook PDF", { exact: true })
      .setInputFiles(largeFile);
    const count = uploadPosts;
    await library
      .getByRole("button", { name: "Upload and Index", exact: true })
      .click();
    await library.locator(":scope > [role=alert]").waitFor();
    assert.match(
      await library.locator(":scope > [role=alert]").innerText(),
      /64 MB/,
    );
    assert.equal(uploadPosts, count);
    // Malformed but header/trailer-bearing PDF reaches indexing; failure is a visible alert.
    await library
      .getByLabel("Sourcebook PDF", { exact: true })
      .setInputFiles({
        name: "broken.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.7\nThis is malformed synthetic material, not a valid PDF structure.\n%%EOF",
        ),
      });
    await library
      .getByRole("button", { name: "Upload and Index", exact: true })
      .click();
    await until(async () =>
      docs().some(
        (d) => d.original_filename === "broken.pdf" && d.status === "Failed",
      ),
    );
    await library.locator(":scope > [role=alert]").waitFor();
    assert.match(
      await library.locator(":scope > [role=alert]").innerText(),
      /structure|index/i,
    );
    assert.equal(
      repo.db
        .prepare("SELECT COUNT(*) n FROM source_chunks WHERE document_id=?")
        .get(docs().find((d) => d.original_filename === "broken.pdf").id).n,
      0,
    );
    // A non-JSON upstream rejection must also be a visible, readable library alert.
    const proxyFailure = async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().url().includes("proxy-rejection.pdf")
      )
        await route.fulfill({
          status: 413,
          contentType: "text/html",
          body: "<h1>Upstream request too large</h1>",
        });
      else await route.continue();
    };
    await page.route("**/api/sourcebooks**", proxyFailure);
    await library
      .getByLabel("Sourcebook PDF", { exact: true })
      .setInputFiles({
        name: "proxy-rejection.pdf",
        mimeType: "application/pdf",
        buffer: small,
      });
    await library
      .getByRole("button", { name: "Upload and Index", exact: true })
      .click();
    await library.locator(":scope > [role=alert]").waitFor();
    assert.match(
      await library.locator(":scope > [role=alert]").innerText(),
      /HTTP 413/,
    );
    await page.unroute("**/api/sourcebooks**", proxyFailure);
    // Check complete bytes at the UI's actual indexing boundary, before the server indexer runs.
    await page.route("**/api/sourcebooks**", async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["content-type"] === "application/json"
      ) {
        const command = request.postDataJSON();
        if (command.type === "index") {
          const row = repo.db
            .prepare("SELECT * FROM source_documents WHERE id=?")
            .get(command.documentId);
          if (row?.original_filename === path.basename(bookPath)) {
            assert.equal(row.file_size, book.length);
            assert.equal(row.sha256, bookHash);
            assert.equal(row.status, "Uploaded");
            const stored = readFileSync(
              path.join(p.sourcebooks, row.storage_key),
            );
            assert.equal(stored.length, book.length);
            assert.equal(
              createHash("sha256").update(stored).digest("hex"),
              bookHash,
            );
            verifiedBeforeIndex = true;
          }
        }
      }
      await route.continue();
    });
    await library
      .getByLabel("Sourcebook PDF", { exact: true })
      .setInputFiles(bookPath);
    await library
      .getByLabel("New sourcebook title", { exact: true })
      .fill("Forbidden Lands Players Handbook");
    await library
      .getByRole("button", { name: "Upload and Index", exact: true })
      .click();
    await until(async () =>
      docs().some(
        (d) =>
          d.original_filename === path.basename(bookPath) &&
          d.status === "Indexed",
      ),
    );
    await library.getByText("Sourcebook indexed.", { exact: true }).waitFor();
    assert.equal(verifiedBeforeIndex, true);
    assert.equal(await library.locator(":scope > [role=alert]").count(), 0);
    const uploaded = docs().find(
      (d) => d.original_filename === path.basename(bookPath),
    );
    assert.equal(uploaded.visibility, "GM Only");
    assert.equal(uploaded.category, "Rules");
    assert.ok(uploaded.page_count > 180);
    assert.ok(
      repo.db
        .prepare("SELECT COUNT(*) n FROM source_chunks WHERE document_id=?")
        .get(uploaded.id).n > 180,
    );
    assert.ok(
      sprainEvidence(repo, id).every((s) => s.documentId === uploaded.id),
    );
    assert.deepEqual(
      sprainEvidence(repo, id).map((s) => s.page),
      [154, 201, 113],
    );
    assert.deepEqual(
      new SourcebookLibrary(
        repo,
        new FileSourcebookStorage(p.sourcebooks),
      ).search({ campaignId: id, query: "FORAGING MISHAPS" }, "player"),
      [],
    );
    await page.getByRole("button",{name:"Conversation",exact:true}).click();
    for (const procedure of ["camp", "forage", "watch"]) {
      await page
        .locator("[data-procedure=" + procedure + "]")
        .getByRole("button", { name: "Recheck sheet and sources", exact: true })
        .click();
      await until(
        async () =>
          rollRequests(repo, id).find((r) => r.procedure === procedure)
            .status === "awaiting_roll",
      );
    }
    assert.ok(
      rollRequests(repo, id).every(
        (r) => r.status === "awaiting_roll" && r.sources.length > 0,
      ),
    );
    assert.equal(repo.get(id).session.campaign.quarter, "Evening");
    assert.equal(
      repo.db.prepare("SELECT public_state FROM campaigns WHERE id=?").get(id)
        .public_state,
      sourceCampaign,
    );
    assert.equal(repo.list().length, 1);
    const artifact =
      process.env.RAVENLAND_BROWSER_ARTIFACT_DIR ||
      path.join(folder, "screens");
    mkdirSync(artifact, { recursive: true });
    await page.screenshot({
      path: path.join(artifact, "upload-handbook-indexed.png"),
      fullPage: false,
    });
    await browser.close();
    browser = null;
    await stop();
    await start();
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const restartedPage = await browser.newPage();
    await restartedPage.goto(url + "/campaigns/" + id + "/play");
    await restartedPage.locator("[data-procedure=forage]").waitFor();
    await restartedPage
      .locator("[data-procedure=forage]")
      .getByRole("button", { name: "Recheck sheet and sources", exact: true })
      .click();
    await until(
      async () =>
        rollRequests(repo, id).find((r) => r.procedure === "forage").revision >=
        3,
    );
    assert.ok(
      rollRequests(repo, id).every((r) => r.status === "awaiting_roll"),
    );
    assert.equal(docs().find((d) => d.id === uploaded.id).status, "Indexed");
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(p.sourcebooks, uploaded.storage_key)))
        .digest("hex"),
      bookHash,
    );
    assert.equal(
      readdirSync(p.sourcebooks).some((f) => f.endsWith(".tmp")),
      false,
    );
    assert.equal(/Request body exceeded 10MB/.test(logs), false);
    assert.deepEqual(errors, []);
    const unchanged = new DatabaseSync(original.database, { readOnly: true });
    assert.equal(
      unchanged.prepare("SELECT public_state FROM campaigns WHERE id=?").get(id)
        .public_state,
      sourceCampaign,
    );
    assert.equal(
      unchanged.prepare("SELECT COUNT(*) n FROM source_documents").get().n,
      0,
    );
    unchanged.close();
    console.log(
      JSON.stringify({
        result: "PASS",
        sameExistingCampaignId: id,
        originalBytes: book.length,
        storedBytes: uploaded.file_size,
        completeSHA256BeforeIndex: true,
        physicalPages: uploaded.page_count,
        privateVisibility: "GM Only",
        below10MB: true,
        above10MBOriginal: true,
        above64MB: "413 and visible client rejection",
        malformed: "visible indexing failure",
        interrupted: "no document or partial file",
        recheck: "three source blockers cleared",
        restart: true,
        existingProfileUnchanged: true,
        screenshots: artifact,
      }),
    );
  } finally {
    if (browser) await browser.close();
    await stop();
    repo.close();
    rmSync(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
