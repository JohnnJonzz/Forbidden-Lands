import {
  healingOverride,
  makeRuling,
  ruleScopeFingerprint,
  rulings,
  rulingTransition,
} from "../rulings/store";
import type { SourcePassage } from "../../lib/sourcebooks/schema";
import { citation, loadCombatRules } from "../combat/sources";
import { injuryRow } from "../combat/player-critical";
import type { SqliteCampaignRepository } from "../sqlite";
import { AIError } from "../ai/config";
export function injuryObligation(
  pages: SourcePassage[],
  table: string,
  value: number,
) {
  const row = injuryRow(pages, table, value);
  if (!row) return null;
  const text = row.text.replace(/−/g, "-"),
    lethal = /\bYes\b/.test(text);
  if (!lethal) return { lethal: false, row, deadline: null };
  const match = text.match(
    /\bYes(?:,\s*(-\s*\d+))?\s+(?:(\d*)D6)\s+(rounds|hours|days)\b/i,
  );
  return {
    lethal: true,
    row,
    deadline: match
      ? {
          modifier: Number((match[1] ?? "0").replace(/\s/g, "")),
          dice: Number(match[2] || 1),
          unit: match[3].toLowerCase() as "rounds" | "hours" | "days",
        }
      : null,
  };
}
export function consequenceRulePages(
  repo: SqliteCampaignRepository,
  campaignId: string,
  consequenceId?: string,
) {
  const overrides = repo.db
    .prepare(
      "SELECT id,revision,override_scope FROM curated_rules WHERE campaign_id=? AND document_type='House Rule' AND override_scope<>''",
    )
    .all(campaignId);
  const conflicting = overrides.filter(
    (r) =>
      /healing|treat|critical|injur|lethal|death|recovery|deadline/i.test(
        r.override_scope as string,
      ) &&
      !healingOverride(
        repo,
        campaignId,
        consequenceId,
        r.id as string,
        Number(r.revision),
      ),
  );
  if (consequenceId) {
    const fingerprint = ruleScopeFingerprint(repo, campaignId, consequenceId);
    for (const old of rulings(repo, campaignId).filter(
      (r) =>
        r.domain === "healing_rule" &&
        r.consequenceId === consequenceId &&
        ["awaiting_review", "proposed", "accepted", "applied"].includes(
          r.status,
        ),
    )) {
      if (
        old.scope.fingerprint !== fingerprint ||
        (!conflicting.length && old.status !== "applied")
      )
        rulingTransition(
          repo,
          old,
          "invalidated",
          "Verified house-rule revisions, applicability or authorized scope changed.",
        );
    }
  }
  if (conflicting.length) {
    if (consequenceId) {
      const row = repo.db
          .prepare(
            "SELECT state_json FROM campaign_consequences WHERE campaign_id=? AND id=?",
          )
          .get(campaignId, consequenceId),
        c = row ? JSON.parse(row.state_json as string) : null;
      makeRuling(repo, {
        campaignId,
        sceneId: c?.source.encounterId ?? null,
        originId:
          consequenceId +
          ":" +
          ruleScopeFingerprint(repo, campaignId, consequenceId),
        consequenceId,
        domain: "healing_rule",
        question:
          "Interpret or explicitly override the scoped Healing house rule for this injury.",
        facts: conflicting.map(
          (r) => "House rule " + r.id + " revision " + r.revision,
        ),
        sources: conflicting.map((r) => String(r.id)),
        scope: {
          key: consequenceId,
          fingerprint: ruleScopeFingerprint(repo, campaignId, consequenceId),
        },
        resolutionTypes: ["healing_rule"],
        blockingReason:
          "An official procedure cannot silently override an applicable house rule.",
      });
    }
    throw new AIError(
      "consequence_house_rule",
      "An applicable consequence or Healing house rule requires explicit adjudication. Official mechanics will not silently override it.",
      409,
    );
  }
  return loadCombatRules(repo, campaignId).handbook;
}
export function treatmentRules(
  repo: SqliteCampaignRepository,
  campaignId: string,
  consequenceId?: string,
) {
  const pages = consequenceRulePages(repo, campaignId, consequenceId),
    clean = (p: SourcePassage) =>
      p.text.replace(/-\s+/g, "").replace(/\s+/g, " ");
  const death = pages.find(
    (p) =>
      /If your critical injury is listed as LETHAL.*successful HEALING roll.*time indicated has passed/i.test(
        clean(p),
      ) &&
      /Each person trying to HEAL you can only roll once/i.test(clean(p)) &&
      /yourself.*[–−-]2 penalty/i.test(clean(p)),
  );
  const healing = pages.find(
    (p) =>
      /HEALING \(EMPATHY\)/.test(clean(p)) && /slow action/i.test(clean(p)),
  );
  const recovery = pages.find((p) =>
    /slow action, but cannot be performed with an enemy at ARM.S LENGTH/i.test(
      clean(p),
    ),
  );
  const untrained = pages.find((p) =>
    /ROLLS WITHOUT SKILL.*simply roll your Base Dice and any applicable Gear Dice/i.test(
      clean(p),
    ),
  );
  if (!death || !healing || !recovery || !untrained)
    throw new AIError(
      "consequence_rules",
      "The official Healing, attempt limits, self-treatment, action or untrained-skill evidence is incomplete. Restore the Handbook or request adjudication; no result was assumed.",
      409,
    );
  return {
    pages,
    sources: [death, healing, recovery, untrained].map(citation),
  };
}
