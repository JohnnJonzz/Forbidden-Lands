import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rollFixture } from "./phase7-roll-fixture";
import { executeRoll, rollQueueView } from "../src/server/gameplay/roll-engine";
import { upgradeRollQueue, hasRollQueue } from "../src/server/gameplay/upgrade";
import { parseExpression } from "../src/lib/gameplay-rolls";
import { executeDice } from "../src/server/dice/service";
import { derivePool, sprainEvidence } from "../src/server/gameplay/roll-rules";
import { saveCharacter } from "../src/server/character-service";
const fresh = (f: Awaited<ReturnType<typeof rollFixture>>, p: string) =>
  f.find(p);
test("original PDF initial queue: three source-backed skill requests, Rest has none, no legacy form or AI", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    assert.equal(f.all().length, 3);
    assert.ok(f.all().every((r) => r.status === "awaiting_roll"));
    assert.deepEqual(
      f
        .all()
        .map((r) => r.procedure)
        .sort(),
      ["camp", "forage", "watch"],
    );
    const forage = f.find("forage");
    assert.deepEqual(
      forage.modifiers.map((m) => m.value),
      [-1, -1],
    );
    assert.equal(
      forage.expression?.kind === "pool" && forage.expression.skillDice,
      -1,
    );
    assert.ok(forage.sources.every((s) => s.page > 0));
    assert.equal(f.repo.get(f.id)!.session.chatJourney, undefined);
    assert.equal(rollQueueView(f.repo, f.id)!.packet.aiRequests, 0);
    assert.equal(f.repo.get(f.id)!.session.campaign.quarter, "Evening");
    assert.equal(upgradeRollQueue(f.repo, f.file).applied, false);
  } finally {
    f.close();
  }
});
test("original PDF Foraging 3 queues duration D6, binds original dice and determines unapplied injury with zero AI", async () => {
  const f = await rollFixture();
  try {
    const before = f.repo.get(f.id)!.session;
    f.plan();
    f.run(f.find("camp"), "roll");
    f.run(f.find("watch"), "roll");
    f.run(f.find("forage"), "roll", 2);
    assert.equal(f.find("forage").status, "awaiting_push_decision");
    assert.equal(f.all().length, 3);
    f.run(f.find("forage"), "keep");
    const mishap = f.find("forage-mishap");
    assert.equal(mishap.dependencyId, f.find("forage").id);
    f.run(mishap, "recheck");
    assert.equal(f.find("forage-mishap").expression?.kind, "dice");
    f.run(f.find("forage-mishap"), "roll", 3);
    f.run(f.find("forage-duration"), "roll", 5);
    const q = rollQueueView(f.repo, f.id)!;
    assert.equal(q.packet.fullyResolved, true);
    assert.equal(q.packet.durablyApplied, false);
    assert.match(
      q.packet.pendingUnappliedConsequences.find(
        (c) => c.kind === "critical-injury",
      )!.description,
      /Sprained Ankle/,
    );
    assert.equal(
      q.packet.pendingUnappliedConsequences.find(
        (c) => c.kind === "critical-injury",
      )!.durationDays,
      5,
    );
    assert.equal(
      q.packet.pendingUnappliedConsequences.find(
        (c) => c.kind === "critical-injury",
      )!.durablyApplied,
      false,
    );
    assert.equal(q.packet.aiRequests, 0);
    assert.equal(q.savedRolls.length, 5);
    assert.deepEqual(f.repo.get(f.id)!.session.characters, before.characters);
    assert.deepEqual(f.repo.get(f.id)!.session.campaign, before.campaign);
    assert.ok(sprainEvidence(f.repo, f.id).length === 3);
  } finally {
    f.close();
  }
});
test("successful requests resolve once without follow-ups; original and final success stay separate", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    for (const p of ["camp", "forage", "watch"]) f.run(f.find(p), "roll");
    const q = rollQueueView(f.repo, f.id)!;
    assert.equal(q.requests.length, 3);
    assert.equal(q.packet.fullyResolved, true);
    assert.equal(
      q.packet.pendingUnappliedConsequences.some(
        (c) => c.kind === "foraging-yield-choice",
      ),
      true,
    );
    assert.throws(() => f.run(f.find("camp"), "roll"), /decision|review/);
  } finally {
    f.close();
  }
});
test("Push preserves original dice and applies damage/WP exactly once across retry; illegal second Push rejects", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    const r = f.find("forage"),
      c = f.command(r, "push"),
      result = executeRoll(f.repo, c, f.principal, f.file, () => 1);
    const before = f.repo.get(f.id)!,
      card = before.session.dice!.find((d) => d.id === r.savedRollId)!;
    assert.deepEqual(card.original.attribute, [2, 2, 2]);
    assert.deepEqual(card.result.attribute, [1, 1, 1]);
    assert.equal(card.result.pushed, true);
    assert.equal(card.result.attributeDamage, 3);
    assert.equal(card.result.willpower, 3);
    assert.equal(before.session.characters[0].sheet?.willpower, "6");
    assert.equal(
      executeRoll(f.repo, c, f.principal, f.file, () => 6).replayed,
      true,
    );
    assert.deepEqual(f.repo.get(f.id), before);
    assert.throws(() => f.run(f.find("forage"), "push"), /legal/);
    assert.equal(result.queue!.packet.committedPushChanges.length, 1);
  } finally {
    f.close();
  }
});
test("Path of the Forest authorizes exactly 1 WP, preserves raw failure and suppresses mishap; Pathfinder is distinct", async () => {
  const f = await rollFixture();
  try {
    const r = f.repo.get(f.id)!,
      ch = r.session.characters[0];
    ch.profession = "Druid";
    ch.sheet!.profession = "Druid";
    ch.sheet!.talents = [{ name: "Path of the Forest", rank: "1", type: "P" }];
    f.repo.update(r.id, r.revision, r.session);
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    const command = f.command(f.find("forage"), "talent");
    executeRoll(f.repo, command, f.principal, f.file);
    assert.equal(f.find("forage").raw!.successes, 0);
    assert.equal(f.find("forage").final!.outcome, "success");
    assert.equal(f.repo.get(f.id)!.session.characters[0].sheet?.willpower, "2");
    assert.equal(
      f.all().some((r) => r.procedure === "forage-mishap"),
      false,
    );
    executeRoll(f.repo, command, f.principal, f.file);
    assert.equal(f.repo.get(f.id)!.session.characters[0].sheet?.willpower, "2");
    assert.throws(() => f.run(f.find("forage"), "talent"), /timing/);
  } finally {
    f.close();
  }
});
test("wrong owner, stale revision, wrong expression, reused operation and legacy handlers reject without dice", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    const r = f.find("camp"),
      c = f.command(r, "roll");
    for (const change of [
      { actorId: "ilva" },
      { revision: 999 },
      { expression: { kind: "dice", expression: "D6" } },
    ])
      assert.throws(() =>
        executeRoll(f.repo, { ...c, ...change }, f.principal, f.file, () => 6),
      );
    assert.throws(
      () => executeRoll(f.repo, c, { playerId: "other", grants: [] }, f.file),
      /authorized/,
    );
    const first = executeRoll(f.repo, c, f.principal, f.file, () => 6);
    assert.equal(
      executeRoll(f.repo, c, f.principal, f.file, () => 1).rollId,
      first.rollId,
    );
    assert.throws(
      () =>
        executeRoll(f.repo, { ...c, operation: "keep" }, f.principal, f.file),
      /reused/,
    );
    assert.throws(
      () =>
        executeDice(
          {
            type: "push",
            campaignId: f.id,
            actionId: randomUUID(),
            rollId: first.rollId,
          },
          f.repo,
          f.principal,
        ),
      /Phase 7/,
    );
  } finally {
    f.close();
  }
});
test("unlinked D6 requires explicit validated link and cannot be reused in another request", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    f.run(f.find("forage"), "keep");
    const unlinked = f.run(null, "roll", 3, {
      expression: { kind: "dice", expression: "D6" },
    });
    assert.equal(f.find("forage-mishap").savedRollId, null);
    f.run(f.find("forage-mishap"), "link", 6, {
      rollId: unlinked.rollId,
      rollRevision: 1,
    });
    assert.throws(
      () =>
        f.run(f.find("forage-duration"), "link", 6, {
          rollId: unlinked.rollId,
          rollRevision: 1,
        }),
      /procedure|fresh|used|timing|revision/,
    );
    assert.equal(f.find("forage-duration").savedRollId, null);
  } finally {
    f.close();
  }
});
test("Table GM correction preview supersedes dependent procedures and preserves rolls and Push consequences", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    f.run(f.find("forage"), "push", 1);
    f.run(f.find("forage-mishap"), "roll", 3);
    f.run(f.find("forage-duration"), "roll", 4);
    const before = f.repo.get(f.id)!,
      r = f.find("forage"),
      preview = rollQueueView(f.repo, f.id)!.requests.find(
        (x) => x.id === r.id,
      )!.correction;
    assert.equal(preview.affectedIds.length, 3);
    f.run(r, "correct", 6, {
      previewHash: preview.hash,
      reason:
        "Reviewed mistaken source pool binding; preserve prior Push costs.",
    });
    assert.equal(f.find("forage").generation, 1);
    assert.equal(f.all().filter((r) => r.status === "superseded").length, 3);
    assert.deepEqual(f.repo.get(f.id), before);
    assert.equal(
      rollQueueView(f.repo, f.id)!.packet.pendingUnappliedConsequences.some(
        (c) => c.kind === "critical-injury",
      ),
      false,
    );
  } finally {
    f.close();
  }
});
test("custom dice grammar is bounded and D66 uses two D6 digits", async () => {
  assert.equal(parseExpression("2d6 + 1d8 - 2").expression, "2D6+D8-2");
  for (const x of ["1d1001", "101d6", "Math.random()", "D0", "1d6;drop table"])
    assert.throws(() => parseExpression(x));
  const f = await rollFixture();
  try {
    f.plan();
    const c = f.command(null, "roll", {
      expression: { kind: "dice", expression: "D66" },
    });
    let i = 0;
    const result = executeRoll(
      f.repo,
      c,
      f.principal,
      f.file,
      () => [2, 5][i++],
    );
    const card = result.queue!.savedRolls.find((d) => d.id === result.rollId)!;
    assert.equal(
      card.metadata.utility?.kind === "Custom" && card.metadata.utility.total,
      25,
    );
    assert.equal(i, 2);
  } finally {
    f.close();
  }
});
test("insufficient WP, missing talent, and illegal timing cannot override a saved failure", async () => {
  const f = await rollFixture();
  try {
    const r = f.repo.get(f.id)!,
      ch = r.session.characters[0];
    ch.profession = "Druid";
    ch.sheet!.profession = "Druid";
    ch.sheet!.talents = [{ name: "Path of the Forest", rank: "1", type: "P" }];
    ch.sheet!.willpower = "0";
    f.repo.update(r.id, r.revision, r.session);
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    assert.throws(() => f.run(f.find("forage"), "talent"), /Insufficient/);
    const current = f.repo.get(f.id)!;
    current.session.characters[0].sheet!.talents = [
      { name: "Pathfinder", rank: "3", type: "G" },
    ];
    current.session.characters[0].sheet!.willpower = "3";
    f.repo.update(current.id, current.revision, current.session);
    assert.throws(() => f.run(f.find("forage"), "talent"), /Pathfinder/);
    f.run(f.find("forage"), "keep");
    f.run(f.find("forage"), "decline");
    assert.throws(() => f.run(f.find("forage"), "talent"), /timing/);
    assert.equal(f.repo.get(f.id)!.session.characters[0].sheet!.willpower, "3");
  } finally {
    f.close();
  }
});
test("stale source and current sheet changes block rolling; an explicit recheck refreshes the request", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    const r = f.repo.get(f.id)!;
    r.session.characters[1].sheet!["attr-wits"] = "4";
    f.repo.update(r.id, r.revision, r.session);
    assert.throws(() => f.run(f.find("camp"), "roll"), /changed/);
    f.run(f.find("camp"), "recheck");
    assert.equal((f.find("camp").expression as { base: number }).base, 4);
    f.run(f.find("camp"), "roll");
    const house = f.repo.get(f.id)!;
    house.session.campaign.settings!.houseRules =
      "Foraging uses a campaign-specific modifier.";
    f.repo.update(house.id, house.revision, house.session);
    assert.throws(() => f.run(f.find("forage"), "roll"), /house rules/);
    const clear = f.repo.get(f.id)!;
    clear.session.campaign.settings!.houseRules = "";
    f.repo.update(clear.id, clear.revision, clear.session);
    f.repo.db.prepare("UPDATE source_documents SET status='Failed'").run();
    assert.throws(
      () => f.run(f.find("forage"), "roll"),
      /source|indexed|Handbook/i,
    );
    assert.equal(f.find("forage").savedRollId, null);
  } finally {
    f.close();
  }
});
test("receipt failure rolls back dice, Push costs, request decisions and conditional requests together", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    f.run(f.find("forage"), "roll", 2);
    const before = f.repo.get(f.id),
      requests = f.all();
    f.repo.db.exec(
      "CREATE TRIGGER fail_roll_receipt BEFORE INSERT ON phase7_roll_commands BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
    );
    assert.throws(() => f.run(f.find("forage"), "push", 1), /injected/);
    assert.deepEqual(f.repo.get(f.id), before);
    assert.deepEqual(f.all(), requests);
  } finally {
    f.close();
  }
});
test("critical row verification does not borrow D6 from a later injury row", async () => {
  const f = await rollFixture();
  try {
    let changed = 0;
    for (const chunk of f.repo.db
      .prepare("SELECT id,text FROM source_chunks")
      .all()) {
      const old = String(chunk.text),
        text = old.replace(
          /(25\s*[–−-]\s*26\s+Broken toes[\s\S]*?)\bD6\b/,
          "$1D8",
        );
      if (old !== text) {
        f.repo.db
          .prepare("UPDATE source_chunks SET text=? WHERE id=?")
          .run(text, String(chunk.id));
        changed++;
      }
    }
    assert.ok(changed > 0);
    assert.throws(() => sprainEvidence(f.repo, f.id), /25–26/);
  } finally {
    f.close();
  }
});
test("an upgrade preserves an existing 7.0A activity, campaign bytes and storage references", async () => {
  const { createSyntheticProfile } = await import("../scripts/phase7-setup"),
    { SqliteCampaignRepository } = await import("../src/server/sqlite"),
    { profileFile } = await import("../src/server/gameplay/profile"),
    { executeGameplay } = await import("../src/server/gameplay/service"),
    { ensureRollQueue } = await import("../src/server/gameplay/roll-store"),
    { mkdtempSync, rmSync, readFileSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "raven-upgrade-")),
    p = createSyntheticProfile(join(root, "old-profile")),
    repo = new SqliteCampaignRepository(p.database),
    file = profileFile(p.root);
  try {
    const principal = {
      playerId: "trusted-local",
      mode: "trusted-local" as const,
      grants: [{ campaignId: p.campaignId, characterIds: ["ilva"] }],
    };
    executeGameplay(
      repo,
      {
        campaignId: p.campaignId,
        actorId: "ilva",
        operationId: randomUUID(),
        campaignRevision: 1,
        activityRevision: null,
        type: "declare",
        text: "Edrus makes camp, Grogahx forages, Rose keeps watch, Elyanna rests.",
      },
      principal,
      file,
    );
    const before = repo.get(p.campaignId),
      activity = repo.db.prepare("SELECT * FROM phase7_activities").all(),
      manifest = readFileSync(file);
    assert.equal(hasRollQueue(repo), false);
    assert.equal(upgradeRollQueue(repo, file).applied, true);
    ensureRollQueue(repo, p.campaignId);
    assert.deepEqual(repo.get(p.campaignId), before);
    assert.deepEqual(
      repo.db.prepare("SELECT * FROM phase7_activities").all(),
      activity,
    );
    assert.deepEqual(readFileSync(file), manifest);
    assert.equal(
      rollQueueView(repo, p.campaignId)!.requests.every(
        (r) => r.status === "awaiting_mechanical_review",
      ),
      true,
    );
    assert.equal(upgradeRollQueue(repo, file).applied, false);
  } finally {
    repo.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("two independent processes cannot resolve one request twice with stale revisions", async () => {
  const { execFile } = await import("node:child_process"),
    { promisify } = await import("node:util"),
    run = promisify(execFile);
  const f = await rollFixture();
  try {
    f.plan();
    const a = f.command(f.find("camp"), "roll"),
      b = { ...a, operationId: randomUUID() },
      script = `const {readProfile}=require('./src/server/gameplay/profile.ts'),{SqliteCampaignRepository}=require('./src/server/sqlite.ts'),{executeRoll}=require('./src/server/gameplay/roll-engine.ts');const c=JSON.parse(process.argv[1]),file=process.argv[2],p=readProfile(file),repo=new SqliteCampaignRepository(p.database);try{const result=executeRoll(repo,c,{playerId:'trusted-local',mode:'trusted-local',grants:[{campaignId:c.campaignId,characterIds:[c.actorId]}]},file,()=>6);console.log(JSON.stringify({ok:true,rollId:result.rollId}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}finally{repo.close();}`;
    const results = await Promise.all(
        [a, b].map((c) =>
          run(process.execPath, [
            "--import",
            "tsx",
            "-e",
            script,
            JSON.stringify(c),
            f.file,
          ]),
        ),
      ),
      outputs = results.map((r) => JSON.parse(r.stdout));
    assert.equal(outputs.filter((r) => r.ok).length, 1);
    assert.match(outputs.find((r) => !r.ok).error, /revision changed/);
    assert.equal(f.repo.get(f.id)!.session.dice!.length, 1);
  } finally {
    f.close();
  }
});
test("standard and custom miscellaneous dice persist independently and cannot auto-satisfy pending requests", async () => {
  const f = await rollFixture();
  try {
    f.plan();
    for (const sides of [6, 8, 10, 12, 20]) {
      const c = f.command(null, "roll", {
          expression: { kind: "dice", expression: "D" + sides },
        }),
        result = executeRoll(f.repo, c, f.principal, f.file, (n) => n),
        card = result.queue!.savedRolls.find((d) => d.id === result.rollId)!;
      assert.equal(
        card.metadata.utility?.kind === "Custom" && card.metadata.utility.total,
        sides,
      );
    }
    const result = f.run(null, "roll", 6, {
        expression: { kind: "dice", expression: "2D6+D8-2" },
      }),
      card = result.queue!.savedRolls.find((d) => d.id === result.rollId)!;
    assert.equal(
      card.metadata.utility?.kind === "Custom" && card.metadata.utility.total,
      16,
    );
    assert.ok(f.all().every((r) => r.savedRollId === null));
  } finally {
    f.close();
  }
});
test("Quartermaster optional Artifact Die requires its verified rank and timing; unimplemented camp-dependent Watch bonus blocks for review", async () => {
  const f = await rollFixture();
  try {
    const record = f.repo.get(f.id)!;
    record.session.characters[1].sheet!.talents = [
      { name: "Quartermaster", rank: "3", type: "G" },
    ];
    f.repo.update(record.id, record.revision, record.session);
    f.plan();
    assert.equal(f.find("watch").status, "awaiting_mechanical_review");
    assert.match(f.find("watch").review!, /established camp/);
    f.run(f.find("camp"), "artifact");
    assert.throws(() => f.run(f.find("camp"), "artifact"), /eligible/);
    const lost = f.repo.get(f.id)!;
    lost.session.characters[1].sheet!.talents![0].rank = "1";
    f.repo.update(lost.id, lost.revision, lost.session);
    assert.throws(() => f.run(f.find("camp"), "roll"), /Artifact Die/);
    const restored = f.repo.get(f.id)!;
    restored.session.characters[1].sheet!.talents![0].rank = "3";
    f.repo.update(restored.id, restored.revision, restored.session);
    f.run(f.find("camp"), "roll");
    assert.equal(
      f.repo.get(f.id)!.session.dice![0].original.artifacts[0].sides,
      8,
    );
    assert.throws(() => f.run(f.find("camp"), "artifact"), /eligible/);
  } finally {
    f.close();
  }
});
