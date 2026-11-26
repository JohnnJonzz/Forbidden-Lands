import { randomUUID } from "node:crypto";
import { prepareEncounterSetup } from "../../src/server/combat/setup-workflow";
import { pendingSetup } from "../../src/server/combat/setup-store";
import type { worldFixture } from "./world-state";
export const continueScene =
  "Continue the current scene. The bandit remains nearby. As GM, decide what he does next.";
export const liveWorldRequest =
  `Continue the current scene. Edrus is Broken and cannot take normal actions. The bandit is still present and pursuing his robbery objective.

As Game Master, choose the band's next action using the supported world-action system. Resolve and record that action before narrating its outcome. If the action requires adjudication, identify the specific missing information instead of inventing a result.

Preserve Edrus's recorded injury and four-round lethal deadline.`.replace(
    "band's",
    "bandit's",
  );
export function seedOldSetup(
  f: ReturnType<typeof worldFixture>,
  status: "pending" | "cancelled" | "superseded" | "resumed" = "superseded",
) {
  prepareEncounterSetup(
    f.repo,
    {
      kind: "chat",
      campaignId: f.r.id,
      characterId: f.patient.id,
      requestId: randomUUID(),
      action:
        "Begin a new encounter on a distant forest road near The Hollow Watch, with only Edrus and one bandit at Near. No companions are present.",
    },
    f.principal,
  );
  const p = pendingSetup(f.repo, f.r.id, f.patient.id)!;
  // Retain an actual old setup row and source declaration, with a snapshot from
  // before the concluded encounter. Never edit a live record or world event.
  p.snapshot.latestEncounterId = null;
  f.repo.db
    .prepare(
      "UPDATE combat_setup_proposals SET status=?,snapshot_json=?,encounter_id=? WHERE id=?",
    )
    .run(
      status,
      JSON.stringify(p.snapshot),
      status === "resumed" ? f.e.id : null,
      p.id,
    );
  return p.id;
}
