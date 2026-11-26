import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { executeJourney } from "../src/server/journey/service";
import { activeChatForm } from "../src/lib/journey/chat-engine";
import { executeQuarterResolution } from "../src/server/quarter-resolution/service";
import { checks } from "../src/server/quarter-resolution/director";
import { resumeQuarter } from "../src/server/quarter-resolution/service";
function fixture() {
  const repo = new SqliteCampaignRepository(":memory:"),
    r = repo.create(structuredClone(initialSession)),
    id = r.id,
    actor = r.session.characters[0].id,
    current = () => repo.get(id)!;
  executeJourney(
    {
      campaignId: id,
      revision: current().revision,
      actionId: randomUUID(),
      type: "quarter-chat-request",
    },
    repo,
  );
  const f = activeChatForm(current().session)!;
  executeJourney(
    {
      campaignId: id,
      revision: current().revision,
      actionId: randomUUID(),
      type: "quarter-chat-submit",
      formId: f.id,
      actorId: actor,
      draft: {
        ...f.draft,
        assignments: f.draft.assignments.map((a) => ({
          ...a,
          activity: "Rest",
          skill: "No roll",
          outcome: "",
        })),
      },
    },
    repo,
  );
  const entryId = activeChatForm(current().session)!.entryId!,
    p = {
      playerId: "trusted-local",
      mode: "trusted-local" as const,
      grants: [{ campaignId: id, characterIds: [actor] }],
    },
    start = {
      campaignId: id,
      entryId,
      actorId: actor,
      requestId: randomUUID(),
      revision: current().revision,
      operation: "start",
      confirmed: true,
      options: {
        autoComplete: true,
        encounterHandling: "AI GM Assisted",
        mode: "On foot",
      },
    };
  return { repo, id, actor, entryId, current, p, start };
}
test("missing original encounter sources create a precise durable hold without invented dice or time", () => {
  const f = fixture();
  try {
    const before = f.current().session.campaign,
      v = executeQuarterResolution(f.repo, f.start, f.p);
    assert.equal(v.flow?.status, "Awaiting Table GM ruling");
    assert.match(v.flow!.prompt, /Handbook/);
    assert.deepEqual(f.current().session.campaign, before);
    assert.equal(checks(f.repo, f.id).length, 0);
    const replay = executeQuarterResolution(f.repo, f.start, f.p);
    assert.equal(replay.replayed, true);
    assert.equal(checks(f.repo, f.id).length, 0);
    assert.throws(
      () =>
        executeQuarterResolution(
          f.repo,
          { ...f.start, operation: "continue" },
          f.p,
        ),
      /different choice/,
    );
  } finally {
    f.repo.close();
  }
});
test("individual hosted ownership cannot become a party controller or spend another character WP", () => {
  const f = fixture();
  try {
    const player = { playerId: "one-owner", grants: f.p.grants };
    assert.throws(
      () => executeQuarterResolution(f.repo, f.start, player),
      /not authorized/,
    );
    assert.equal(
      f.repo.db
        .prepare("SELECT count(*) AS n FROM quarter_resolution_flows")
        .get()!.n,
      0,
    );
    assert.equal(resumeQuarter(f.repo, f.id, player, randomUUID()), null);
  } finally {
    f.repo.close();
  }
});
test("generic campaign edits cannot inject or rewrite final outcome receipts", () => {
  const f = fixture();
  try {
    const r = f.current();
    r.session.activityOutcomes = [
      {
        id: randomUUID(),
        entryId: f.entryId,
        assignmentId: "fake",
        characterId: f.actor,
        scope: "fake",
        rollId: null,
        rawSuccesses: null,
        finalSuccesses: 1,
        source: "talent",
        reference: "Invented source",
        wpCost: 0,
        reason: "Forged",
        actorId: "forged",
        at: new Date().toISOString(),
      },
    ];
    assert.throws(
      () => f.repo.update(f.id, r.revision, r.session),
      /verified interventions/,
    );
    assert.equal(f.current().session.activityOutcomes, undefined);
  } finally {
    f.repo.close();
  }
});
