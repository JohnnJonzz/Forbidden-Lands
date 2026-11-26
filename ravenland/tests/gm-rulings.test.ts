import {advanceQuarter} from '../src/lib/journey/clock';
import { initialSession } from "../src/lib/mock";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { worldFixture, syntheticWorldRules } from "./fixtures/world-state";
import { AIService } from "../src/server/ai/service";
import { rulings, makeRuling, saveRuling } from "../src/server/rulings/store";
import {
  rulingContext,
  resolveRuling,
  currentRulingScope,
} from "../src/server/rulings/service";
import {
  readConsequences,
  newConsequence,
  saveConsequence,
} from "../src/server/consequences/store";
import {
  executeConsequence,
  syncConsequenceRecords,
} from "../src/server/consequences/service";
import { advanceTime } from "../src/server/time/service";
import { dispatchWorldAction } from "../src/server/world/dispatcher";
import { worldEvents } from "../src/server/world/context";
import { treatmentRules } from "../src/server/consequences/rules";
import { CompendiumStore } from "../src/server/compendium/store";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import {
  authorizeMutationRequest,
  authorizeJourneyRequest,
} from "../src/server/mutation-authority";
import { worldCommandSchema } from "../src/lib/world/schema";
const injury = (f: ReturnType<typeof worldFixture>) =>
  readConsequences(f.repo, f.r.id).find((c) => c.id === f.injury.id)!;
