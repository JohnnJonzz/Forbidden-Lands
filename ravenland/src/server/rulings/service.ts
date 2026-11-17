import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { requireCharacterAccess } from "../character-access";
import { requireController } from "../mutation-authority";
import { AIError } from "../ai/config";
import { rulingCommandSchema, type GMRuling } from "../../lib/rulings/schema";
import {
  rulings,
  openRuling,
  saveRuling,
  rulingTransition,
  rulingHash,
  ruleScopeFingerprint,
} from "./store";
import {
  readConsequences,
  visibleConsequence,
  saveConsequence,
} from "../consequences/store";
import { worldState, worldContext } from "../world/context";
import { dispatchWorldAction } from "../world/dispatcher";
import { reviewedRulingPermit } from "./review-permit";
import { executeConsequence } from "../consequences/service";
import { advanceTime } from "../time/service";
import { treatmentRules } from "../consequences/rules";
export function currentRulingScope(
  repo: SqliteCampaignRepository,
  r: GMRuling,
) {
  if (r.domain === "healing_rule")
    return ruleScopeFingerprint(repo, r.campaignId, r.consequenceId!);
  if (r.domain === "duration") return worldState(repo, r.campaignId);
  const c = readConsequences(repo, r.campaignId).find(
    (v) => v.id === r.consequenceId,
  );
  return rulingHash({
    source: c?.source,
    state: c?.state,
    domain: r.domain,
    origin: r.originId,
  });
}
export function rulingContext(
  repo: SqliteCampaignRepository,
  campaignId: string,
  principal: CharacterPrincipal | null,
) {
  const visible = new Set(
    readConsequences(repo, campaignId)
      .filter(
        (c) =>
          visibleConsequence(c, principal) ||
          principal?.mode === "trusted-local",
      )
      .map((c) => c.id),
  );
  return rulings(repo, campaignId)
    .filter((r) => !r.consequenceId || visible.has(r.consequenceId))
    .map((r) => ({
      id: r.id,
      domain: r.domain,
      sceneId: r.sceneId,
      originId: r.originId,
      consequenceId: r.consequenceId,
      question: r.question,
      status: r.status,
      authority: r.authority,
      risk: r.risk,
      blockingReason: r.blockingReason,
      resolutionTypes: r.resolutionTypes,
      revision: r.revision,
      expectedScope: currentRulingScope(repo, r),
      ...(principal?.mode === "trusted-local"
        ? {
            facts: r.facts,
            sources: r.sources,
            effects: r.effects,
            reasoning: r.reasoning,
            history: r.history,
            resolutionInput: {
              consequenceId: r.consequenceId,
              pendingId: r.originId,
              unit:
                readConsequences(repo, campaignId).find(
                  (v) => v.id === r.consequenceId,
                )?.state.deadline?.unit ?? "rounds",
              rules:
                r.domain === "healing_rule"
                  ? repo.db
                      .prepare(
                        "SELECT id,revision,title,override_scope FROM curated_rules WHERE campaign_id=?",
                      )
                      .all(campaignId)
                      .filter((v) => r.sources.includes(String(v.id)))
                  : [],
              healers: [
                ...repo
                  .get(campaignId)!
                  .session.characters.map((c) => ({ id: c.id, name: c.name })),
                ...(worldContext(repo, campaignId, principal)?.actors ?? []),
              ],
            },
          }
        : {}),
      decisionMaker: r.decisionMaker,
    }));
}
export function resolveRuling(
  raw: unknown,
  repo: SqliteCampaignRepository,
  principal: CharacterPrincipal | null,
) {
  const c = rulingCommandSchema.parse(raw);
  requireCharacterAccess(principal, c.campaignId, c.characterId);
  const maker = requireController(principal, c.campaignId),
    hash = rulingHash(c),
    db = repo.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    const receiptId = "ruling:" + c.requestId,
      saved = db
        .prepare(
          "SELECT fingerprint,result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?",
        )
        .get(c.campaignId, receiptId);
    if (saved) {
      if (saved.fingerprint !== hash)
        throw new AIError(
          "ruling_duplicate",
          "Ruling request reused with different inputs.",
          409,
        );
      db.exec("COMMIT");
      return { ...JSON.parse(saved.result_json as string), replayed: true };
    }
    const r = rulings(repo, c.campaignId).find((v) => v.id === c.rulingId);
    if (!r || !openRuling(r))
      throw new AIError(
        "ruling_missing",
        "This ruling is missing or already decided.",
        409,
      );
    if (
      r.revision !== c.revision ||
      currentRulingScope(repo, r) !== c.expectedScope
    )
      throw new AIError(
        "ruling_stale",
        "The question or supporting facts changed. Review the current ruling before deciding.",
        409,
      );
    if (c.decision === "reject") {
      if (
        ["healing_rule", "rules_conflict", "time_conversion"].includes(r.domain)
      )
        throw new AIError(
          "ruling_protected_hold",
          "This required mechanical hold must be resolved by matching evidence or a typed decision; rejecting a question cannot erase it.",
          409,
        );
      if (!r.consequenceId && ["duration", "item_transfer"].includes(r.domain))
        dispatchWorldAction(
          {
            type: "adjudicate",
            campaignId: c.campaignId,
            characterId: c.characterId,
            requestId: c.requestId,
            pendingId: r.originId,
            expectedState: worldState(repo, c.campaignId),
            decision: "decline",
            duration: null,
            reason: c.reason,
            confirmed: true,
          },
          repo,
          principal,
        );
      rulingTransition(repo, r, "rejected", c.reason);
    } else {
      const e = c.effect;
      if (!e || !r.resolutionTypes.includes(e.type) || e.type !== r.domain)
        throw new AIError(
          "ruling_effect",
          "This decision does not resolve the actual question. No effects were applied.",
          409,
        );
      if ("consequenceId" in e && e.consequenceId !== r.consequenceId)
        throw new AIError(
          "ruling_scope",
          "This effect names a different consequence.",
          409,
        );
      r.decision = c.reason;
      r.reasoning = c.reason;
      r.decisionMaker = maker;
      r.effects = [e];
      r.requestId = c.requestId;
      r.scope.fingerprint = c.expectedScope;
      rulingTransition(repo, r, "accepted", c.reason);
      if (e.type === "healing_rule") {
        const actual = repo.db
          .prepare(
            "SELECT id,revision FROM curated_rules WHERE campaign_id=? AND document_type='House Rule' AND override_scope<>''",
          )
          .all(c.campaignId);
        if (
          e.rules.some(
            (v) =>
              !actual.some(
                (a) => a.id === v.id && Number(a.revision) === v.revision,
              ),
          ) ||
          !e.rules.length ||
          e.rules.length !== r.sources.length ||
          e.rules.some((v) => !r.sources.includes(v.id))
        )
          throw new AIError(
            "ruling_rule_stale",
            "Select the actual current house-rule IDs and revisions.",
            409,
          );
        // Scope authorizes using the verified official procedure for this injury only;
        // it never changes a saved roll, injury, deadline or the house-rule document.
        // Verify the procedure before committing the interpretation. The temporary
        // applied state is transaction-local and rolls back if evidence is missing.
        rulingTransition(repo, r, "applied", c.reason);
        const verified = treatmentRules(repo, c.campaignId, r.consequenceId!);
        r.sources = [...new Set([...r.sources, ...verified.sources.map(s => `${s.documentId}:${s.page}`)])];
      } else if (e.type === "duration") {
        if (e.pendingId !== r.originId)
          throw new AIError(
            "ruling_scope",
            "Duration decision belongs to a different pending action.",
            409,
          );
        const event = dispatchWorldAction(
          {
            type: "adjudicate",
            campaignId: c.campaignId,
            characterId: c.characterId,
            requestId: c.requestId,
            pendingId: e.pendingId,
            expectedState: worldState(repo, c.campaignId),
            decision: "approve",
            duration: { unit: e.unit, amount: e.amount },
            reason: c.reason,
            confirmed: true,
          },
          repo,
          principal,
          undefined,
          undefined,
          reviewedRulingPermit(
            repo,
            principal,
            c.campaignId,
            e.pendingId,
            worldState(repo, c.campaignId),
            r.id,
          ),
        );
        Object.assign(r,rulings(repo,c.campaignId).find(v=>v.id===r.id)!);
        if (event.status !== "completed") {
          r.blockingReason = event.summary;
          rulingTransition(repo, r, "awaiting_review", event.summary);
          const result = {
            rulingId: r.id,
            status: r.status,
            code: event.code,
            summary: event.summary,
            replayed: false,
          };
          db.prepare("INSERT INTO consequence_commands VALUES (?,?,?,?,?)").run(
            c.campaignId,
            receiptId,
            hash,
            JSON.stringify(result),
            new Date().toISOString(),
          );
          db.exec("COMMIT");
          return result;
        }
      } else if (e.type === "scene_access")
        executeConsequence(
          {
            type: "scene_access",
            campaignId: c.campaignId,
            characterId: c.characterId,
            requestId: c.requestId,
            consequenceId: e.consequenceId,
            healerId: e.healerId,
            reason: c.reason,
            confirmed: true,
          },
          repo,
          principal,
        );
      else if (e.type === "time_conversion") {
        if (e.timeEventId !== r.originId)
          throw new AIError(
            "ruling_scope",
            "Choose the actual unresolved time event.",
            409,
          );
        const source = db
          .prepare(
            "SELECT result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?",
          )
          .get(c.campaignId, e.timeEventId);
        if (!source || !JSON.parse(source.result_json as string).timeEvent)
          throw new AIError(
            "ruling_time",
            "The original time event is unavailable.",
            409,
          );
        const patient = readConsequences(repo, c.campaignId).find(
          (v) => v.id === e.consequenceId,
        )!;
        if (patient.state.deadline?.unit !== e.unit)
          throw new AIError(
            "ruling_time_unit",
            "Use the deadline’s own recorded unit.",
            409,
          );
        // The accepted question is excluded from the time hold gate during its own resolution.
        rulingTransition(repo, r, "applied", c.reason);
        advanceTime(repo, {
          campaignId: c.campaignId,
          eventId: "conversion:" + r.id,
          sceneId: r.sceneId!,
          unit: e.unit,
          amount: e.amount,
          source: e.timeEventId,
          authority: maker,
          reason: c.reason,
          reconcile: true,
          onlyDeadlineId: e.consequenceId,
        });
      } else if (e.type !== "consequence_review")
        throw new AIError(
          "ruling_unsupported",
          "This mechanical effect has no safe adapter.",
          409,
        );
      r.receiptId = receiptId;
      r.blockingReason = "";
      if (r.status === "applied") saveRuling(repo, r);
      else rulingTransition(repo, r, "applied", c.reason);
    }
    // Recompute the source workflow on its next ordinary synchronization; do not
    // mark the injury resolved or erase its roll/deadline while clearing a question.
    const result = { rulingId: r.id, status: r.status, replayed: false };
    db.prepare("INSERT INTO consequence_commands VALUES (?,?,?,?,?)").run(
      c.campaignId,
      receiptId,
      hash,
      JSON.stringify(result),
      new Date().toISOString(),
    );
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
