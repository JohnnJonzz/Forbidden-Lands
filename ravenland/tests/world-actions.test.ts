import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worldFixture, syntheticWorldRules } from "./fixtures/world-state";
import { dispatchWorldAction } from "../src/server/world/dispatcher";
import {
  readConsequences,
  newConsequence,
  saveConsequence,
} from "../src/server/consequences/store";
import { worldEvents, worldContext } from "../src/server/world/context";
import { worldTurn } from "../src/server/world/turn";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { worldIntentSchema } from "../src/lib/world/schema";
import { AIService } from "../src/server/ai/service";
import { OpenAIProvider } from "../src/server/ai/provider";
const injury = (f: ReturnType<typeof worldFixture>) =>
  readConsequences(f.repo, f.r.id).find((c) => c.id === f.injury.id)!;
const adjudicate = (
  f: ReturnType<typeof worldFixture>,
  pendingId: string,
  amount = 1,
  unit = "rounds",
  decision = "approve",
) => ({
  type: "adjudicate",
  campaignId: f.r.id,
  characterId: f.patient.id,
  requestId: randomUUID(),
  expectedState: f.context().state,
  pendingId,
  decision,
  duration: { unit, amount },
  reason:
    "Explicit isolated ruling: access is established, resistance absent, one round for this action.",
  confirmed: true,
});
function run(f: ReturnType<typeof worldFixture>, c: unknown) {
  return dispatchWorldAction(c, f.repo, f.principal);
}
test("typed intentions cannot carry fabricated outcomes, durations or resources", () => {
  const f = worldFixture();
  try {
    for (const extra of [
      { elapsed: 1 },
      { success: true },
      { equipment: "rope" },
    ])
      assert.equal(
        worldIntentSchema.safeParse({ ...f.action("search"), ...extra })
          .success,
        false,
      );
  } finally {
    f.repo.close();
  }
});
test("search is an intention, adjudicated completion and exactly-once time are atomic and linked separately to injury and aftermath", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const before = JSON.stringify(f.repo.get(f.r.id)!.session),
      p = f.propose("search"),
      pending = run(f, p);
    assert.equal(pending.status, "awaiting_adjudication");
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    const c = adjudicate(f, p.requestId),
      done = run(f, c);
    assert.equal(done.status, "completed");
    assert.deepEqual(done.elapsed, { unit: "rounds", amount: 1 });
    assert.equal(injury(f).state.deadline!.elapsed, 1);
    assert.equal(run(f, c).replayed, true);
    assert.equal(injury(f).state.deadline!.elapsed, 1);
    assert.equal(
      readConsequences(f.repo, f.r.id).find((c) => c.id === f.aftermath.id)!
        .status,
      "pending",
    );
    assert.equal(JSON.stringify(f.repo.get(f.r.id)!.session), before);
    assert.throws(
      () => run(f, { ...c, duration: { unit: "rounds", amount: 2 } }),
      /reused/,
    );
    assert.equal(run(f, f.propose("search")).code, "already_completed");
  } finally {
    f.repo.close();
  }
});
test("invalid actor, absent roster target, inaccessible conscious target and denied ownership never act", () => {
  const f = worldFixture();
  try {
    assert.equal(
      run(f, f.propose("observe", { actorId: f.patient.id })).code,
      "actor_authority",
    );
    assert.equal(
      run(f, f.propose("observe", { targetId: f.r.session.characters[1].id }))
        .code,
      "target_access",
    );
    const r = f.repo.get(f.r.id)!;
    r.session.characters[0].sheet!["attr-strength"] = "1";
    f.repo.update(r.id, r.revision, r.session);
    assert.equal(run(f, f.propose("search")).code, "search_access");
    assert.throws(
      () =>
        dispatchWorldAction(f.propose("observe"), f.repo, {
          playerId: "denied",
          grants: [],
        }),
      /not authorized/,
    );
    assert.equal(injury(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
  }
});
test("verified item existence does not authorize transfer or invent quantities", () => {
  const f = worldFixture();
  try {
    const before = JSON.stringify(f.repo.get(f.r.id)!.session.characters);
    const p = f.propose("transfer", { itemRef: "gear:0" });
    assert.equal(run(f, p).code, "transfer_unsupported");
    assert.throws(()=>run(f, adjudicate(f, p.requestId, 0)),/no safe resolution adapter/);
    assert.equal(
      JSON.stringify(f.repo.get(f.r.id)!.session.characters),
      before,
    );
    assert.equal(injury(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
  }
});
test("stale proposals cannot execute; pending decisions stop autonomous progression and can be declined after state changes", () => {
  const f = worldFixture();
  try {
    const p = f.propose("search");
    run(f, p);
    assert.equal(run(f, f.propose("observe")).code, "pending_decision");
    const r = f.repo.get(f.r.id)!;
    r.session.characters[0].sheet!.gear![0].quantity = "2";
    f.repo.update(r.id, r.revision, r.session);
    assert.throws(() => run(f, adjudicate(f, p.requestId)), /stale/);
    assert.equal(
      run(f, adjudicate(f, p.requestId, 0, "rounds", "decline")).code,
      "declined",
    );
    assert.equal(f.context().pending, null);
    assert.throws(() => run(f, { ...p, requestId: randomUUID() }), /changed/);
  } finally {
    f.repo.close();
  }
});
test("duration units do not convert or advance journey; missing rules roll back the full action", () => {
  const f = worldFixture();
  try {
    for (const unit of ["minutes", "quarter_days", "journey"]) {
      const p = f.propose("advance_time");
      run(f, p);
      assert.equal(
        run(f, adjudicate(f, p.requestId, 1, unit)).status,
        "awaiting_adjudication",
      );
      const current = f.context().pending!;
      run(f, adjudicate(f, current.requestId, 0, "rounds", "decline"));
    }
    const p = f.propose("search");
    run(f, p);
    assert.equal(run(f, adjudicate(f, p.requestId)).code, "time_evidence");
    assert.equal(injury(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
  }
});
test("verified deadline expiry invokes existing fate procedure; departure resolves only robbery aftermath", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const p = f.propose("move", { destination: "depart", targetId: null });
    run(f, p);
    assert.equal(run(f, adjudicate(f, p.requestId, 1)).code, "departed");
    assert.equal(f.context().actors.length, 0);
    assert.equal(
      readConsequences(f.repo, f.r.id).find((c) => c.id === f.aftermath.id)!
        .status,
      "resolved",
    );
    assert.equal(injury(f).status, "awaiting_input");
    assert.equal(injury(f).state.deadline!.elapsed, 1);
  } finally {
    f.repo.close();
  }
  const g = worldFixture();
  try {
    syntheticWorldRules(g.repo, g.r.id);
    const p = g.propose("advance_time");
    run(g, p);
    const done = run(g, adjudicate(g, p.requestId, 4));
    assert.equal(done.status, "completed");
    assert.equal(injury(g).state.resolution, "death_verified");
    assert.match(injury(g).nextProcedure, /expired/);
    assert.equal(
      g.repo.get(g.r.id)!.session.characters[0].sheet!["attr-strength"],
      "0",
    );
  } finally {
    g.repo.close();
  }
});
test("hosted player cannot authorize durations or reconciliation; private inventory is omitted", () => {
  const f = worldFixture();
  try {
    const p = f.propose("search");
    run(f, p);
    const hosted = { ...f.principal, mode: undefined };
    assert.throws(
      () => dispatchWorldAction(adjudicate(f, p.requestId), f.repo, hosted),
      /trusted local/,
    );
    const other = {
      playerId: "other",
      grants: [
        { campaignId: f.r.id, characterIds: [f.r.session.characters[1].id] },
      ],
    };
    assert.deepEqual(worldContext(f.repo, f.r.id, other)!.possessions, []);
    assert.doesNotMatch(
      JSON.stringify(worldContext(f.repo, f.r.id, other)),
      /Silver ring|skills|attributes/,
    );
  } finally {
    f.repo.close();
  }
});
test("historical narration is never replayed, timed or treated as an action", () => {
  const f = worldFixture();
  try {
    const now = new Date(Date.now() + 1000).toISOString();
    f.repo.db
      .prepare(
        "INSERT INTO ai_requests(id,campaign_id,kind,fingerprint,status,payload,response_json,started_at,updated_at) VALUES (?,?,'chat','old','completed','{}','{}',?,?)",
      )
      .run("old", f.r.id, now, now);
    assert.equal(f.context().reconciliationRequired, true);
    assert.equal(run(f, f.propose("search")).code, "historical_review");
    run(f, {
      type: "reconcile",
      campaignId: f.r.id,
      characterId: f.patient.id,
      requestId: randomUUID(),
      sceneId: f.e.id,
      expectedState: f.context().state,
      reason: "Continue from persisted state; old prose is unverified.",
      confirmed: true,
    });
    assert.equal(f.context().reconciliationRequired, false);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    assert.equal(run(f, f.propose("search")).status, "awaiting_adjudication");
  } finally {
    f.repo.close();
  }
});
test("bounded GM budget, controlled decision, successful receipt replay and reopen preserve state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "world-reopen-")),
    filename = join(dir, "db.sqlite"),
    f = worldFixture(filename);
  try {
    let calls = 0;
    const turn = {
      kind: "chat" as const,
      campaignId: f.r.id,
      characterId: f.patient.id,
      requestId: randomUUID(),
      action: "What happens next?",
    };
    const choose = async () => {
      calls++;
      return {
        decision: {
          action: calls === 1 ? f.action("observe") : null,
          boundary: "",
        },
        inputTokens: 0,
        outputTokens: 0,
        model: "controlled",
      };
    };
    const first = await worldTurn(f.repo, turn, f.principal, choose);
    assert.match(first!, /observes/);
    assert.equal(await worldTurn(f.repo, turn, f.principal, choose), first);
    assert.equal(calls, 2);
    assert.equal(worldEvents(f.repo, f.r.id).length, 1);
    f.repo.close();
    const reopened = new SqliteCampaignRepository(filename);
    try {
      assert.equal(await worldTurn(reopened, turn, f.principal, choose), first);
      assert.equal(calls, 2);
      assert.equal(
        readConsequences(reopened, f.r.id).find((c) => c.id === f.injury.id)!
          .state.deadline!.elapsed,
        0,
      );
    } finally {
      reopened.close();
    }
  } finally {
    try {
      f.repo.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
test("ordinary chat chooses a world intention before narration; malicious narrator is never asked to invent results", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    let decisions = 0,
      narrations = 0;
    const provider = {
      async test() {
        throw Error("No paid calls");
      },
      async chooseWorld() {
        decisions++;
        return {
          decision: { action: f.action("search"), boundary: "" },
          inputTokens: 0,
          outputTokens: 0,
          model: "controlled",
        };
      },
      async generate() {
        narrations++;
        throw Error("Free-form outcomes must not run");
      },
    };
    const gm = new AIService(f.repo, provider, f.principal),
      turn = {
        kind: "chat",
        campaignId: f.r.id,
        characterId: f.patient.id,
        requestId: randomUUID(),
        action: "What happens next?",
      };
    const reply = await gm.run(turn);
    assert.match(reply.narration, /not completed|has not completed/);
    assert.match(reply.narration, /0 rounds/);
    assert.equal(decisions, 1);
    assert.equal(narrations, 0);
    assert.equal((await gm.run(turn)).replayed, true);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    assert.equal(decisions, 1);
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("world chooser uses protected charter and rejects model-supplied time or outcome fields", async () => {
  const f = worldFixture();
  try {
    const bodies: any[] = [];
    let extra = false;
    const p = new OpenAIProvider({
      responses: {
        async create(body: any) {
          bodies.push(body);
          return {
            status: "completed",
            model: "controlled",
            output_text: JSON.stringify({
              action: {
                ...f.action("search"),
                ...(extra ? { elapsed: 1 } : {}),
              },
              boundary: "",
            }),
          };
        },
      },
    } as never);
    const input = {
      world: f.context(),
      playerMessage: "What next?",
      urgent: [],
    };
    assert.equal((await p.chooseWorld(input)).decision.action?.kind, "search");
    assert.match(bodies[0].instructions, /PLAYER AGENCY/);
    assert.equal(bodies[0].store, false);
    extra = true;
    await assert.rejects(p.chooseWorld(input), /failed validation/);
  } finally {
    f.repo.close();
  }
});

test("receipt write failure rolls back action, notes and time together; retry can commit once", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const p = f.propose("search");
    run(f, p);
    const c = adjudicate(f, p.requestId),
      before = JSON.stringify(readConsequences(f.repo, f.r.id));
    f.repo.db.exec(
      "CREATE TRIGGER reject_world_receipt BEFORE INSERT ON consequence_commands WHEN json_extract(NEW.result_json,'$.worldEvent.code')='searched' BEGIN SELECT RAISE(ABORT,'controlled receipt failure'); END",
    );
    assert.throws(() => run(f, c), /controlled receipt failure/);
    assert.equal(JSON.stringify(readConsequences(f.repo, f.r.id)), before);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    f.repo.db.exec("DROP TRIGGER reject_world_receipt");
    assert.equal(run(f, c).status, "completed");
    assert.equal(injury(f).state.deadline!.elapsed, 1);
  } finally {
    f.repo.close();
  }
});
test("concurrent snapshots cannot complete twice and local movement removes close search access", () => {
  const f = worldFixture();
  try {
    const a = f.propose("observe"),
      b = f.propose("observe");
    run(f, a);
    assert.throws(() => run(f, b), /changed/);
    const move = f.propose("move", { destination: "near", targetId: null });
    run(f, move);
    assert.equal(run(f, adjudicate(f, move.requestId, 0)).code, "moved_near");
    assert.equal(run(f, f.propose("search")).code, "search_access");
  } finally {
    f.repo.close();
  }
});
test("unsupported NPC aid cannot invent a healer, safe access, recovery or an extra action", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const p = f.propose("assist");
    run(f, p);
    const result = run(f, adjudicate(f, p.requestId, 0));
    assert.equal(result.code, "assistance_requirement");
    assert.match(result.summary, /Arm.s Length/);
    assert.equal(injury(f).state.attempts.length, 0);
    assert.equal(injury(f).state.resolution, null);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
  }
});
test("GM-only deadline details and private proposed item names stay out of public world projections", () => {
  const f = worldFixture();
  try {
    const hidden = newConsequence(
      f.r.id,
      {
        kind: "journal",
        id: "private-source",
        encounterId: f.e.id,
        procedureId: null,
      },
      "lethal_injury",
      "SECRET_INJURY",
    );
    hidden.visibility = "GM Only";
    hidden.state.deadline = { ...f.injury.state.deadline! };
    hidden.nextProcedure = "SECRET_DEADLINE";
    saveConsequence(f.repo, hidden);
    const result = run(f, f.propose("observe"));
    assert.doesNotMatch(result.summary, /SECRET/);
    assert.ok(!result.linkedConsequences.includes(hidden.id));
    const p = f.propose("transfer", {
      itemRef: "gear:0",
      intent: "SECRET_PRIVATE_ITEM",
    });
    run(f, p);
    assert.doesNotMatch(JSON.stringify(f.context()), /SECRET/);
  } finally {
    f.repo.close();
  }
});
test("failed AI reply persistence retries saved world results without choosing or acting twice", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    let calls = 0;
    const provider = {
      async test() {
        throw Error("No API");
      },
      async chooseWorld() {
        calls++;
        return {
          decision: { action: f.action("search"), boundary: "" },
          inputTokens: 0,
          outputTokens: 0,
          model: "controlled",
        };
      },
      async generate() {
        throw Error("No free narration");
      },
    };
    const gm = new AIService(f.repo, provider, f.principal),
      turn = {
        kind: "chat",
        campaignId: f.r.id,
        characterId: f.patient.id,
        requestId: randomUUID(),
        action: "What happens next?",
      };
    f.repo.db.exec(
      "CREATE TRIGGER fail_reply BEFORE UPDATE ON ai_requests WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'controlled reply failure'); END",
    );
    await assert.rejects(gm.run(turn));
    assert.equal(worldEvents(f.repo, f.r.id).length, 1);
    assert.equal(calls, 1);
    f.repo.db.exec("DROP TRIGGER fail_reply");
    const reply = await gm.run(turn);
    assert.match(reply.narration, /intends to search/);
    assert.equal(calls, 1);
    assert.equal(worldEvents(f.repo, f.r.id).length, 1);
    assert.equal(injury(f).state.deadline!.elapsed, 0);
    assert.equal(f.context().reconciliationRequired, false);
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});

test('eligible NPC assistance delegates actual Healing once without restoring Broken attributes',()=>{const f=worldFixture();try{syntheticWorldRules(f.repo,f.r.id);const c=injury(f),clock=f.repo.get(f.r.id)!.session.campaign;c.state.sceneAccess={healerIds:[f.actor.id],safe:true,evidence:'isolated-verified-access',hex:clock.hex,location:clock.location,date:clock.date,quarter:clock.quarter};saveConsequence(f.repo,c);const p=f.propose('assist');run(f,p);const command=adjudicate(f,p.requestId,0);let rolls=0;const done=dispatchWorldAction(command,f.repo,f.principal,()=>{rolls++;return 6});assert.equal(done.status,'completed');assert.equal(done.code,'treatment_attempted');assert.equal(injury(f).state.attempts.length,1);assert.equal(injury(f).state.attempts[0].status,'succeeded');assert.equal(injury(f).state.resolution,'survived_critical');assert.equal(injury(f).state.deadline!.elapsed,0);const count=rolls;assert.ok(count>0);assert.equal(dispatchWorldAction(command,f.repo,f.principal,()=>{rolls++;return 1}).replayed,true);assert.equal(rolls,count);assert.equal(f.repo.get(f.r.id)!.session.characters[0].sheet!['attr-strength'],'0')}finally{f.repo.close()}});
