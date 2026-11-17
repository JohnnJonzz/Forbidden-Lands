import { z } from "zod";
import type { SqliteCampaignRepository } from "../sqlite";
import { readConsequences, saveConsequence } from "../consequences/store";
import { nextConsequenceStep } from "../consequences/registry";
import { treatmentRules } from "../consequences/rules";
import { makeRuling, rulingHash, holdFor, rulings, rulingTransition } from "../rulings/store";
import { AIError } from "../ai/config";
const inputSchema = z
  .object({
    campaignId: z.string().uuid(),
    eventId: z.string().min(1).max(160),
    sceneId: z.string().min(1).max(160),
    unit: z.enum([
      "rounds",
      "minutes",
      "hours",
      "days",
      "quarter_days",
      "clock_review",
    ]),
    amount: z.number().int().min(0).max(10000),
    source: z.string().min(1).max(160),
    authority: z
      .object({
        kind: z.enum(["human_controller", "deterministic", "ai_workflow"]),
        id: z.string().min(1).max(160),
      })
      .strict(),
    reason: z.string().min(1).max(1600),
    toRound: z.number().int().nonnegative().optional(),
    reconcile: z.boolean().optional(),
    onlyDeadlineId: z.string().min(1).max(160).optional(),
    includeResolvedIds: z.array(z.string()).optional(),
  })
  .strict();
