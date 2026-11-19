import { readConsequences } from "../consequences/store";
import type { SqliteCampaignRepository } from "../sqlite";
import type { WorldEvent } from "../../lib/world/schema";
import type { GMRuling } from "../../lib/rulings/schema";
import { makeRuling, rulingHash, rulings, saveRuling } from "./store";
export function recordWorldHold(
  repo: SqliteCampaignRepository,
  event: WorldEvent,
) {
  if (event.status !== "awaiting_adjudication") return null;
  if (event.pendingId) {
    const prior = rulings(repo, event.campaignId).find(
      (r) => r.originId === event.pendingId && r.domain === "duration",
    );
    if (prior) {
      prior.blockingReason = event.summary;
      return saveRuling(repo, prior);
    }
    return null;
  }
  const domain: GMRuling["domain"] =
    event.code === "duration_required"
      ? "duration"
      : /transfer|possession/.test(event.code)
        ? "item_transfer"
        : /assistance|search_access/.test(event.code)
          ? "scene_access"
          : event.code === "deadline_unit"
            ? "time_conversion"
            : "rules_conflict";
  return makeRuling(repo, {
    campaignId: event.campaignId,
    sceneId: event.sceneId,
    originId: event.requestId,
    consequenceId:
      domain === "scene_access"
        ? (readConsequences(repo, event.campaignId).find(
            (c) =>
              event.linkedConsequences.includes(c.id) &&
              c.category === "lethal_injury" &&
              c.characterIds.includes(event.targetId ?? ""),
          )?.id ?? null)
        : null,
    domain,
    question: event.summary,
    facts: [
      "Proposed actor " + event.actorId,
      "Target " + event.targetId,
      "No action or elapsed time has been applied.",
    ],
    sources: event.evidence,
    scope: { key: event.requestId, fingerprint: event.state },
    resolutionTypes:
      domain === "duration"
        ? ["duration"]
        : domain === "scene_access"
          ? ["scene_access"]
          : [],
    blockingReason:
      domain === "item_transfer"
        ? "No safe item custody/transfer adapter exists. Human approval cannot invent one."
        : event.code,
    authority: "C",
    risk: "protected",
  });
}
