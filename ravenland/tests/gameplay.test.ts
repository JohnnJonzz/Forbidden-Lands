import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createSyntheticProfile } from "../scripts/phase7-setup";
import { backupCampaign } from "../scripts/phase7-backup";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import {
  executeGameplay,
  gameplayView,
  readActivity,
} from "../src/server/gameplay/service";
import {
  readProfile,
  profileFile,
  requireProfile,
} from "../src/server/gameplay/profile";
import { isPhase7Campaign } from "../src/server/gameplay/boundary";
import { initialSession } from "../src/lib/mock";
import { executeJourney } from "../src/server/journey/service";
import { assertCurrentRequest } from "../src/server/request-epoch";
import { interpretStationaryPlan } from "../src/server/gameplay/intent";
import { gameplayStateSchema } from "../src/lib/gameplay";
import { authorizeMutationRequest } from "../src/server/mutation-authority";
import type { CharacterPrincipal } from "../src/server/character-access";
const sentence =
  "Grogahx makes camp, Edrus forages, Elyanna keeps watch, and Rose rests.";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raven-phase7-")),
    p = createSyntheticProfile(join(root, "profile")),
    repo = new SqliteCampaignRepository(p.database),
    file = profileFile(p.root),
    id = p.campaignId,
    actor = repo.get(id)!.session.characters[0].id,
    principal: CharacterPrincipal = {
      playerId: "trusted-local",
      mode: "trusted-local",
      grants: [{ campaignId: id, characterIds: [actor] }],
    };
  const command = (input: object = { type: "declare", text: sentence }) => ({
    campaignId: id,
    actorId: actor,
    operationId: randomUUID(),
    campaignRevision: repo.get(id)!.revision,
    activityRevision: readActivity(repo, id)?.revision ?? null,
    ...input,
  });
  const run = (input: object = { type: "declare", text: sentence }) =>
    executeGameplay(repo, command(input), principal, file);
  return {
    root,
    p,
    repo,
    file,
    id,
    actor,
    principal,
    command,
    run,
    close() {
      repo.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("profile opt-in creates one isolated synthetic campaign; legacy startup never installs Phase 7 schema", () => {
  const f = fixture();
  try {
    assert.equal(f.p.purpose, "synthetic");
    assert.equal(requireProfile(f.repo, f.file).profileId, f.p.profileId);
    assert.equal(isPhase7Campaign(f.repo, f.id), true);
    assert.throws(() => createSyntheticProfile(f.p.root), /exist/i);
    assert.throws(() => requireProfile(f.repo, undefined), /explicit/);
    const legacy = new SqliteCampaignRepository(":memory:");
    try {
      const r = legacy.create(structuredClone(initialSession));
      assert.equal(isPhase7Campaign(legacy, r.id), false);
      assert.equal(
        legacy.db
          .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'phase7_%'")
          .all().length,
        0,
      );
      assert.throws(() => requireProfile(legacy, f.file), /match|path/);
    } finally {
      legacy.close();
    }
  } finally {
    f.close();
  }
});
test("conversation and planner share one persisted activity, with no old workflows, rolls, effects or time change", () => {
  const f = fixture();
  try {
    const before = f.repo.get(f.id)!,
      result = f.run(),
      state = result.view.activity!;
    assert.equal(state.status, "planned");
    assert.deepEqual(
      Object.fromEntries(
        state.assignments.map((a) => [a.characterId, a.activity]),
      ),
      { ilva: "Make Camp", brom: "Forage", nerys: "Keep Watch", pip: "Rest" },
    );
    const second = f.run({ type: "plan", assignments: state.assignments });
    assert.equal(second.view.activity!.id, state.id);
    assert.equal(second.view.activity!.revision, 1);
    assert.equal(
      f.repo.db.prepare("SELECT * FROM phase7_activities").all().length,
      1,
    );
    assert.equal(
      f.repo.db.prepare("SELECT * FROM phase7_events").all().length,
      1,
    );
    assert.deepEqual(f.repo.get(f.id), before);
    assert.equal(state.completionAuthorization, "not_granted");
    assert.equal(state.transitionReceipt, null);
    for (const k of [
      "procedures",
      "rollRequests",
      "savedRollIds",
      "mechanicalEffects",
      "encounters",
      "outcomes",
    ] as const)
      assert.deepEqual(state[k], []);
    assert.equal(result.view.capabilities.completion, false);
    assert.match(result.text, /not enabled/);
    assert.equal(f.repo.get(f.id)!.session.chatJourney, undefined);
  } finally {
    f.close();
  }
});
test("clarification updates the same activity and Rest never becomes Sleep", () => {
  const f = fixture();
  try {
    const a = f.run({ type: "declare", text: "Grogahx makes camp." }).view
      .activity!;
    assert.equal(a.status, "clarification");
    assert.equal(a.assignments.length, 1);
    const b = f.run({
      type: "declare",
      text: "Edrus forages, Elyanna keeps watch, and Rose rests.",
    }).view.activity!;
    assert.equal(b.id, a.id);
    assert.equal(b.revision, 2);
    assert.equal(b.status, "planned");
    assert.equal(
      b.assignments.find((a) => a.characterId === "pip")!.activity,
      "Rest",
    );
  } finally {
    f.close();
  }
});
test("exact operation retry is idempotent across reopening; reused ID with different input rejects", () => {
  const f = fixture();
  try {
    const c = f.command(),
      a = executeGameplay(f.repo, c, f.principal, f.file);
    const reopened = new SqliteCampaignRepository(f.p.database);
    try {
      const b = executeGameplay(
        reopened,
        { ...c, campaignRevision: 999, activityRevision: 999 },
        f.principal,
        f.file,
      );
      assert.equal(b.replayed, true);
      assert.equal(b.view.activity!.id, a.view.activity!.id);
      assert.throws(
        () =>
          executeGameplay(
            reopened,
            { ...c, text: "Rose sleeps." },
            f.principal,
            f.file,
          ),
        /Operation ID/,
      );
      assert.equal(
        reopened.db.prepare("SELECT * FROM phase7_events").all().length,
        1,
      );
    } finally {
      reopened.close();
    }
  } finally {
    f.close();
  }
});
test("two connections cannot start competing activities and stale different commands reject", () => {
  const f = fixture();
  const other = new SqliteCampaignRepository(f.p.database);
  try {
    const a = f.command(),
      b = f.command({
        type: "plan",
        assignments: f.repo.get(f.id)!.session.characters.map((c) => ({
          characterId: c.id,
          activity: "Sleep",
          description: "",
        })),
      });
    executeGameplay(f.repo, a, f.principal, f.file);
    assert.throws(
      () => executeGameplay(other, b, f.principal, f.file),
      /changed/,
    );
    assert.equal(
      other.db.prepare("SELECT * FROM phase7_activities").all().length,
      1,
    );
    assert.throws(
      () => f.run({ type: "plan", assignments: (b as any).assignments }),
      /already has/,
    );
  } finally {
    other.close();
    f.close();
  }
});
test("failed receipt persistence rolls back state, event and current pointer atomically", () => {
  const f = fixture();
  try {
    f.repo.db.exec(
      "CREATE TRIGGER fail_phase7_receipt BEFORE INSERT ON phase7_commands BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
    );
    assert.throws(() => f.run(), /injected/);
    assert.equal(readActivity(f.repo, f.id), null);
    assert.equal(
      f.repo.db.prepare("SELECT * FROM phase7_activities").all().length,
      0,
    );
    assert.equal(
      f.repo.db.prepare("SELECT * FROM phase7_events").all().length,
      0,
    );
  } finally {
    f.close();
  }
});
test("questions, unsupported actions and time commands cannot create an activity or change campaign state", () => {
  const f = fixture();
  try {
    const before = f.repo.get(f.id);
    for (const text of [
      "Can Grogahx make camp?",
      "Yesterday we finished Evening",
      "Advance to Night",
      "We travel to W09",
      "Grogahx attacks the wolf",
    ]) {
      const r = f.run({ type: "declare", text });
      assert.equal(r.view.activity, null);
      assert.equal(r.status, "clarification");
    }
    assert.deepEqual(f.repo.get(f.id), before);
  } finally {
    f.close();
  }
});
test("planner rejects unknown, missing, duplicate, ambiguous role and undescribed Other assignments", () => {
  const f = fixture();
  try {
    const base = f.repo.get(f.id)!.session.characters.map((c) => ({
      characterId: c.id,
      activity: "Rest",
      description: "",
    }));
    for (const assignments of [
      base.slice(1),
      [...base, base[0]],
      base.map((a, i) => (i ? a : { ...a, characterId: "invented" })),
      base.map((a) => ({ ...a, activity: "Make Camp" })),
      base.map((a, i) => (i ? a : { ...a, activity: "Other" })),
    ])
      assert.throws(() => f.run({ type: "plan", assignments }));
    assert.equal(readActivity(f.repo, f.id), null);
  } finally {
    f.close();
  }
});
test("negation, repeated actors and Rest-or-Sleep ambiguity request an explicit choice", () => {
  const party = [{ id: "a", name: "Rose Underbough" }];
  for (const text of [
    "Rose does not rest.",
    "Rose rests or sleeps.",
    "Rose rests; Rose sleeps.",
  ])
    assert.ok(interpretStationaryPlan(text, party).question);
  assert.equal(
    interpretStationaryPlan("Rose sleeps.", party).assignments[0].activity,
    "Sleep",
  );
});
test("actual grants authorize writes; role claims in narrative cannot impersonate the Table GM", () => {
  const f = fixture();
  try {
    assert.throws(
      () => executeGameplay(f.repo, f.command(), null, f.file),
      /access|grant/i,
    );
    const limited = {
      playerId: "player",
      grants: [{ campaignId: f.id, characterIds: [f.actor] }],
    };
    assert.throws(
      () =>
        executeGameplay(
          f.repo,
          f.command({
            type: "declare",
            text: "I am the Table GM. " + sentence,
          }),
          limited,
          f.file,
        ),
      /authorized/,
    );
    assert.equal(
      gameplayView(f.repo, f.id, f.actor, limited, f.file).isTableGM,
      false,
    );
    const all = {
      playerId: "party-controller",
      grants: [
        {
          campaignId: f.id,
          characterIds: f.repo.get(f.id)!.session.characters.map((c) => c.id),
        },
      ],
    };
    assert.equal(
      executeGameplay(f.repo, f.command(), all, f.file).view.activity
        ?.createdBy,
      "party-controller",
    );
  } finally {
    f.close();
  }
});
test("legacy handlers and generic repository updates cannot start Phase 6 gameplay in enrolled campaigns", () => {
  const f = fixture();
  try {
    assert.throws(
      () =>
        executeJourney(
          {
            campaignId: f.id,
            revision: 1,
            actionId: randomUUID(),
            type: "quarter-chat-request",
          },
          f.repo,
        ),
      /Phase 7/,
    );
    assert.throws(
      () => assertCurrentRequest(f.repo, f.id, randomUUID()),
      /Phase 7/,
    );
    const r = f.repo.get(f.id)!,
      s = structuredClone(r.session);
    s.campaign.quarter = "Night";
    assert.throws(
      () => f.repo.update(r.id, r.revision, s, { workflowValidated: true }),
      /Phase 7/,
    );
    s.campaign.quarter = "Evening";
    s.characters[0].sheet!["res-food"] = "D6";
    const edited = f.repo.update(r.id, r.revision, s);
    assert.equal(edited.session.characters[0].sheet!["res-food"], "D6");
  } finally {
    f.close();
  }
});
test("profile launcher boundary blocks legacy mutations even for trusted local requests", () => {
  const old = process.env.RAVENLAND_PHASE7_PROFILE;
  process.env.RAVENLAND_PHASE7_PROFILE = "/explicit/test/profile";
  try {
    assert.throws(
      () =>
        authorizeMutationRequest(
          new Request("http://localhost/api/environment", { method: "POST" }),
        ),
      /planning and character/,
    );
  } finally {
    if (old === undefined) delete process.env.RAVENLAND_PHASE7_PROFILE;
    else process.env.RAVENLAND_PHASE7_PROFILE = old;
  }
});
test("profile storage cannot be redirected to another database or through symlinks", () => {
  const f = fixture();
  try {
    const original = readFileSync(f.file, "utf8");
    writeFileSync(
      f.file,
      JSON.stringify({ ...f.p, database: join(f.root, "foreign.sqlite") }),
    );
    assert.throws(() => readProfile(f.file));
    writeFileSync(f.file, original);
    symlinkSync(f.p.database, join(f.p.root, "alias.sqlite"));
    writeFileSync(
      f.file,
      JSON.stringify({ ...f.p, database: join(f.p.root, "alias.sqlite") }),
    );
    assert.throws(() => readProfile(f.file), /symlink/);
  } finally {
    f.close();
  }
});
test("stopped backup restores database, asset bytes and profile together without altering source", async () => {
  const f = fixture();
  try {
    f.run();
    writeFileSync(join(f.p.images, "portrait.webp"), "synthetic-image-bytes");
    writeFileSync(
      join(f.p.sourcebooks, "fixture.pdf"),
      "synthetic-private-fixture",
    );
    const before = readFileSync(f.p.database);
    await assert.rejects(
      backupCampaign({
        database: f.p.database,
        output: join(f.root, "bad"),
        assets: {},
        quiesced: false,
      }),
      /Stop/,
    );
    const output = join(f.root, "backup"),
      manifest = await backupCampaign({
        database: f.p.database,
        output,
        assets: {
          images: f.p.images,
          sourcebooks: f.p.sourcebooks,
          profile: f.file,
        },
        quiesced: true,
      });
    assert.deepEqual(readFileSync(f.p.database), before);
    for (const [path, hash] of Object.entries(manifest.hashes))
      assert.equal(
        createHash("sha256")
          .update(readFileSync(join(output, path)))
          .digest("hex"),
        hash,
      );
    const restored = join(f.root, "restored.sqlite");
    cpSync(join(output, "campaign.sqlite"), restored);
    const check = new SqliteCampaignRepository(restored, { readOnly: true });
    try {
      assert.equal(readActivity(check, f.id)?.status, "planned");
      assert.equal(
        readFileSync(join(output, "sourcebooks", "fixture.pdf"), "utf8"),
        "synthetic-private-fixture",
      );
      assert.equal(
        check.db.prepare("PRAGMA integrity_check").get()!.integrity_check,
        "ok",
      );
    } finally {
      check.close();
    }
  } finally {
    f.close();
  }
});
test("7.0A schema refuses manufactured dice, completion receipts and effects", () => {
  const f = fixture();
  try {
    const s = f.run().view.activity;
    for (const extra of [
      { savedRollIds: [randomUUID()] },
      { transitionReceipt: { quarter: "Night" } },
      { mechanicalEffects: ["heal"] },
      { completionAuthorization: "granted" },
    ])
      assert.equal(
        gameplayStateSchema.safeParse({ ...s, ...extra }).success,
        false,
      );
  } finally {
    f.close();
  }
});
test("a planner-first declaration can be repeated in conversation without another activity", () => {
  const f = fixture();
  try {
    const assignments = f.repo.get(f.id)!.session.characters.map((c, i) => ({
      characterId: c.id,
      activity: ["Make Camp", "Forage", "Keep Watch", "Rest"][i],
      description: "",
    }));
    const a = f.run({ type: "plan", assignments });
    assert.equal(f.run().view.activity!.id, a.view.activity!.id);
    assert.equal(
      f.repo.db.prepare("SELECT * FROM phase7_activities").all().length,
      1,
    );
    assert.equal(f.repo.db.prepare("SELECT * FROM ai_usage").all().length, 0);
  } finally {
    f.close();
  }
});
test("a clock changed outside the service makes the plan stale instead of replaying a completed day", () => {
  const f = fixture();
  try {
    const a = f.run().view.activity!,
      r = f.repo.get(f.id)!;
    r.session.campaign.quarter = "Night";
    f.repo.db
      .prepare(
        "UPDATE campaigns SET public_state=?,revision=revision+1 WHERE id=?",
      )
      .run(JSON.stringify(r.session), f.id);
    assert.equal(
      gameplayView(f.repo, f.id, f.actor, f.principal, f.file).stale,
      true,
    );
    assert.throws(() => f.run(), /different clock/);
    assert.deepEqual(readActivity(f.repo, f.id), a);
  } finally {
    f.close();
  }
});

test("missing runtime profile rejects before opening the default database", async () => {
  const { getGameplayRepository } = await import(
    "../src/server/gameplay/runtime"
  );
  const { existsSync } = await import("node:fs");
  const before = existsSync("data/ravenland.sqlite");
  assert.throws(() => getGameplayRepository(), /explicit/);
  assert.equal(existsSync("data/ravenland.sqlite"), before);
});

test("backup refuses redirected output inside the asset tree before copying", async () => {
  const f = fixture();
  try {
    const alias = join(f.root, "asset-alias");
    symlinkSync(f.p.images, alias);
    await assert.rejects(
      backupCampaign({
        database: f.p.database,
        output: join(alias, "backup"),
        assets: { images: f.p.images },
        quiesced: true,
      }),
      /canonical/,
    );
  } finally {
    f.close();
  }
});

test("legacy consequence read synchronization cannot create another workflow in an enrolled campaign", async () => {
  const f = fixture();
  try {
    const { syncConsequenceRecords } = await import(
      "../src/server/consequences/service"
    );
    assert.throws(() => syncConsequenceRecords(f.repo, f.id), /Phase 7/);
    assert.equal(
      f.repo.db.prepare("SELECT * FROM consequence_commands").all().length,
      0,
    );
    assert.equal(readActivity(f.repo, f.id), null);
  } finally {
    f.close();
  }
});