export type TimeInput = z.infer<typeof inputSchema>;
export function advanceTime(repo: SqliteCampaignRepository, raw: TimeInput) {
  const c = inputSchema.parse(raw),
    own = !repo.db.isTransaction;
  if (own) repo.db.exec("BEGIN IMMEDIATE");
  try {
    const id = "time:" + c.eventId,
      hash = rulingHash(c),
      saved = repo.db
        .prepare(
          "SELECT fingerprint,result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?",
        )
        .get(c.campaignId, id);
    if (saved) {
      if (saved.fingerprint !== hash)
        throw new AIError(
          "time_duplicate",
          "Time event reused with different inputs.",
          409,
        );
      if (own) repo.db.exec("COMMIT");
      return {
        ...JSON.parse(saved.result_json as string).timeEvent,
        replayed: true,
      };
    }
    if (c.authority.kind === "ai_workflow" && c.amount > 0)
      throw new AIError(
        "time_authority",
        "AI discretion cannot establish precise elapsed time or expire a lethal deadline without a supported adapter.",
        403,
      );
    const row = repo.db
      .prepare(
        "SELECT state_json FROM combat_encounters WHERE campaign_id=? AND id=?",
      )
      .get(c.campaignId, c.sceneId);
    if (
      !row &&
      !(
        c.sceneId === "campaign:" + c.campaignId &&
        c.authority.kind === "deterministic"
      )
    )
      throw new AIError(
        "time_scene",
        "Choose an authoritative scene clock.",
        409,
      );
    const scene = row
      ? JSON.parse(row.state_json as string)
      : { round: 0, status: "calendar" };
    if (c.toRound !== undefined && c.toRound > scene.round)
      throw new AIError(
        "time_source_round",
        "The source encounter has not recorded that round.",
        409,
      );
    if (
      scene.status === "active" &&
      c.unit === "rounds" &&
      c.authority.kind === "human_controller" &&
      c.toRound === undefined &&
      c.amount > 0
    )
      throw new AIError(
        "time_combat_owner",
        "Active combat owns round progression. Resolve the actual combat step rather than charging the same round manually.",
        409,
      );
    const affected: {
        id: string;
        before: number;
        after: number;
        deadlineValue: number | null;
        unit: string;
        resolution: string | null;
      }[] = [],
      requirements: string[] = [];
    const candidates = readConsequences(repo, c.campaignId).filter(
      (v) =>
        v.source.encounterId === c.sceneId &&
        (!c.onlyDeadlineId || v.id === c.onlyDeadlineId) &&
        v.state.deadline &&
        (!["resolved", "superseded"].includes(v.status) ||
          (c.includeResolvedIds?.includes(v.id) &&
            v.state.resolution === "survived_critical")),
    );
    for (const v of candidates) {
      const d = v.state.deadline!;
      if (c.amount === 0 && c.unit !== d.unit && c.unit !== "clock_review")
        continue;
      if ((c.unit !== d.unit && c.amount > 0) || c.unit === "clock_review") {
        const r = makeRuling(repo, {
          campaignId: c.campaignId,
          sceneId: c.sceneId,
          originId: id,
          consequenceId: v.id,
          domain: "time_conversion",
          question:
            "Establish the actual elapsed " +
            d.unit +
            " for " +
            c.unit +
            " event " +
            c.eventId +
            ". No conversion was assumed.",
          facts: [
            "Source clock: " + c.sceneId,
            "Event amount: " + c.amount + " " + c.unit,
          ],
          sources: [c.source],
          scope: {
            key: v.id,
            fingerprint: rulingHash({ scene: c.sceneId, deadline: d }),
          },
          resolutionTypes: ["time_conversion"],
          blockingReason: "No verified conversion for this deadline clock.",
        });
        requirements.push(r.id);
        d.clockReviewRequired = true;
        v.status = "awaiting_adjudication";
        v.nextProcedure = r.question;
        saveConsequence(repo, v);
        continue;
      }
      if (c.amount === 0 && !c.reconcile) continue;

      const hold = holdFor(repo, c.campaignId, v.id);
      if (
        hold &&
        c.authority.kind !== "deterministic" &&
        !["time_conversion", "duration"].includes(hold.domain)
      )
        throw new AIError(
          "time_hold",
          "Resolve the protected ruling for this clock before advancing it: " +
            hold.question,
          409,
        );
      if (d.clockReviewRequired && !c.reconcile)
        throw new AIError(
          "time_review",
          "Reconcile this clock before recording additional elapsed time.",
          409,
        );
      if (c.amount > 0) treatmentRules(repo, c.campaignId, v.id);
      const amount =
        c.toRound === undefined
          ? c.amount
          : Math.max(0, c.toRound - d.observedRound);
      const before = d.elapsed;
      d.elapsed += amount;
      if (c.toRound !== undefined)
        d.observedRound = Math.max(d.observedRound, c.toRound);
      if (c.reconcile) {
        const clock = repo.get(c.campaignId)!.session.campaign;
        d.clockDate = clock.date;
        d.clockQuarter = clock.quarter;
        d.clockReviewRequired = false;
      }
      v.state.notes.push(
        "Verified time event " +
          id +
          ": " +
          amount +
          " " +
          c.unit +
          " · " +
          c.reason,
      );
      nextConsequenceStep(v);
      saveConsequence(repo, v);
      if(v.state.resolution==='death_verified')for(const r of rulings(repo,c.campaignId).filter(r=>r.consequenceId===v.id&&['proposed','accepted','awaiting_review'].includes(r.status)))rulingTransition(repo,r,'invalidated','Verified source-backed deadline expiry in '+id+' establishes the current fate.');
      affected.push({
        id: v.id,
        before,
        after: d.elapsed,
        deadlineValue: d.value,
        unit: d.unit,
        resolution: v.state.resolution,
      });
    }
    const event = {
      id,
      campaignId: c.campaignId,
      sceneId: c.sceneId,
      unit: c.unit,
      amount:
        c.toRound === undefined
          ? c.amount
          : Math.max(0, ...affected.map((v) => v.after - v.before)),
      observedToRound: c.toRound ?? null,
      source: c.source,
      decisionMaker: c.authority,
      affected,
      requirements,
      beforeAfter: affected,
      reason: c.reason,
      at: new Date().toISOString(),
      replayed: false,
    };
    repo.db
      .prepare("INSERT INTO consequence_commands VALUES (?,?,?,?,?)")
      .run(
        c.campaignId,
        id,
        hash,
        JSON.stringify({ timeEvent: event }),
        event.at,
      );
    if (own) repo.db.exec("COMMIT");
    return event;
  } catch (error) {
    if (own) repo.db.exec("ROLLBACK");
    throw error;
  }
}
// Calendar movement records its own scale. No round/hour conversion is guessed.
export function observeClockChange(
  repo: SqliteCampaignRepository,
  campaignId: string,
  before: { date: string; quarter: string; hex: string; location: string },
  after: { date: string; quarter: string },
  eventId: string,
  knownQuarters?: number,
) {
  if (before.date === after.date && before.quarter === after.quarter) return;
  const scene = repo.db
    .prepare(
      "SELECT id FROM combat_encounters WHERE campaign_id=? AND json_extract(state_json,'$.sceneHex')=? AND json_extract(state_json,'$.sceneLocation')=? ORDER BY updated_at DESC,rowid DESC LIMIT 1",
    )
    .get(campaignId, before.hex, before.location);
  advanceTime(repo, {
    campaignId,
    eventId,
    sceneId: scene ? (scene.id as string) : "campaign:" + campaignId,
    unit: knownQuarters === undefined ? "clock_review" : "quarter_days",
    amount: knownQuarters ?? 0,
    source: "campaign-clock:" + eventId,
    authority: { kind: "deterministic", id: "campaign-clock-adapter" },
    reason:
      "Verified campaign clock changed from " +
      before.date +
      " " +
      before.quarter +
      " to " +
      after.date +
      " " +
      after.quarter +
      ". No finer time conversion was assumed.",
  });
}
