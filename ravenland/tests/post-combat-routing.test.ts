import OpenAI from "openai";
import { OpenAIProvider } from "../src/server/ai/provider";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { worldFixture, syntheticWorldRules } from "./fixtures/world-state";
import {
  seedOldSetup,
  continueScene,
  liveWorldRequest,
} from "./fixtures/post-combat-routing";
import { AIService } from "../src/server/ai/service";
import {
  prepareEncounterSetup,
  encounterSetupRouting,
} from "../src/server/combat/setup-workflow";
import { pendingSetup, latestSetup } from "../src/server/combat/setup-store";
import { setupContinue } from "../src/server/combat/setup-intent";
import { activeCombat } from "../src/server/combat/store";
import {
  readConsequences,
  saveConsequence,
} from "../src/server/consequences/store";
import { worldEvents } from "../src/server/world/context";
import { SqliteCampaignRepository } from "../src/server/sqlite";
const turn = (f: ReturnType<typeof worldFixture>, action: string) => ({
  kind: "chat" as const,
  campaignId: f.r.id,
  characterId: f.patient.id,
  requestId: randomUUID(),
  action,
});
const obligation = (f: ReturnType<typeof worldFixture>) =>
  readConsequences(f.repo, f.r.id).find((c) => c.id === f.injury.id)!;
function baseline(f: ReturnType<typeof worldFixture>) {
  return JSON.stringify({
    campaign: f.repo.get(f.r.id)!.session.campaign,
    characters: f.repo.get(f.r.id)!.session.characters,
    scene: f.repo.db
      .prepare("SELECT state_json FROM combat_encounters WHERE campaign_id=?")
      .all(f.r.id),
  });
}
test("scene continuation and incidental encounter/NPC mentions are not setup confirmations", () => {
  for (const message of [
    continueScene,
    liveWorldRequest,
    "Continue the current scene after the encounter.",
    "Continue the aftermath.",
    "As GM, choose the bandit’s next action.",
  ])
    assert.equal(setupContinue(message), false);
  for (const message of [
    "Proceed.",
    "Yes, proceed.",
    "Proceed with the encounter as described.",
  ]) {
    if (!message.startsWith("Yes")) assert.equal(setupContinue(message), true);
  }
});
for (const status of ["pending", "cancelled", "superseded", "resumed"] as const)
  test(
    "old " + status + " setup cannot hijack the concluded scene",
    async () => {
      const f = worldFixture(),
        mode = process.env.RAVENLAND_AI_MODE;
      process.env.RAVENLAND_AI_MODE = "openai";
      try {
        syntheticWorldRules(f.repo, f.r.id);
        seedOldSetup(f, status);
        const before = baseline(f),
          setup = JSON.stringify(latestSetup(f.repo, f.r.id, f.patient.id));
        let choices = 0;
        const gm = new AIService(
          f.repo,
          {
            async test() {
              throw Error("No paid calls");
            },
            async generate() {
              throw Error("World results must precede narration");
            },
            async chooseWorld() {
              choices++;
              return {
                decision: { action: f.action("search"), boundary: "" },
                model: "controlled-routing",
                inputTokens: 0,
                outputTokens: 0,
              };
            },
          },
          f.principal,
        );
        for (const message of [
          continueScene,
          liveWorldRequest,
          "GM, choose the bandit’s next action.",
        ]) {
          const c = turn(f, message);
          assert.equal(encounterSetupRouting(f.repo, c), false);
          assert.equal(prepareEncounterSetup(f.repo, c, f.principal), null);
          const reply = await gm.run(c);
          assert.match(reply.narration, /intends to search|duration/);
          assert.doesNotMatch(
            reply.narration,
            /setup is no longer pending|setup has already been used/,
          );
          assert.equal(activeCombat(f.repo, f.r.id), null);
          assert.equal(obligation(f).state.deadline!.elapsed, 0);
          assert.equal(obligation(f).state.deadline!.value, 4);
          assert.equal(obligation(f).status, "awaiting_input");
          assert.equal(
            readConsequences(f.repo, f.r.id).find(
              (c) => c.id === f.aftermath.id,
            )!.status,
            "pending",
          );
          assert.equal((await gm.run(c)).replayed, true);
        }
        assert.equal(choices, 1);
        assert.equal(worldEvents(f.repo, f.r.id).length, 1);
        assert.equal(baseline(f), before);
        assert.equal(
          JSON.stringify(latestSetup(f.repo, f.r.id, f.patient.id)),
          setup,
        );
      } finally {
        f.repo.close();
        if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
        else process.env.RAVENLAND_AI_MODE = mode;
      }
    },
  );
