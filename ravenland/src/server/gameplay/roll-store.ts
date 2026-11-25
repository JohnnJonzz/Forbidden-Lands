import { randomUUID, createHash } from "node:crypto";
import type { SqliteCampaignRepository } from "../sqlite";
import { gameplayStateSchema } from "../../lib/gameplay";
import { rollRequestSchema, type RollRequest } from "../../lib/gameplay-rolls";
import { hasRollQueue } from "./upgrade";
import { derivePool } from "./roll-rules";
export const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function currentActivity(repo: SqliteCampaignRepository, id: string) {
  const row = repo.db
    .prepare(
      "SELECT a.state_json FROM phase7_activities a JOIN phase7_campaigns c ON c.current_activity_id=a.id WHERE c.campaign_id=?",
    )
    .get(id);
  return row
    ? gameplayStateSchema.parse(JSON.parse(String(row.state_json)))
    : null;
}
export function requests(repo: SqliteCampaignRepository, id: string) {
  if (!hasRollQueue(repo)) return [];
  return repo.db
    .prepare(
      "SELECT state_json FROM phase7_roll_requests WHERE campaign_id=? ORDER BY rowid",
    )
    .all(id)
    .map((r) => rollRequestSchema.parse(JSON.parse(String(r.state_json))));
}
export function putRequest(repo: SqliteCampaignRepository, r: RollRequest) {
  repo.db
    .prepare(
      "INSERT INTO phase7_roll_requests VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json",
    )
    .run(
      r.id,
      r.campaignId,
      r.activityId,
      JSON.stringify(rollRequestSchema.parse(r)),
    );
}
export function ensureRollQueue(repo: SqliteCampaignRepository, id: string) {
  if (!hasRollQueue(repo)) return;
  const a = currentActivity(repo, id);
  if (a?.status !== "planned") return;
  const s = repo.get(id)!.session,
    all = requests(repo, id);
  const own = !repo.db.isTransaction;
  if (own) repo.db.exec("BEGIN IMMEDIATE");
  try {
    for (const assignment of a.assignments) {
      if (
        ["Rest", "Sleep"].includes(assignment.activity) ||
        all.some(
          (r) =>
            r.activityId === a.id &&
            r.characterId === assignment.characterId &&
            r.dependencyId === null,
        )
      )
        continue;
      const now = new Date().toISOString(),
        r: RollRequest = {
          id: randomUUID(),
          campaignId: id,
          activityId: a.id,
          characterId: assignment.characterId,
          activity: assignment.activity,
          procedure:
            assignment.activity === "Make Camp"
              ? "camp"
              : assignment.activity === "Forage"
                ? "forage"
                : assignment.activity === "Keep Watch"
                  ? "watch"
                  : "unsupported",
          forageTarget: assignment.activity === "Forage" ? "food" : null,
          generation: 0,
          dependencyId: null,
          expression: null,
          modifiers: [],
          sources: [],
          pushEligible: false,
          artifactAllowed: false,
          talents: [],
          interventions:[],
      status: "awaiting_roll",
          savedRollId: null,
          savedRollRevision: null,
          raw: null,
          final: null,
          review: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          audit: [
            {
              operationId: randomUUID(),
              actorId: "deterministic-engine",
              action: "queue",
              reason: "Complete saved activity plan",
              at: now,
            },
          ],
        };
      try {
        Object.assign(r, derivePool(repo, id, s, r.characterId, r.activity));
      } catch (e) {
        r.status = "awaiting_mechanical_review";
        r.review =
          e instanceof Error ? e.message : "Source verification required.";
      }
      putRequest(repo, r);
    }
    if (own) repo.db.exec("COMMIT");
  } catch (e) {
    if (own && repo.db.isTransaction) repo.db.exec("ROLLBACK");
    throw e;
  }
}
export function correctionPreview(
  repo: SqliteCampaignRepository,
  r: RollRequest,
) {
  const all = requests(repo, r.campaignId),
    ids = new Set([r.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of all)
      if (q.dependencyId && ids.has(q.dependencyId) && !ids.has(q.id)) {
        ids.add(q.id);
        changed = true;
      }
  }
  const affected = all.filter(
    (q) => ids.has(q.id) && q.status !== "superseded",
  );
  return {
    hash: digest({
      affected,
      campaignRevision: repo.get(r.campaignId)!.revision,
    }),
    affectedIds: affected.map((q) => q.id),
    warning:
      "Supersede this binding and dependent procedures. Original saved dice and committed Push consequences remain. New rolls are required.",
  };
}
