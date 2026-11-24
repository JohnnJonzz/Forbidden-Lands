import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { completionIntent } from "../src/server/quarter-resolution/conversation";
import { guardQuarterNarration } from "../src/server/quarter-resolution/narration";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { executeJourney } from "../src/server/journey/service";
import { activeChatForm } from "../src/lib/journey/chat-engine";
test("completion phrases target exactly the authoritative quarter and reject questions, history and skipped quarters", () => {
  for (const v of [
    "Complete the Quarter Day",
    "Finish Evening",
    "Advance to Night",
    "Close the current quarter",
    "Return to camp and complete the Evening quarter-day.",
    "Please finish this quarter-day!",
  ])
    assert.deepEqual(completionIntent(v, "Evening"), { error: null }, v);
  for (const v of [
    "Can we complete the Quarter Day?",
    "Yesterday we finished Evening",
    "Maybe complete the quarter-day",
    "Describe camp",
  ])
    assert.equal(completionIntent(v, "Evening"), null);
  assert.match(
    completionIntent("Finish Day", "Evening")!.error!,
    /authoritative quarter is Evening/,
  );
  assert.match(
    completionIntent("Advance to Morning", "Evening")!.error!,
    /next legal transition is Night/,
  );
});
test("pending stationary quarter blocks false next-quarter narration but preserves factual description", () => {
  const repo = new SqliteCampaignRepository(":memory:");
  try {
    const s = structuredClone(initialSession);
    s.campaign.quarter = "Evening";
    const r = repo.create(s),
      id = r.id,
      journey = (values: object) =>
        executeJourney(
          {
            campaignId: id,
            revision: repo.get(id)!.revision,
            actionId: randomUUID(),
            ...values,
          },
          repo,
        );
    journey({ type: "quarter-chat-request" });
    const form = activeChatForm(repo.get(id)!.session)!;
    journey({
      type: "quarter-chat-submit",
      formId: form.id,
      actorId: s.characters[0].id,
      draft: {
        ...form.draft,
        assignments: form.draft.assignments.map((a) => ({
          ...a,
          activity: "Rest",
          skill: "No roll",
          outcome: "",
        })),
      },
    });
    for (const v of [
      "Evening has ended. Night has begun.",
      "It is now Night.",
      "The quarter-day completed.",
      "Night begins over the camp.",
    ])
      assert.match(
        guardQuarterNarration(repo, id, v),
        /authoritative clock remains Evening/,
      );
    assert.equal(
      guardQuarterNarration(
        repo,
        id,
        "The campfire flickers. Evening continues.",
      ),
      "The campfire flickers. Evening continues.",
    );
  } finally {
    repo.close();
  }
});
