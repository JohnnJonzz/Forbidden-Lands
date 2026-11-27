import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rollFixture } from "./phase7-roll-fixture";
import {
  upgradeTestRuns,
  testRun,
  resetPreview,
  resetTest,
} from "../src/server/gameplay/test-runs";
import {
  executeGameplay,
  gameplayView,
  readActivity,
} from "../src/server/gameplay/service";
import { executeRoll } from "../src/server/gameplay/roll-engine";
import { converse } from "../src/server/gameplay/conversation";
const sentence =
  "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.";
async function fixture() {
  const f = await rollFixture();
  return {
    ...f,
    upgrade: () => upgradeTestRuns(f.repo, f.file),
    cmd: (input: object = { type: "declare", text: sentence }) => ({
      campaignId: f.id,
      actorId: f.actor,
      operationId: randomUUID(),
      campaignRevision: f.repo.get(f.id)!.revision,
      activityRevision: readActivity(f.repo, f.id)?.revision ?? null,
      runId: testRun(f.repo, f.id)?.id,
      ...input,
    }),
  };
}
test("B.2 upgrade is additive/idempotent: pre-existing Elyanna Watch Push, source index and GM configuration survive reads and reopen", async () => {
  const f = await fixture();
  try {
    const plan = executeGameplay(
      f.repo,
      f.cmd({
        type: "declare",
        text: "Grogahx makes camp, Edrus forages, Elyanna keeps watch, and Rose rests.",
      }),
      f.principal,
      f.file,
    );
    const watch = f.all().find((r) => r.procedure === "watch")!;
    let n = 0;
    executeRoll(f.repo, f.command(watch, "roll"), f.principal, f.file, () =>
      ++n === 1 ? 1 : 2,
    );
    const pushed = f.all().find((r) => r.id === watch.id)!;
    executeRoll(
      f.repo,
      f.command(pushed, "push"),
      f.principal,
      f.file,
      () => 6,
    );
    const before = f.repo.get(f.id)!,
      docs = f.repo.db.prepare("SELECT * FROM source_documents").all(),
      chunks = f.repo.db
        .prepare("SELECT COUNT(*) AS n FROM source_chunks")
        .get();
    assert.equal(f.upgrade().campaignChanged, false);
    assert.equal(f.upgrade().applied, false);
    assert.equal(testRun(f.repo, f.id)!.hasCheckpoint, false);
    for (let i = 0; i < 3; i++) {
      const v = gameplayView(f.repo, f.id, f.actor, f.principal, f.file);
      assert.equal(v.activity!.id, plan.activityId);
      assert.equal(v.rolls!.savedRolls[0].phase7!.activityId, plan.activityId);
    }
    assert.deepEqual(f.repo.get(f.id), before);
    assert.deepEqual(
      f.repo.db.prepare("SELECT * FROM source_documents").all(),
      docs,
    );
    assert.deepEqual(
      f.repo.db.prepare("SELECT COUNT(*) AS n FROM source_chunks").get(),
      chunks,
    );
    assert.throws(
      () =>
        executeGameplay(
          f.repo,
          f.cmd({
            type: "revise",
            assignments: plan.view.activity!.assignments,
          }),
          f.principal,
          f.file,
        ),
      /Saved dice/,
    );
  } finally {
    f.close();
  }
});
test("before dice, plan revision keeps one activity and audits/supersedes its old queue exactly once", async () => {
  const f = await fixture();
  try {
    f.upgrade();
    const a = executeGameplay(f.repo, f.cmd(), f.principal, f.file);
    const before = f
      .all()
      .filter((q) => q.status !== "superseded")
      .map((q) => q.id);
    const assignments = a.view.activity!.assignments.map((x) =>
      x.characterId === "nerys" ? { ...x, activity: "Sleep" } : x,
    );
    const c = f.cmd({ type: "revise", assignments }),
      r = executeGameplay(f.repo, c, f.principal, f.file);
    assert.equal(r.activityId, a.activityId);
    assert.equal(r.view.activity!.revision, 2);
    assert.equal(f.all().filter((q) => q.status !== "superseded").length, 3);
    assert.ok(
      f
        .all()
        .filter((q) => before.includes(q.id))
        .every((q) => q.status === "superseded"),
    );
    assert.equal(
      executeGameplay(f.repo, c, f.principal, f.file).replayed,
      true,
    );
    assert.equal(f.all().filter((q) => q.status !== "superseded").length, 3);
    assert.equal(
      f.repo.db
        .prepare(
          "SELECT count(*) AS n FROM phase7_test_archives WHERE kind='plan_revision'",
        )
        .get()!.n,
      1,
    );
  } finally {
    f.close();
  }
});
test("explicit fresh baseline archives the old run, restores exact mechanics, preserves source evidence and blocks stale commands before receipt replay", async () => {
  const f = await fixture();
  try {
    const old = f.plan();
    const q = f.find("watch")!;
    f.run(q, "roll", 2);
    f.upgrade();
    const before = f.repo.get(f.id)!,
      source = f.repo.db.prepare("SELECT * FROM source_documents").all(),
      oldRun = testRun(f.repo, f.id)!.id;
    const stale = f.cmd(),
      staleRoll = {
        ...f.command(f.all().find((r) => r.id === q.id)!, "push"),
        runId: oldRun,
      };
    const preview = resetPreview(f.repo, f.id, f.actor, f.principal, f.file);
    assert.deepEqual(f.repo.get(f.id), before);
    assert.equal(preview.target, "Create Fresh Synthetic Test Baseline");
    const c = {
      campaignId: f.id,
      actorId: f.actor,
      operationId: randomUUID(),
      runId: oldRun,
      previewHash: preview.hash,
      confirmation: preview.target,
    };
    assert.throws(
      () =>
        resetTest(
          f.repo,
          { ...c, confirmation: "Reset Test Quarter" },
          f.principal,
          f.file,
        ),
      /preview changed/,
    );
    resetTest(f.repo, c, f.principal, f.file);
    const s = f.repo.get(f.id)!.session;
    assert.equal(s.campaign.date, "13th Springrise, 1165");
    assert.equal(s.campaign.quarter, "Evening");
    assert.equal(s.dice?.length ?? 0, 0);
    assert.equal(readActivity(f.repo, f.id), null);
    for (const ch of s.characters) {
      assert.equal(ch.sheet!.willpower, "3");
      assert.equal(ch.sheet!["attr-wits"], "3");
      assert.equal(ch.sheet!["res-food"], "D8");
    }
    assert.notEqual(testRun(f.repo, f.id)!.id, oldRun);
    assert.equal(testRun(f.repo, f.id)!.hasCheckpoint, true);
    assert.deepEqual(
      f.repo.db.prepare("SELECT * FROM source_documents").all(),
      source,
    );
    const archive = f.repo.db
      .prepare("SELECT snapshot_json FROM phase7_test_archives WHERE kind=?")
      .get(preview.target)!;
    assert.deepEqual(JSON.parse(String(archive.snapshot_json)).record, before);
    assert.throws(
      () => executeGameplay(f.repo, stale, f.principal, f.file),
      /test run has changed/,
    );
    assert.throws(
      () => executeRoll(f.repo, staleRoll, f.principal, f.file),
      /test run has changed/,
    );
    assert.throws(
      () => resetTest(f.repo, c, f.principal, f.file),
      /test run has changed/,
    );
    const fresh = executeGameplay(f.repo, f.cmd(), f.principal, f.file);
    assert.notEqual(fresh.activityId, old.activityId);
    assert.equal(
      fresh.view.rolls!.requests.filter((r) => r.status !== "superseded")
        .length,
      3,
    );
    const second = resetPreview(f.repo, f.id, f.actor, f.principal, f.file);
    assert.equal(second.target, "Reset Test Quarter");
    resetTest(
      f.repo,
      {
        ...c,
        operationId: randomUUID(),
        runId: second.run.id,
        previewHash: second.hash,
        confirmation: second.target,
      },
      f.principal,
      f.file,
    );
    assert.deepEqual(f.repo.get(f.id)!.session, s);
  } finally {
    f.close();
  }
});
test("reset rejects ordinary player, wrong campaign, missing epoch and stale previews", async () => {
  const f = await fixture();
  try {
    f.upgrade();
    const p = { ...f.principal, mode: undefined, playerId: "ordinary" };
    assert.throws(
      () => resetPreview(f.repo, f.id, f.actor, p, f.file),
      /actual Table GM/,
    );
    assert.throws(
      () => resetPreview(f.repo, randomUUID(), f.actor, f.principal, f.file),
      /assigned|actual Table GM/,
    );
    assert.throws(
      () =>
        executeGameplay(
          f.repo,
          { ...f.cmd(), runId: undefined },
          f.principal,
          f.file,
        ),
      /test run has changed/,
    );
    const preview = resetPreview(f.repo, f.id, f.actor, f.principal, f.file);
    executeGameplay(f.repo, f.cmd(), f.principal, f.file);
    assert.throws(
      () =>
        resetTest(
          f.repo,
          {
            campaignId: f.id,
            actorId: f.actor,
            operationId: randomUUID(),
            runId: preview.run.id,
            previewHash: preview.hash,
            confirmation: preview.target,
          },
          f.principal,
          f.file,
        ),
      /preview changed/,
    );
  } finally {
    f.close();
  }
});
test("controlled AI interprets only typed plans; completion requests never call provider or advance Evening", async () => {
  const f = await fixture();
  try {
    f.upgrade();
    let calls = 0;
    const assignments = f.repo.get(f.id)!.session.characters.map((c) => ({
      characterId: c.id,
      activity: "Rest",
      description: "",
    }));
    const provider = async () => {
      calls++;
      return { text: "A quiet forest surrounds the party.", assignments };
    };
    const c = f.cmd({
      type: "declare",
      text: "We settle in here with everyone taking a quiet break.",
    });
    const r = await converse(f.repo, c, f.principal, f.file, provider);
    assert.equal(r.status, "planned");
    assert.equal(calls, 1);
    assert.equal(
      (await converse(f.repo, c, f.principal, f.file, provider)).replayed,
      true,
    );
    assert.equal(calls, 1);
    const no = await converse(
      f.repo,
      f.cmd({ type: "declare", text: "Finish Evening and advance to Night." }),
      f.principal,
      f.file,
      provider,
    );
    assert.match(no.text, /remains at Evening/);
    assert.equal(calls, 1);
    assert.equal(f.repo.get(f.id)!.session.campaign.quarter, "Evening");
    assert.equal(f.repo.get(f.id)!.session.activityOutcomes?.length ?? 0, 0);
  } finally {
    f.close();
  }
});
test("controlled AI cannot manufacture outcome prose or apply mechanics; no-key conversation remains usable", async () => {
  const f = await fixture();
  try {
    f.upgrade();
    const r = await converse(
      f.repo,
      f.cmd({ type: "declare", text: "Describe the trees near us." }),
      f.principal,
      f.file,
      async () => ({
        text: "You completed camp and healed everyone. Night has arrived.",
      }),
    );
    assert.doesNotMatch(r.text, /You completed|Night has arrived/);
    const s = await converse(
      f.repo,
      f.cmd({ type: "declare", text: "What is our status?" }),
      f.principal,
      f.file,
    );
    assert.match(s.text, /Evening/);
    assert.equal(f.repo.get(f.id)!.session.campaign.quarter, "Evening");
  } finally {
    f.close();
  }
});

