import { readConsequences } from "../consequences/store";
import type { SqliteCampaignRepository } from "../sqlite";
import type { GMTurn } from "../../lib/ai/schema";
import type { WorldIntent } from "../../lib/world/schema";
import { makeRuling, rulings, rulingHash, rulingTransition } from "./store";
import { worldScene } from "../world/context";
const permits = new WeakSet<object>();
export interface AIWorkflowPermit {
  campaignId: string;
  characterId: string;
  requestId: string;
}
export function aiWorkflowPermit(
  repo: SqliteCampaignRepository,
  c: GMTurn,
): AIWorkflowPermit | undefined {
  const row = repo.db
    .prepare(
      "SELECT payload FROM ai_requests WHERE campaign_id=? AND id=? AND status='running'",
    )
    .get(c.campaignId, c.requestId);
  if (!row) return;
  const saved = JSON.parse(row.payload as string);
  if (saved.characterId !== c.characterId || saved.kind !== "chat") return;
  const token = {
    campaignId: c.campaignId,
    characterId: c.characterId,
    requestId: c.requestId,
  };
  permits.add(token);
  return token;
}
export function isAIWorkflow(
  repo: SqliteCampaignRepository,
  permit: AIWorkflowPermit | undefined,
  campaignId: string,
  characterId: string,
) {
  return (
    !!permit &&
    permits.has(permit) &&
    permit.campaignId === campaignId &&
    permit.characterId === characterId &&
    !!repo.db
      .prepare(
        "SELECT 1 FROM ai_requests WHERE campaign_id=? AND id=? AND status='running'",
      )
      .get(campaignId, permit.requestId)
  );
}
export function actionScope(
  repo: SqliteCampaignRepository,
  campaignId: string,
  a: WorldIntent,
) {
  const e = worldScene(repo, campaignId),
    s = repo.get(campaignId)!.session;
  return rulingHash({
    scene: e
      ? { id: e.id, hex: e.sceneHex, location: e.sceneLocation, range: e.range }
      : null,
    clock: { date: s.campaign.date, quarter: s.campaign.quarter },
    actor: e?.combatants.find((v) => v.id === a.actorId),
    target: e?.combatants.find((v) => v.id === a.targetId),
    targetSheet: s.characters.find((v) => v.id === a.targetId)?.sheet,
    conditions: readConsequences(repo, campaignId)
      .filter(
        (c) =>
          c.characterIds.includes(a.actorId) ||
          (!!a.targetId && c.characterIds.includes(a.targetId)),
      )
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map((c) => ({
        id: c.id,
        status: c.status,
        resolution: c.state.resolution,
        deadline: c.state.deadline
          ? {
              unit: c.state.deadline.unit,
              value: c.state.deadline.value,
              elapsed: c.state.deadline.elapsed,
              clockReviewRequired: c.state.deadline.clockReviewRequired,
            }
          : null,
        access: c.state.sceneAccess,
      })),
    rules: repo.db
      .prepare(
        "SELECT id,revision FROM applicable_curated_rules WHERE campaign_id=? ORDER BY id",
      )
      .all(campaignId),
  });
}
export function routineRuling(
  repo: SqliteCampaignRepository,
  permit: AIWorkflowPermit | undefined,
  campaignId: string,
  characterId: string,
  sceneId: string,
  action: WorldIntent,
  originId: string,
) {
  if (
    !isAIWorkflow(repo, permit, campaignId, characterId) ||
    (!!process.env.RAVENLAND_AI_RULINGS &&
      process.env.RAVENLAND_AI_RULINGS !== "enabled") ||
    repo.db
      .prepare("SELECT routine_ai FROM gm_policy WHERE campaign_id=?")
      .get(campaignId)?.routine_ai === 0
  )
    return null;
  if (
    !["observe", "interact", "search"].includes(action.kind) ||
    (action.kind === "interact" &&
      !["speak", "signal"].includes(action.interaction ?? ""))
  )
    return null;
  const scope = {
    key: rulingHash({
      sceneId,
      kind: action.kind,
      actor: action.actorId,
      target: action.targetId,
      itemRef: action.itemRef,
      interaction: action.interaction,
    }),
    fingerprint: actionScope(repo, campaignId, action),
  };
  for (const old of rulings(repo, campaignId).filter(
    (r) =>
      r.domain === "routine_action" &&
      r.scope.key === scope.key &&
      r.status === "applied",
  )) {
    if (old.scope.fingerprint === scope.fingerprint) return old;
    rulingTransition(
      repo,
      old,
      "invalidated",
      "Relevant actor, target, scene, clock or rule facts changed.",
    );
  }
  return makeRuling(repo, {
    campaignId,
    sceneId,
    originId,
    domain: "routine_action",
    question:
      "Can this verified NPC perform the bounded " +
      action.kind +
      " operation?",
    facts: [
      "Authoritative present NPC " + action.actorId,
      "Target " + (action.targetId ?? "visible scene"),
      "Possession reference " + (action.itemRef ?? "none"),
      "No resources, roll result, player choice or precise elapsed time may be changed.",
    ],
    sources: ["encounter:" + sceneId],
    decision:
      "Permit this bounded noncombat operation within verified scene access.",
    reasoning: action.intent,
    scope,
    authority: action.kind === "search" ? "B" : "A",
    risk: action.kind === "search" ? "bounded" : "routine",
    decisionMaker: { kind: "ai_workflow", id: permit!.requestId },
    effects: [
      {
        type: "routine_action",
        actorId: action.actorId,
        targetId: action.targetId,
        kind: action.kind as "observe" | "interact" | "search",
        basis:
          action.kind === "search"
            ? "accessible_broken_target"
            : action.kind === "interact"
              ? "bounded_speech"
              : "visible_scene",
      },
    ],
    status: "accepted",
    resolutionTypes: [],
    blockingReason: "",
    requestId: permit!.requestId,
  });
}
