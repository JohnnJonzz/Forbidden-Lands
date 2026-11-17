import { createHash } from "node:crypto";
import { rulingSchema, type GMRuling } from "../../lib/rulings/schema";
import type { SqliteCampaignRepository } from "../sqlite";
export const rulingHash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function rulings(repo: SqliteCampaignRepository, campaignId: string) {
  return repo.db
    .prepare(
      "SELECT state_json FROM gm_rulings WHERE campaign_id=? ORDER BY rowid",
    )
    .all(campaignId)
    .map((r) => rulingSchema.parse(JSON.parse(r.state_json as string)));
}
export function saveRuling(repo: SqliteCampaignRepository, r: GMRuling) {
  r.revision++;
  r.updatedAt = new Date().toISOString();
  r = rulingSchema.parse(r);
  repo.db
    .prepare(
      "INSERT INTO gm_rulings VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=excluded.revision,state_json=excluded.state_json,updated_at=excluded.updated_at",
    )
    .run(
      r.id,
      r.campaignId,
      r.sceneId,
      r.originId,
      r.domain,
      r.status,
      r.revision,
      JSON.stringify(r),
      r.updatedAt,
    );
  return r;
}
export const openRuling = (r: GMRuling) =>
  ["proposed", "accepted", "awaiting_review"].includes(r.status);
export function holdFor(
  repo: SqliteCampaignRepository,
  campaignId: string,
  consequenceId: string,
) {
  return rulings(repo, campaignId).find(
    (r) => r.consequenceId === consequenceId && openRuling(r),
  );
}
export function makeRuling(
  repo: SqliteCampaignRepository,
  input: Pick<
    GMRuling,
    "campaignId" | "sceneId" | "originId" | "domain" | "question"
  > &
    Partial<GMRuling>,
) {
  const id = rulingHash([
      "gm-ruling",
      input.campaignId,
      input.originId,
      input.domain,
      input.scope?.key ?? "",
    ]),
    prior = rulings(repo, input.campaignId).find((r) => r.id === id);
  if (prior) return prior;
  const now = new Date().toISOString();
  return saveRuling(repo, {
    id,
    campaignId: input.campaignId,
    sceneId: input.sceneId,
    originId: input.originId,
    consequenceId: input.consequenceId ?? null,
    domain: input.domain,
    question: input.question,
    facts: [],
    sources: [],
    decision: null,
    reasoning: "",
    scope: { key: input.originId, fingerprint: rulingHash(input.originId) },
    authority: "C",
    decisionMaker: { kind: "deterministic", id: "application-validator" },
    effects: [],
    risk: "protected",
    status: "awaiting_review",
    blockingReason: input.question,
    resolutionTypes: [],
    requestId: null,
    receiptId: null,
    revision: 0,
    history: [
      {
        status: input.status ?? "awaiting_review",
        at: now,
        reason: input.question,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...(input as Partial<GMRuling>),
  });
}
export function rulingTransition(
  repo: SqliteCampaignRepository,
  r: GMRuling,
  status: GMRuling["status"],
  reason: string,
) {
  r.status = status;
  r.history.push({ status, at: new Date().toISOString(), reason });
  return saveRuling(repo, r);
}
export function ruleScopeFingerprint(
  repo: SqliteCampaignRepository,
  campaignId: string,
  consequenceId: string,
) {
  const c = repo.db
    .prepare(
      "SELECT state_json FROM campaign_consequences WHERE campaign_id=? AND id=?",
    )
    .get(campaignId, consequenceId);
  const rules = repo.db
    .prepare(
      "SELECT id,revision,override_scope,body FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule' ORDER BY id",
    )
    .all(campaignId);
  return rulingHash({
    source: c ? JSON.parse(c.state_json as string).source : null,
    rules,
  });
}
export function healingOverride(
  repo: SqliteCampaignRepository,
  campaignId: string,
  consequenceId: string | undefined,
  ruleId: string,
  revision: number,
) {
  if (!consequenceId) return false;
  return rulings(repo, campaignId).some(
    (r) =>
      r.status === "applied" &&
      r.domain === "healing_rule" &&
      r.consequenceId === consequenceId &&
      r.scope.fingerprint ===
        ruleScopeFingerprint(repo, campaignId, consequenceId) &&
      r.effects.some(
        (e) =>
          e.type === "healing_rule" &&
          e.rules.some((v) => v.id === ruleId && v.revision === revision),
      ),
  );
}