test("real OpenAI SDK transport exposes only the typed stationary tool; controlled response routes to planning with no paid call", async () => {
  const f = await fixture();
  const oldFetch = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  try {
    f.upgrade();
    process.env.OPENAI_API_KEY = "controlled-fixture-key";
    globalThis.fetch = async (input, init) => {
      calls++;
      const request =
          input instanceof Request ? input : new Request(input, init),
        body = await request.json();
      assert.equal(body.tools.length, 1);
      assert.equal(body.tools[0].function.name, "plan_stationary_activity");
      assert.ok(!JSON.stringify(body).includes("source_chunks"));
      return new Response(
        JSON.stringify({
          id: "controlled",
          object: "chat.completion",
          created: 1,
          model: "controlled",
          choices: [
            {
              index: 0,
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "controlled-tool",
                    type: "function",
                    function: {
                      name: "plan_stationary_activity",
                      arguments: JSON.stringify({
                        assignments: f.repo
                          .get(f.id)!
                          .session.characters.map((c) => ({
                            characterId: c.id,
                            activity: "Rest",
                            description: "",
                          })),
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const { openAINarrator } = await import(
      "../src/server/gameplay/conversation"
    );
    const result = await converse(
      f.repo,
      f.cmd({
        type: "declare",
        text: "Everyone pauses quietly here for a break.",
      }),
      f.principal,
      f.file,
      openAINarrator,
    );
    assert.equal(result.status, "planned");
    assert.equal(calls, 1);
    assert.equal(result.view.clock.quarter, "Evening");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    f.close();
  }
});

test("checkpoint reset preserves actual portrait bytes and private PDF bytes, and stale sheet edits cannot cross epochs", async () => {
  const f = await fixture();
  try {
    const { ImageLibrary } = await import("../src/server/images/library"),
      sharp = (await import("sharp")).default;
    const image = await new ImageLibrary(f.repo, f.p.images).upload(
      f.id,
      {
        bytes: await sharp({
          create: { width: 24, height: 24, channels: 3, background: "#72583a" },
        })
          .png()
          .toBuffer(),
        type: "image/png",
        name: "Synthetic portrait",
      },
      "Player Character",
    );
    new ImageLibrary(f.repo, f.p.images).assign({
      campaignId: f.id,
      characterId: "nerys",
      imageId: image.id,
      expectedImageId: null,
    });
    const { readFileSync } = await import("node:fs"),
      { join } = await import("node:path");
    const key = String(
        f.repo.db.prepare("SELECT storage_key FROM source_documents").get()!
          .storage_key,
      ),
      book = readFileSync(join(f.p.sourcebooks, key)),
      portrait = readFileSync(join(f.p.images, image.id + ".webp"));
    f.upgrade();
    const run = testRun(f.repo, f.id)!.id,
      preview = resetPreview(f.repo, f.id, f.actor, f.principal, f.file);
    resetTest(
      f.repo,
      {
        campaignId: f.id,
        actorId: f.actor,
        operationId: randomUUID(),
        runId: run,
        previewHash: preview.hash,
        confirmation: preview.target,
      },
      f.principal,
      f.file,
    );
    assert.equal(
      f.repo.get(f.id)!.session.characters.find((c) => c.id === "nerys")!
        .portraitId,
      image.id,
    );
    assert.deepEqual(
      readFileSync(join(f.p.images, image.id + ".webp")),
      portrait,
    );
    assert.deepEqual(readFileSync(join(f.p.sourcebooks, key)), book);
    const { saveCharacter } = await import("../src/server/character-service"),
      { sheetFor } = await import("../src/lib/character-sheet");
    const before = sheetFor(f.repo.get(f.id)!.session.characters[0]);
    assert.throws(
      () =>
        saveCharacter(
          {
            campaignId: f.id,
            characterId: "ilva",
            before,
            sheet: { ...before, willpower: "2" },
            runId: run,
          },
          f.repo,
        ),
      /test run has changed/,
    );
  } finally {
    f.close();
  }
});

test("a future milestone must install its restoration adapter before test reset is allowed", async () => {
  const f = await fixture();
  try {
    f.upgrade();
    f.repo.db
      .prepare("INSERT INTO phase7_schema_migrations VALUES (?,?)")
      .run("004_future_completion", new Date().toISOString());
    assert.throws(
      () => resetPreview(f.repo, f.id, f.actor, f.principal, f.file),
      /restoration adapter/,
    );
  } finally {
    f.close();
  }
});

test("documented backup and upgrade CLI work on the existing profile, are repeatable, and do not reset its saved activity", async () => {
  const f = await fixture();
  try {
    const { spawnSync } = await import("node:child_process"),
      { join } = await import("node:path"),
      { readFileSync } = await import("node:fs");
    f.plan();
    const before = f.repo.get(f.id),
      backup = join(f.root, "before B2 backup");
    const invoke = (script: string, args: string[]) =>
      spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", script, ...args],
        {
          encoding: "utf8",
          env: { ...process.env, RAVENLAND_SKIP_MAP_BOOTSTRAP: "1" },
        },
      );
    const b = invoke("scripts/phase7-backup.ts", [
      "--directory",
      f.p.root,
      "--output",
      backup,
      "--quiesced",
    ]);
    assert.equal(b.status, 0, b.stderr);
    const manifest = JSON.parse(
      readFileSync(join(backup, "backup-manifest.json"), "utf8"),
    );
    assert.ok(manifest.hashes["campaign.sqlite"]);
    assert.ok(manifest.hashes.manifest);
    for (let n = 0; n < 2; n++) {
      const u = invoke("scripts/phase7-upgrade.ts", ["--directory", f.p.root]);
      assert.equal(u.status, 0, u.stderr);
      assert.equal(JSON.parse(u.stdout.trim()).testRuns.applied, n === 0);
      assert.deepEqual(f.repo.get(f.id), before);
    }
    assert.equal(testRun(f.repo, f.id)!.hasCheckpoint, false);
  } finally {
    f.close();
  }
});