test("only explicit old-plan resume receives the duplicate diagnostic; bare continuation follows the scene", () => {
  const f = worldFixture();
  try {
    seedOldSetup(f, "cancelled");
    for (const text of ["Continue.", "Yes.", "How is the bandit?"])
      assert.equal(
        prepareEncounterSetup(f.repo, turn(f, text), f.principal),
        null,
      );
    const response = prepareEncounterSetup(
      f.repo,
      turn(f, "Resume the previous encounter setup."),
      f.principal,
    );
    assert.equal(response?.kind, "respond");
    assert.match(
      response?.kind === "respond" ? response.narration : "",
      /no longer pending/,
    );
    assert.equal(activeCombat(f.repo, f.r.id), null);
  } finally {
    f.repo.close();
  }
});
test("a genuine clarification and an explicit new encounter request retain setup precedence", () => {
  const f = worldFixture();
  try {
    seedOldSetup(f, "pending");
    const p = pendingSetup(f.repo, f.r.id, f.patient.id)!;
    const ready = prepareEncounterSetup(
      f.repo,
      turn(f, "Use the saved campaign location."),
      f.principal,
    );
    assert.equal(ready?.kind, "respond");
    const confirmed = prepareEncounterSetup(
      f.repo,
      turn(f, "Yes, proceed."),
      f.principal,
    );
    assert.equal(confirmed?.kind, "start");
    assert.equal(confirmed?.kind === "start" ? confirmed.proposalId : "", p.id);
    const newRequest = prepareEncounterSetup(
      f.repo,
      turn(
        f,
        "Begin a new encounter on a distant road near the Watch with only Edrus and two bandits at Short.",
      ),
      f.principal,
    );
    assert.equal(newRequest?.kind, "respond");
    assert.notEqual(pendingSetup(f.repo, f.r.id, f.patient.id)!.id, p.id);
    assert.equal(
      pendingSetup(f.repo, f.r.id, f.patient.id)!.proposal.enemies,
      "bandit x2",
    );
    assert.equal(activeCombat(f.repo, f.r.id), null);
  } finally {
    f.repo.close();
  }
});
test("specific unsupported transfer diagnostic and required injury roll survive post-combat routing", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    seedOldSetup(f);
    let calls = 0;
    const gm = new AIService(
      f.repo,
      {
        async test() {
          throw Error("No API");
        },
        async generate() {
          throw Error("No free outcomes");
        },
        async chooseWorld() {
          calls++;
          return {
            decision: {
              action: f.action("transfer", { itemRef: "gear:0" }),
              boundary: "",
            },
            model: "controlled",
            inputTokens: 0,
            outputTokens: 0,
          };
        },
      },
      f.principal,
    );
    assert.match(
      (await gm.run(turn(f, continueScene))).narration,
      /custody|transfer/,
    );
    assert.equal(worldEvents(f.repo, f.r.id)[0].code, "transfer_unsupported");
    const c = obligation(f);
    c.state.deadline!.value = null;
    c.status = "awaiting_roll";
    saveConsequence(f.repo, c);
    assert.match(
      (await gm.run(turn(f, continueScene))).narration,
      /roll|deadline/,
    );
    assert.equal(calls, 1);
    assert.equal(obligation(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});
test("post-combat request and world receipts replay after SQLite reopening without restarting combat", async () => {
  const dir = mkdtempSync(join(tmpdir(), "raven-routing-")),
    file = join(dir, "db.sqlite"),
    f = worldFixture(file),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    seedOldSetup(f, "resumed");
    let calls = 0;
    const provider = {
        async test() {
          throw Error("No API");
        },
        async generate() {
          throw Error("No narration");
        },
        async chooseWorld() {
          calls++;
          return {
            decision: { action: f.action("search"), boundary: "" },
            model: "controlled",
            inputTokens: 0,
            outputTokens: 0,
          };
        },
      },
      c = turn(f, continueScene);
    const first = await new AIService(f.repo, provider, f.principal).run(c);
    f.repo.close();
    const reopened = new SqliteCampaignRepository(file);
    try {
      const replay = await new AIService(reopened, provider, f.principal).run(
        c,
      );
      assert.equal(replay.replayed, true);
      assert.equal(replay.narration, first.narration);
      assert.equal(calls, 1);
      assert.equal(activeCombat(reopened, f.r.id), null);
      assert.equal(worldEvents(reopened, f.r.id).length, 1);
      assert.equal(
        readConsequences(reopened, f.r.id).find((v) => v.id === f.injury.id)!
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
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});

test("ordinary rules questions do not execute world actions; provider decision failure stays a specific error", async () => {
  const f = worldFixture(),
    mode = process.env.RAVENLAND_AI_MODE;
  process.env.RAVENLAND_AI_MODE = "openai";
  try {
    syntheticWorldRules(f.repo, f.r.id);
    seedOldSetup(f);
    let calls = 0;
    const gm = new AIService(
      f.repo,
      {
        async test() {
          throw Error("No paid calls");
        },
        async generate() {
          return {
            provider: "application" as const,
            model: "controlled-reference",
            inputTokens: 0,
            outputTokens: 0,
            output: {
              narration: "Reference only; no action occurred.",
              actions: [],
              memoryProposals: [],
              selectedImageId: null,
            },
          };
        },
        async chooseWorld() {
          calls++;
          return {
            decision: { action: { invalid: true }, boundary: "" } as never,
            model: "malformed-controlled",
            inputTokens: 0,
            outputTokens: 0,
          };
        },
      },
      f.principal,
    );
    await gm.run(
      turn(f, "Explain the rules for Broken and critical injuries."),
    );
    assert.equal(calls, 0);
    assert.equal(worldEvents(f.repo, f.r.id).length, 0);
    await assert.rejects(gm.run(turn(f, continueScene)), (error: unknown) => {
      assert.equal((error as { code: string }).code, "world_decision");
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(worldEvents(f.repo, f.r.id).length, 0);
    assert.equal(obligation(f).state.deadline!.elapsed, 0);
  } finally {
    f.repo.close();
    if (mode === undefined) delete process.env.RAVENLAND_AI_MODE;
    else process.env.RAVENLAND_AI_MODE = mode;
  }
});

test("world decisions read actual SDK message output when output_text convenience field is absent", async () => {
  const f = worldFixture();
  try {
    const client = new OpenAI({
      apiKey: "CONTROLLED_TEST_ONLY",
      maxRetries: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "resp_routing",
            status: "completed",
            model: "controlled",
            output: [
              {
                id: "msg_routing",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      action: f.action("search"),
                      boundary: "",
                    }),
                    annotations: [],
                  },
                ],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    });
    const result = await new OpenAIProvider(client).chooseWorld({
      world: f.context(),
      playerMessage: continueScene,
      urgent: [],
    });
    assert.equal(result.decision.action?.kind, "search");
  } finally {
    f.repo.close();
  }
});

test("explicit scene progression cannot accidentally fill a stale plan’s missing setup fields", () => {
  const f = worldFixture();
  try {
    seedOldSetup(f, "pending");
    const p = pendingSetup(f.repo, f.r.id, f.patient.id)!;
    p.proposal.range = null;
    p.proposal.participantsKnown = false;
    f.repo.db
      .prepare("UPDATE combat_setup_proposals SET proposal_json=? WHERE id=?")
      .run(JSON.stringify(p.proposal), p.id);
    const before = JSON.stringify(pendingSetup(f.repo, f.r.id, f.patient.id));
    const c = turn(
      f,
      "Continue the current scene. Only Edrus and one bandit remain at Near. As GM, choose his next action.",
    );
    assert.equal(encounterSetupRouting(f.repo, c), false);
    assert.equal(prepareEncounterSetup(f.repo, c, f.principal), null);
    assert.equal(
      JSON.stringify(pendingSetup(f.repo, f.r.id, f.patient.id)),
      before,
    );
  } finally {
    f.repo.close();
  }
});
