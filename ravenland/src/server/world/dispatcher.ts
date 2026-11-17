import { secureDie, type Die } from "../combat/engine";
import { randomUUID } from "node:crypto";
import type { CombatSource } from "../../lib/combat/types";
import type { SqliteCampaignRepository } from "../sqlite";
import {
  requireCharacterAccess,
  type CharacterPrincipal,
} from "../character-access";
import {
  worldCommandSchema,
  type WorldEvent,
  type Duration,
} from "../../lib/world/schema";
import {
  worldContext,
  worldState,
  worldEvents,
  worldHash,
  worldScene,
} from "./context";
import { activeCombat } from "../combat/store";
import {
  readConsequences,
  saveConsequence,
  visibleConsequence,
} from "../consequences/store";
import { nextConsequenceStep } from "../consequences/registry";
import { treatmentRules } from "../consequences/rules";
import { executeConsequence } from "../consequences/service";
import { AIError } from "../ai/config";
function controller(p: CharacterPrincipal | null) {
  if (p?.mode !== "trusted-local")
    throw new AIError(
      "world_controller",
      "World duration and historical reconciliation require the trusted local controller; no hosted GM role is configured.",
      403,
    );
}
export function dispatchWorldAction(
  raw: unknown,
  repo: SqliteCampaignRepository,
  principal: CharacterPrincipal | null,
  die: Die = secureDie,
): WorldEvent {
  const c = worldCommandSchema.parse(raw);
  requireCharacterAccess(principal, c.campaignId, c.characterId);
  const db = repo.db,
    hash = worldHash(c);
  db.exec("BEGIN IMMEDIATE");
  try {
    const old = db
      .prepare(
        "SELECT fingerprint,result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?",
      )
      .get(c.campaignId, c.requestId);
    if (old) {
      if (old.fingerprint !== hash)
        throw new AIError(
          "world_duplicate",
          "World request ID reused with different inputs.",
          409,
        );
      const event = JSON.parse(old.result_json as string).worldEvent;
      if (!event)
        throw new AIError(
          "world_duplicate",
          "This request belongs to another procedure.",
          409,
        );
      db.exec("COMMIT");
      return { ...event, replayed: true };
    }
    const context = worldContext(repo, c.campaignId, principal),
      e = worldScene(repo, c.campaignId);
    if (!context || !e || activeCombat(repo, c.campaignId))
      throw new AIError(
        "world_scene",
        "World actions require the current concluded scene. Use the combat dispatcher during initiative.",
        409,
      );
    if (c.expectedState !== worldState(repo, c.campaignId))
      throw new AIError(
        "world_stale",
        "The scene, possessions, consequences or clock changed. Review the current situation before retrying a new action.",
        409,
      );
    const event: WorldEvent = {
      requestId: c.requestId,
      campaignId: c.campaignId,
      sceneId: e.id,
      state: c.expectedState,
      actorId: null,
      targetId: null,
      intent: null,
      status: "blocked",
      code: "unsupported",
      summary: "No world action occurred.",
      elapsed: null,
      linkedConsequences: [],
      evidence: [
        "encounter:" + e.id,
        ...(e.setupProposalId ? ["setup:" + e.setupProposalId] : []),
      ],
      affectedPossessions: [],
      createdAt: new Date().toISOString(),
    };
    const outcome = (
      status: WorldEvent["status"],
      code: string,
      summary: string,
    ) => Object.assign(event, { status, code, summary });
    if (c.type === "reconcile") {
      controller(principal);
      if (c.sceneId !== e.id)
        throw new AIError(
          "world_scene",
          "Reconcile only the current source scene.",
          409,
        );
      outcome(
        "completed",
        "historical_reconciled",
        "Historical narration remains unverified. No past search, theft, elapsed time, rescue or death was replayed. The next action starts from saved state.",
      );
      event.evidence = [c.requestId + ": " + c.reason, ...event.evidence];
    } else {
      let action = c.type === "propose" ? c.action : null,
        duration: Duration | null = null,
        approved = false;
      if (c.type === "adjudicate") {
        controller(principal);
        const prior = worldEvents(repo, c.campaignId).find(
          (v) => v.requestId === c.pendingId,
        );
        if (
          !prior ||
          prior.sceneId !== e.id ||
          prior.status !== "awaiting_adjudication" ||
          worldEvents(repo, c.campaignId).some(
            (v) => v.pendingId === prior.requestId,
          )
        )
          throw new AIError(
            "world_pending",
            "This proposal is missing or has already been adjudicated.",
            409,
          );
        if (c.decision === "approve" && prior.state !== c.expectedState)
          throw new AIError(
            "world_stale",
            "The proposed action is stale. Decline it and propose a new action against the current scene.",
            409,
          );
        event.pendingId = prior.requestId;
        action = prior.intent;
        duration = c.duration;
        approved = c.decision === "approve";
        event.evidence = [c.requestId + ": " + c.reason, ...event.evidence];
        if (!approved)
          outcome(
            "blocked",
            "declined",
            "The proposed NPC action was declined; no action or time was recorded.",
          );
      }
      if (action && (c.type === "propose" || approved)) {
        event.intent = action;
        event.actorId = action.actorId;
        event.targetId = action.targetId;
        const actor = context.actors.find((a) => a.id === action!.actorId),
          target = context.targets.find((t) => t.id === action!.targetId);
        const linked = readConsequences(repo, c.campaignId).filter(
          (v) =>
            v.source.encounterId === e.id &&
            !["resolved", "superseded"].includes(v.status),
        );
        event.linkedConsequences = linked
          .filter((v) => visibleConsequence(v, principal))
          .map((v) => v.id);
        if (c.type === "propose" && c.sceneId !== e.id)
          outcome(
            "blocked",
            "scene_reference",
            "The requested scene is unavailable.",
          );
        else if (!actor)
          outcome(
            "blocked",
            "actor_authority",
            "Only an actual present, capable encounter NPC under GM control may act. Player characters and absent companions are not GM actors.",
          );
        else if (action.targetId && !target)
          outcome(
            "blocked",
            "target_access",
            "The target is not established as present and accessible in this scene.",
          );
        else if (context.reconciliationRequired)
          outcome(
            "blocked",
            "historical_review",
            "Reconcile historical narration first. No past NPC action or elapsed round was accepted or replayed.",
          );
        else if (c.type === "propose" && context.pending)
          outcome(
            "blocked",
            "pending_decision",
            "Resolve the existing world-action adjudication before another NPC action.",
          );
        else if (
          linked.some((v) =>
            v.state.attempts.some((a) => a.status === "prepared"),
          )
        )
          outcome(
            "awaiting_player_input",
            "pending_roll",
            "An authorized treatment roll is pending. Resolve it before world progression.",
          );
        else if (
          !context.establishedDeclaration &&
          ["search", "transfer", "move", "assist"].includes(action.kind)
        )
          outcome(
            "awaiting_adjudication",
            "motivation_required",
            "The NPC motivation and relevant circumstances lack an authoritative scene reference. Establish them before resolving this action.",
          );
        else if (action.kind === "transfer") {
          const item = context.possessions.find(
            (i) => i.ref === action.itemRef && i.ownerId === action.targetId,
          );
          outcome(
            "awaiting_adjudication",
            item ? "transfer_unsupported" : "possession_unverified",
            item
              ? "The specific possession exists, but verified NPC custody, accessibility and safe item transfer are not supported by the current sheet model. No possession was removed."
              : "The specified possession is not verified in authorized inventory. No item, quantity or theft was invented.",
          );
        } else if (
          action.kind === "search" &&
          (!target || !target.broken || context.range !== "Arm")
        )
          outcome(
            "awaiting_adjudication",
            "search_access",
            "Search requires verified close access and resolved resistance. No search or inventory change occurred.",
          );
        else if (
          action.kind === "assist" &&
          (!target ||
            !linked.some(
              (v) =>
                v.category === "lethal_injury" &&
                v.characterIds.includes(target.id),
            ))
        )
          outcome(
            "awaiting_adjudication",
            "assistance_procedure",
            "No supported linked treatment procedure is available for this target. No healer, resource or recovery was invented.",
          );
        else if (action.kind === "interact" && !action.interaction)
          outcome(
            "awaiting_adjudication",
            "interaction_unsupported",
            "Choose a bounded speech or signal interaction. No agreement, restraint, hazard or player decision can be resolved here.",
          );
        else if (action.kind === "move" && !action.destination)
          outcome(
            "awaiting_adjudication",
            "movement_destination",
            "Choose a local move to Near or departure. Travel and arbitrary destinations require their existing procedures.",
          );
        else if (
          worldEvents(repo, c.campaignId).some(
            (v) =>
              v.sceneId === e.id &&
              v.status === "completed" &&
              v.intent?.kind === action.kind &&
              v.actorId === action.actorId &&
              v.targetId === action.targetId &&
              v.intent?.destination === action.destination &&
              action.kind !== "advance_time" &&
              action.kind !== "interact",
          )
        )
          outcome(
            "blocked",
            "already_completed",
            "This NPC action has already been recorded in this scene. Choose a different supported next step; no event or time was repeated.",
          );
        else if (action.kind === "observe")
          outcome(
            "completed",
            "observed",
            actor.name +
              " observes " +
              (target?.name ?? "the current scene") +
              ". No hidden information, discovery, inventory change or elapsed duration is established.",
          );
        else if (!approved)
          outcome(
            "awaiting_adjudication",
            "duration_required",
            actor.name +
              " intends to " +
              action.kind.replace("_", " ") +
              ". The action has not completed. Its duration and any required access or uncertainty must be explicitly adjudicated; no elapsed round is established.",
          );
        else {
          const obligations = readConsequences(repo, c.campaignId).filter(
            (v) =>
              v.state.deadline &&
              !["resolved", "superseded"].includes(v.status),
          );
          if (!duration)
            outcome(
              "awaiting_adjudication",
              "duration_required",
              "A precise duration or an explicit zero-time ruling is required. No action occurred.",
            );
          else if (["quarter_days", "journey"].includes(duration.unit))
            outcome(
              "awaiting_adjudication",
              "time_adapter",
              "Quarter-day and journey progression must use the existing submitted activity/travel workflows. No clock was advanced.",
            );
          else if (
            obligations.some((v) => {
              const d = v.state.deadline!;
              return (
                d.value === null ||
                d.clockReviewRequired ||
                (duration!.amount > 0 && d.unit !== duration!.unit)
              );
            })
          )
            outcome(
              "awaiting_adjudication",
              "deadline_unit",
              "Resolve the existing deadline or clock review and use its recorded unit. No conversion from minutes, rounds or quarter-days is assumed.",
            );
          else {
            // Every active deadline is checked before any action or roll. Missing source evidence rolls back the event.
            let timeEvidence = true;
            try {
              for (const v of obligations)
                if (duration.amount > 0) {
                  const rules = treatmentRules(repo, v.campaignId);
                  event.evidence.push(
                    ...rules.sources.map((r) => r.documentId + ":" + r.page),
                  );
                }
            } catch (error) {
              if (!(error instanceof AIError)) throw error;
              timeEvidence = false;
              outcome(
                "awaiting_adjudication",
                "time_evidence",
                error.message +
                  " No world action or elapsed time was recorded.",
              );
            }
            if (!timeEvidence) {
              /* Preserve the proposal until official deadline evidence is restored. */
            } else if (
              action.kind === "assist" &&
              obligations.some(
                (v) =>
                  v.characterIds.includes(target!.id) &&
                  v.state.deadline!.elapsed + duration!.amount >=
                    v.state.deadline!.value!,
              )
            )
              outcome(
                "awaiting_adjudication",
                "treatment_timing",
                "This duration reaches the lethal deadline before treatment can complete. Adjudicate timing using the existing consequence procedure; no Healing roll occurred.",
              );
            else {
              let assistanceReady = true;
              if (action.kind === "assist") {
                db.exec("SAVEPOINT world_treatment");
                try {
                  const injury = linked.find(
                    (v) =>
                      v.category === "lethal_injury" &&
                      v.characterIds.includes(target!.id),
                  )!;
                  const treatment = executeConsequence(
                    {
                      type: "world_action",
                      campaignId: c.campaignId,
                      characterId: c.characterId,
                      requestId: randomUUID(),
                      confirmed: true,
                      proposal: {
                        kind: "npc_treatment",
                        consequenceId: injury.id,
                        actorId: actor.id,
                        intent: action.intent,
                      },
                    },
                    repo,
                    principal,
                    die,
                  );
                  event.evidence.push(
                    ...treatment.consequence.rules.map(
                      (r: CombatSource) => r.documentId + ":" + r.page,
                    ),
                  );
                  db.exec("RELEASE world_treatment");
                } catch (error) {
                  db.exec("ROLLBACK TO world_treatment");
                  db.exec("RELEASE world_treatment");
                  if (!(error instanceof AIError)) throw error;
                  assistanceReady = false;
                  outcome(
                    "awaiting_adjudication",
                    "assistance_requirement",
                    error.message + " No treatment or time was recorded.",
                  );
                }
              }
              if (assistanceReady) {
                if (duration.amount > 0) {
                  for (const previous of obligations) {
                    const v = readConsequences(repo, c.campaignId).find(
                        (v) => v.id === previous.id,
                      )!,
                      d = v.state.deadline!;
                    d.elapsed += duration.amount;
                    v.state.notes.push(
                      "World event " +
                        event.requestId +
                        ": verified " +
                        duration.amount +
                        " " +
                        duration.unit +
                        "; " +
                        event.evidence[0],
                    );
                    nextConsequenceStep(v);
                    saveConsequence(repo, v);
                  }
                }
                event.elapsed = duration;
                const code =
                  action.kind === "move"
                    ? action.destination === "depart"
                      ? "departed"
                      : "moved_near"
                    : action.kind === "assist"
                      ? "treatment_attempted"
                      : action.kind === "advance_time"
                        ? "time_recorded"
                        : action.kind === "search"
                          ? "searched"
                          : "interacted";
                outcome(
                  "completed",
                  code,
                  actor.name +
                    " · " +
                    (code === "searched"
                      ? "completed the accessible search; no item was taken or hidden possession discovered"
                      : code === "departed"
                        ? "departed the immediate scene"
                        : code === "moved_near"
                          ? "moved to Near within the scene"
                          : code === "treatment_attempted"
                            ? "completed the recorded Healing attempt; success is determined only by its saved roll"
                            : code === "interacted"
                              ? "made a bounded " +
                                action.interaction +
                                " interaction; no player choice or agreement was imposed"
                              : "verified time event recorded") +
                    ". Recorded elapsed time: " +
                    duration.amount +
                    " " +
                    duration.unit +
                    ".",
                );
              }
            }
          }
        }
        if (event.status === "completed")
          for (const old of linked) {
            const v = readConsequences(repo, c.campaignId).find(
              (v) => v.id === old.id,
            )!;
            v.state.notes.push(
              "Verified world event " + event.requestId + ": " + event.code,
            );
            if (
              event.code === "departed" &&
              v.category === "aftermath" &&
              context.actors.every((a) => a.id === event.actorId)
            ) {
              v.status = "resolved";
              v.state.resolution = "narrative_resolved";
              v.state.resolutionEvidence = event.requestId;
              v.nextProcedure =
                "The last surviving NPC departed in verified event " +
                event.requestId +
                ". Mechanical injuries remain separate.";
            }
            saveConsequence(repo, v);
          }
      }
    }
    // Shared event summaries carry no character-private consequence text.
    db.prepare("INSERT INTO consequence_commands VALUES (?,?,?,?,?)").run(
      c.campaignId,
      c.requestId,
      hash,
      JSON.stringify({ worldEvent: event }),
      event.createdAt,
    );
    db.exec("COMMIT");
    return event;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