const turn = (f: ReturnType<typeof worldFixture>) => ({
  kind: "chat" as const,
  campaignId: f.r.id,
  characterId: f.patient.id,
  requestId: randomUUID(),
  action: "Continue the story.",
});
function ai(
  f: ReturnType<typeof worldFixture>,
  kind: "interact" | "observe" | "search" = "interact",
) {
  let calls = 0;
  const provider = {
    async test() {
      throw Error("No paid calls");
    },
    async generate() {
      throw Error("No unverified narration");
    },
    async chooseWorld() {
      calls++;
      return {
        decision: {
          action:
            calls % 2
              ? f.action(kind, {
                  interaction: kind === "interact" ? "speak" : null,
                })
              : null,
          boundary: "",
        },
        model: "controlled-ruling",
        inputTokens: 0,
        outputTokens: 0,
      };
    },
  };
  return {
    gm: new AIService(f.repo, provider, f.principal),
    calls: () => calls,
  };
}
function decision(
  f: ReturnType<typeof worldFixture>,
  r: ReturnType<typeof rulings>[number],
  effect: unknown,
) {
  return {
    campaignId: f.r.id,
    characterId: f.patient.id,
    requestId: randomUUID(),
    rulingId: r.id,
    revision: r.revision,
    expectedScope: currentRulingScope(f.repo, r),
    reason: "Explicit isolated GM review of this exact scoped question.",
    decision: "apply",
    effect,
    confirmed: true,
  };
}
test("routine AI speech applies a scoped ruling without approval, precise time or player resource changes; reuse and replay are bounded", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const before = JSON.stringify(f.repo.get(f.r.id)!.session.characters),
      x = ai(f),
      c = turn(f);
    const reply = await x.gm.run(c);
    assert.match(reply.narration, /bounded speak/);
    assert.equal(worldEvents(f.repo, f.r.id)[0].status, "completed");
    assert.equal(worldEvents(f.repo, f.r.id)[0].elapsed, null);
    assert.equal(
      rulings(f.repo, f.r.id).filter(
        (r) => r.status === "applied" && r.authority === "A",
      ).length,
      1,
    );
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    const count = x.calls();
    await x.gm.run(c);
    assert.equal(x.calls(), count);
    await x.gm.run(turn(f));
    assert.equal(
      rulings(f.repo, f.r.id).filter((r) => r.domain === "routine_action")
        .length,
      1,
    );
    assert.equal(
      JSON.stringify(f.repo.get(f.r.id)!.session.characters),
      before,
    );
    assert.equal(injury(f).state.resolution, null);
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("fresh continuation can complete the typed pending speech action while preserving the four-round injury", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const p = f.propose("interact", { interaction: "speak" });
    dispatchWorldAction(p, f.repo, f.principal);
    const x = ai(f);
    assert.match((await x.gm.run(turn(f))).narration, /bounded speak/);
    assert.equal(f.context().pending, null);
    assert.equal(injury(f).state.deadline!.value, 4);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    assert.ok(
      rulings(f.repo, f.r.id).some(
        (r) => r.domain === "duration" && r.status === "superseded",
      ),
    );
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("protected search/transfer hold does not block unrelated routine speech or silently resolve theft", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const p = f.propose("transfer", { itemRef: "gear:0" });
    dispatchWorldAction(p, f.repo, f.principal);
    const x = ai(f);
    await x.gm.run(turn(f));
    assert.equal(f.context().pending?.requestId, p.requestId);
    assert.ok(
      rulings(f.repo, f.r.id).some(
        (r) => r.domain === "item_transfer" && r.status === "awaiting_review",
      ),
    );
    assert.equal(
      f.repo.get(f.r.id)!.session.characters[0].sheet!.gear![0].quantity,
      "1",
    );
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("client-provided AI claims cannot mint authority or execute routine rulings", () => {
  const f = worldFixture();
  try {
    const p = f.propose("interact", { interaction: "speak" });
    assert.equal(
      worldCommandSchema.safeParse({ ...p, authority: "A", fromAI: true })
        .success,
      false,
    );
    const result = dispatchWorldAction(p, f.repo, f.principal, undefined, {
      campaignId: f.r.id,
      characterId: f.patient.id,
      requestId: "forged",
    });
    assert.equal(result.status, "awaiting_adjudication");
    assert.equal(
      rulings(f.repo, f.r.id).filter(
        (r) => r.decisionMaker.kind === "ai_workflow",
      ).length,
      0,
    );
  } finally {
    f.repo.close();
  }
});
test("AI policy can disable routine discretion; unrelated actor/target changes invalidate reuse", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const x = ai(f);
    await x.gm.run(turn(f));
    const r = f.repo.get(f.r.id)!;
    r.session.characters[0].sheet!.gear![0].quantity = "2";
    f.repo.update(r.id, r.revision, r.session);
    await x.gm.run(turn(f));
    assert.ok(rulings(f.repo, f.r.id).some((r) => r.status === "invalidated"));
    f.repo.db.prepare("INSERT INTO gm_policy VALUES (?,0)").run(f.r.id);
    const y = ai(f);
    await y.gm.run(turn(f));
    assert.equal(
      worldEvents(f.repo, f.r.id).at(-1)!.status,
      "awaiting_adjudication",
    );
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("protected Healing conflict requires matching effect and human authority; rule revision invalidates its scope", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const store = new CompendiumStore(f.repo),
      rule = store.save(f.r.id, {
        title: "Test Healing override",
        body: "Isolated test ruling.",
        topic: "Combat",
        documentType: "House Rule",
        visibility: "Player Visible",
        sourceReference: "Test only",
        overrideScope: "Lifesaving Healing",
      });
    assert.throws(() => treatmentRules(f.repo, f.r.id, f.injury.id));
    const r = rulings(f.repo, f.r.id).find((r) => r.domain === "healing_rule")!;
    const right = decision(f, r, {
      type: "healing_rule",
      consequenceId: f.injury.id,
      rules: [{ id: rule.id, revision: rule.revision }],
      interpretation: "official_in_this_scope",
    });
    assert.throws(
      () =>
        resolveRuling(
          {
            ...right,
            effect: {
              type: "duration",
              pendingId: r.originId,
              unit: "rounds",
              amount: 0,
            },
          },
          f.repo,
          f.principal,
        ),
      /actual question/,
    );
    assert.throws(
      () => resolveRuling(right, f.repo, { ...f.principal, mode: undefined }),
      /trusted local/,
    );
    // A human interpretation cannot stand in for missing official evidence.
    f.repo.db.prepare("UPDATE source_documents SET status='Uploaded' WHERE campaign_id=?").run(f.r.id);
    assert.throws(() => resolveRuling(right, f.repo, f.principal));
    assert.equal(rulings(f.repo, f.r.id).find(v => v.id === r.id)!.status, "awaiting_review");
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    f.repo.db.prepare("UPDATE source_documents SET status='Indexed' WHERE campaign_id=?").run(f.r.id);
    resolveRuling(right, f.repo, f.principal);
    assert.ok(treatmentRules(f.repo, f.r.id, f.injury.id).sources.length);
    assert.equal(resolveRuling(right, f.repo, f.principal).replayed, true);
    store.save(
      f.r.id,
      {
        title: rule.title,
        body: "Revised exception.",
        topic: "Combat",
        documentType: "House Rule",
        visibility: "Player Visible",
        sourceReference: "Test only",
        overrideScope: "Lifesaving Healing",
      },
      rule.id,
      rule.revision,
    );
    assert.throws(() => treatmentRules(f.repo, f.r.id, f.injury.id));
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    assert.ok(
      rulings(f.repo, f.r.id).some(
        (v) => v.domain === "healing_rule" && v.status === "awaiting_review",
      ),
    );
  } finally {
    f.repo.close();
  }
});
test("one time event affects all matching scene clocks, skips unrelated scenes, and holds mixed units without conversion", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const copy = (id: string, scene: string, unit: "rounds" | "hours") => {
      const c = newConsequence(
        f.r.id,
        { ...f.injury.source, id, procedureId: id, encounterId: scene },
        "lethal_injury",
        id,
      );
      c.visibility = "Party Known";
      c.characterIds = [f.patient.id];
      c.state.deadline = { ...f.injury.state.deadline!, unit };
      saveConsequence(f.repo, c);
      return c;
    };
    const other = copy("other-clock", "unrelated-scene", "rounds"),
      same = copy("second-round", f.e.id, "rounds"),
      mixed = copy("hour-clock", f.e.id, "hours");
    const c = {
      campaignId: f.r.id,
      eventId: randomUUID(),
      sceneId: f.e.id,
      unit: "rounds" as const,
      amount: 1,
      source: "verified-scene-action",
      authority: { kind: "human_controller" as const, id: "test-GM" },
      reason: "A verified scene round.",
    };
    advanceTime(f.repo, c);
    assert.equal(injury(f).state.deadline!.elapsed, 1);
    const all = readConsequences(f.repo, f.r.id);
    assert.equal(all.find((v) => v.id === same.id)!.state.deadline!.elapsed, 1);
    assert.equal(
      all.find((v) => v.id === other.id)!.state.deadline!.elapsed,
      0,
    );
    assert.equal(
      all.find((v) => v.id === mixed.id)!.state.deadline!.elapsed,
      0,
    );
    assert.ok(
      rulings(f.repo, f.r.id).some(
        (r) => r.domain === "time_conversion" && r.consequenceId === mixed.id,
      ),
    );
    assert.equal(advanceTime(f.repo, c).replayed, true);
    assert.throws(() => advanceTime(f.repo, { ...c, amount: 2 }), /reused/);
    assert.equal(injury(f).state.deadline!.elapsed, 1);
  } finally {
    f.repo.close();
  }
});
test("observed combat rounds account for individual start points without counting a round twice", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const a = injury(f);
    a.state.deadline!.value = 10;
    a.state.deadline!.observedRound = 2;
    saveConsequence(f.repo, a);
    const b = newConsequence(
      f.r.id,
      { ...a.source, id: "new-critical", procedureId: "new-critical" },
      "lethal_injury",
      "Newer critical",
    );
    b.state.deadline = { ...a.state.deadline!, observedRound: 3 };
    saveConsequence(f.repo, b);
    f.e.round = 4;
    f.repo.db
      .prepare("UPDATE combat_encounters SET state_json=? WHERE id=?")
      .run(JSON.stringify(f.e), f.e.id);
    const c = {
      campaignId: f.r.id,
      eventId: "combat-round-4",
      sceneId: f.e.id,
      unit: "rounds" as const,
      amount: 1,
      toRound: 4,
      source: "combat-round-adapter",
      authority: { kind: "deterministic" as const, id: "combat-round-adapter" },
      reason: "Verified round 4.",
    };
    advanceTime(f.repo, c);
    assert.equal(injury(f).state.deadline!.elapsed, 2);
    assert.equal(
      readConsequences(f.repo, f.r.id).find((v) => v.id === b.id)!.state
        .deadline!.elapsed,
      1,
    );
    advanceTime(f.repo, { ...c, eventId: "another-observation" });
    assert.equal(injury(f).state.deadline!.elapsed, 2);
  } finally {
    f.repo.close();
  }
});
test("time receipt failure rolls back every affected deadline atomically", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const before = JSON.stringify(readConsequences(f.repo, f.r.id));
    f.repo.db.exec(
      "CREATE TRIGGER reject_time BEFORE INSERT ON consequence_commands WHEN json_extract(NEW.result_json,'$.timeEvent') IS NOT NULL BEGIN SELECT RAISE(ABORT,'time receipt failure'); END",
    );
    assert.throws(
      () =>
        advanceTime(f.repo, {
          campaignId: f.r.id,
          eventId: randomUUID(),
          sceneId: f.e.id,
          unit: "rounds",
          amount: 1,
          source: "test",
          authority: { kind: "human_controller", id: "test" },
          reason: "Verified test round.",
        }),
      /time receipt failure/,
    );
    assert.equal(JSON.stringify(readConsequences(f.repo, f.r.id)), before);
  } finally {
    f.repo.close();
  }
});
test("calendar change creates scoped conversion hold; exact human resolution applies once and preserves other clocks", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const before = f.repo.get(f.r.id)!;
    Object.assign(before.session.campaign,advanceQuarter(before.session.campaign.date,before.session.campaign.quarter));
    f.repo.update(before.id, before.revision, before.session, {
      elapsedQuarters: 1,
      timeEventId: "calendar-change",
    });
    const r = rulings(f.repo, f.r.id).find(
      (r) => r.domain === "time_conversion",
    )!;
    assert.ok(r);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    const c = decision(f, r, {
      type: "time_conversion",
      timeEventId: r.originId,
      consequenceId: f.injury.id,
      unit: "rounds",
      amount: 1,
    });
    resolveRuling(c, f.repo, f.principal);
    assert.equal(injury(f).state.deadline!.elapsed, 1);
    assert.equal(injury(f).state.deadline!.clockReviewRequired, false);
    assert.equal(resolveRuling(c, f.repo, f.principal).replayed, true);
  } finally {
    f.repo.close();
  }
});
test("holds survive database reopen and cannot be cleared by a mismatched or stale decision", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruling-reopen-")),
    file = join(dir, "db.sqlite"),
    f = worldFixture(file);
  try {
    syntheticWorldRules(f.repo, f.r.id);
    executeConsequence(
      {
        type: "adjudication",
        campaignId: f.r.id,
        characterId: f.patient.id,
        requestId: randomUUID(),
        consequenceId: f.injury.id,
        note: "Disputed timing question.",
        confirmed: true,
      },
      f.repo,
      f.principal,
    );
    const hold = rulings(f.repo, f.r.id).find(
        (r) => r.domain === "consequence_review",
      )!,
      c = decision(f, hold, {
        type: "consequence_review",
        consequenceId: f.injury.id,
        decision: "retain_mechanics",
      });
    f.repo.close();
    const repo = new SqliteCampaignRepository(file);
    try {
      syncConsequenceRecords(repo, f.r.id);
      assert.equal(
        readConsequences(repo, f.r.id).find((c) => c.id === f.injury.id)!
          .status,
        "awaiting_adjudication",
      );
      assert.throws(
        () =>
          resolveRuling({ ...c, expectedScope: "stale" }, repo, f.principal),
        /changed/,
      );
      const live = rulings(repo, f.r.id).find((r) => r.id === hold.id)!;
      resolveRuling(
        {
          ...c,
          revision: live.revision,
          expectedScope: currentRulingScope(repo, live),
        },
        repo,
        f.principal,
      );
      syncConsequenceRecords(repo, f.r.id);
      assert.equal(
        readConsequences(repo, f.r.id).find((c) => c.id === f.injury.id)!
          .status,
        "awaiting_input",
      );
    } finally {
      repo.close();
    }
  } finally {
    try {
      f.repo.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
test("every mutation path fails closed for anonymous or forged hosted-GM callers", () => {
  const old = process.env.RAVENLAND_PLAYER_GRANTS,
    token = "controlled-player-token-012345678901234567890123",
    campaignId = randomUUID();
  process.env.RAVENLAND_PLAYER_GRANTS = JSON.stringify([
    {
      playerId: "player",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      grants: [{ campaignId, characterIds: ["own-character"] }],
    },
  ]);
  try {
    for (const path of [
      "/api/journey",
      "/api/campaigns",
      "/api/map/locations",
      "/api/characters",
      "/api/ai/settings",
      "/api/unrecognized-mutation",
    ]) {
      assert.throws(() =>
        authorizeMutationRequest(
          new Request("https://hosted.example" + path, {
            method: "POST",
            headers: { "x-role": "gm" },
          }),
        ),
      );
    }
    const req = new Request("https://hosted.example/api/journey", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "x-role": "gm" },
    });
    assert.throws(
      () =>
        authorizeJourneyRequest(req, {
          campaignId,
          type: "weather",
          role: "gm",
        }),
      /trusted local/,
    );
    assert.throws(
      () =>
        authorizeJourneyRequest(req, {
          campaignId: randomUUID(),
          type: "quarter-chat-request",
        }),
      /not assigned/,
    );
  } finally {
    if (old === undefined) delete process.env.RAVENLAND_PLAYER_GRANTS;
    else process.env.RAVENLAND_PLAYER_GRANTS = old;
  }
});

test("manual time cannot double-charge a round owned by active combat", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    f.e.status = "active";
    f.repo.db
      .prepare(
        "UPDATE combat_encounters SET status='active',state_json=? WHERE id=?",
      )
      .run(JSON.stringify(f.e), f.e.id);
    assert.throws(
      () =>
        advanceTime(f.repo, {
          campaignId: f.r.id,
          eventId: randomUUID(),
          sceneId: f.e.id,
          unit: "rounds",
          amount: 1,
          source: "manual",
          authority: { kind: "human_controller", id: "test-GM" },
          reason: "Attempt to charge a combat round manually.",
        }),
      /Active combat owns/,
    );
    assert.equal(injury(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
  }
});

test("failed duration approval retains the original question and can resolve after matching source evidence is restored", () => {
  const f = worldFixture();
  try {
    const p = f.propose("search");
    dispatchWorldAction(p, f.repo, f.principal);
    const failed = dispatchWorldAction(
      {
        type: "adjudicate",
        campaignId: f.r.id,
        characterId: f.patient.id,
        requestId: randomUUID(),
        pendingId: p.requestId,
        expectedState: f.context().state,
        decision: "approve",
        duration: { unit: "rounds", amount: 1 },
        reason: "Explicit duration; evidence currently unavailable.",
        confirmed: true,
      },
      f.repo,
      f.principal,
    );
    assert.equal(failed.code, "time_evidence");
    assert.equal(f.context().pending?.requestId, p.requestId);
    assert.equal(
      rulings(f.repo, f.r.id).filter(
        (r) => r.domain === "duration" && r.status === "awaiting_review",
      ).length,
      1,
    );
    syntheticWorldRules(f.repo, f.r.id);
    const r = rulings(f.repo, f.r.id).find((r) => r.domain === "duration")!;
    resolveRuling(
      decision(f, r, {
        type: "duration",
        pendingId: p.requestId,
        unit: "rounds",
        amount: 1,
      }),
      f.repo,
      f.principal,
    );
    assert.equal(f.context().pending, null);
    assert.equal(injury(f).state.deadline!.elapsed, 1);
    assert.equal(
      rulings(f.repo, f.r.id).filter(
        (r) => r.domain === "duration" && r.status === "applied",
      ).length,
      1,
    );
    // Restored evidence can disappear again; its persistent question must reopen.
    syncConsequenceRecords(f.repo, f.r.id);
    f.repo.db.prepare("UPDATE source_documents SET status='Uploaded' WHERE campaign_id=?").run(f.r.id);
    syncConsequenceRecords(f.repo, f.r.id);
    const evidence = rulings(f.repo, f.r.id).find(v => v.domain === "rules_conflict")!;
    assert.equal(evidence.status, "awaiting_review");
    f.repo.db.prepare("UPDATE source_documents SET status='Indexed' WHERE campaign_id=?").run(f.r.id);
    syncConsequenceRecords(f.repo, f.r.id);
    assert.equal(rulings(f.repo, f.r.id).find(v => v.id === evidence.id)!.status, "invalidated");
    f.repo.db.prepare("UPDATE source_documents SET status='Uploaded' WHERE campaign_id=?").run(f.r.id);
    syncConsequenceRecords(f.repo, f.r.id);
    assert.equal(rulings(f.repo, f.r.id).find(v => v.id === evidence.id)!.status, "awaiting_review");
    assert.equal(injury(f).state.deadline!.elapsed, 1);
  } finally {
    f.repo.close();
  }
});
test("calendar-only campaigns still record clock receipts; cosmetic changes do not create game time", () => {
  const repo = new SqliteCampaignRepository(":memory:");
  try {
    const initial = structuredClone(initialSession),
      r = repo.create(initial);
    Object.assign(r.session.campaign,advanceQuarter(r.session.campaign.date,r.session.campaign.quarter));
    repo.update(r.id, r.revision, r.session, {
      elapsedQuarters: 1,
      timeEventId: "calendar-only",
    });
    const event = JSON.parse(
      repo.db
        .prepare(
          "SELECT result_json FROM consequence_commands WHERE campaign_id=? AND request_id='time:calendar-only'",
        )
        .get(r.id)!.result_json as string,
    ).timeEvent;
    assert.equal(event.amount, 1);
    assert.equal(event.unit, "quarter_days");
    assert.deepEqual(event.affected, []);
    const current = repo.get(r.id)!;
    current.session.journal.push({
      id: "cosmetic-note",
      title: "Note",
      text: "No game time passed.",
    });
    repo.update(r.id, current.revision, current.session);
    assert.equal(
      repo.db
        .prepare(
          "SELECT count(*) AS n FROM consequence_commands WHERE campaign_id=?",
        )
        .get(r.id)!.n,
      1,
    );
  } finally {
    repo.close();
  }
});

test("legacy persisted adjudication status is retained as a typed hold rather than erased", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const c = injury(f);
    c.status = "awaiting_adjudication";
    c.nextProcedure = "Legacy protected timing decision still needs review.";
    saveConsequence(f.repo, c);
    syncConsequenceRecords(f.repo, f.r.id);
    assert.equal(injury(f).status, "awaiting_adjudication");
    assert.match(injury(f).nextProcedure, /Legacy protected timing/);
    assert.ok(
      rulings(f.repo, f.r.id).some(
        (r) =>
          r.originId === "legacy:" + c.id && r.status === "awaiting_review",
      ),
    );
  } finally {
    f.repo.close();
  }
});
