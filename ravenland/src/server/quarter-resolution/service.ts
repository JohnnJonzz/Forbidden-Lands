import { canPush } from "../../lib/dice/engine";
import { resolveActivityRoll } from "../activities/resolution";
import { z } from "zod";
import type { SqliteCampaignRepository } from "../sqlite";
import {
  requireCharacterAccess,
  type CharacterPrincipal,
} from "../character-access";
import { tableGM } from "../narrative/authority";
import { executeJourney } from "../journey/service";
import { executeActivity } from "../activities/service";
import { currentRoutine } from "../../lib/activities";
import { completionFor } from "../../lib/journey/chat-engine";
import {
  expeditionFor,
  navigationContext,
  visitedHexes,
} from "../../lib/journey/expedition";
import {
  outcomeFor,
  assistedSubmissionSchema,
} from "../../lib/quarter-resolution";
import { mechanicalCharacter } from "../mechanical-character";
import { activeCombat } from "../combat/store";
import { sheetFor, applySheet } from "../../lib/character-sheet";
import { readFlow, saveFlow, stableId, fingerprint, type Flow } from "./store";
import { pathfinder, pathOfForest } from "./talents";
import {
  pendingCheck,
  performCheck,
  checkFor,
  saveCheck,
  presentEncounter,
} from "./director";
export const quarterResolutionCommand = z
  .object({
    campaignId: z.string().uuid(),
    entryId: z.string().uuid(),
    actorId: z.string(),
    requestId: z.string().uuid(),
    revision: z.number().int(),
    operation: z.enum([
      "start",
      "select",
      "continue",
      "complete",
      "keep",
      "forest",
      "ruling",
      "skip",
      "waive",
      "resolve-scene",
      "introduce",
    ]),
    options: assistedSubmissionSchema.optional(),
    rollId: z.string().uuid().optional(),
    reason: z.string().trim().max(1600).optional(),
    success: z.boolean().optional(),
    confirmed: z.literal(true).optional(),
  })
  .strict();
export function controller(
  repo: SqliteCampaignRepository,
  id: string,
  entryId: string,
  actor: string,
  p: CharacterPrincipal | null,
) {
  requireCharacterAccess(p, id, actor);
  const entry = repo.get(id)?.session.dayTracker?.find((e) => e.id === entryId);
  if (!entry) throw Error("Submitted quarter-day not found.");
  if (p?.mode !== "trusted-local")
    for (const a of entry.assignments)
      requireCharacterAccess(p, id, a.characterId);
  return entry;
}
export function resolutionView(
  repo: SqliteCampaignRepository,
  id: string,
  entryId: string,
  gm = false,
) {
  const f = readFlow(repo, id, entryId),
    s = repo.get(id)?.session;
  if (!s) return null;
  const c = checkFor(repo, id, s, entryId);
  return {
    flow: f,
    encounter: c
      ? {
          id: c.id,
          status: c.status,
          ...(gm ? { faces: c.faces, entryNumber: c.entryNumber } : {}),
          hex: c.hex,
          publicIntro:
            gm || ["safe_distance", "close"].includes(c.detection)
              ? c.publicIntro
              : "",
          detection: c.detection,
          reason: c.reason,
        }
      : null,
    outcomes: s.activityOutcomes?.filter((o) => o.entryId === entryId) ?? [],
  };
}
export function executeQuarterResolution(
  repo: SqliteCampaignRepository,
  raw: unknown,
  p: CharacterPrincipal | null,
  die?: (n: number) => number,
) {
  const c = quarterResolutionCommand.parse(raw),
    db = repo.db;
  requireCharacterAccess(p, c.campaignId, c.actorId);
  if (["start", "continue", "complete"].includes(c.operation))
    controller(repo, c.campaignId, c.entryId, c.actorId, p);
  else if (
    ["forest", "keep", "select"].includes(c.operation) &&
    p?.mode !== "trusted-local"
  ) {
    const roll = repo
      .get(c.campaignId)
      ?.session.dice?.find((d) => d.id === c.rollId);
    if (!roll) throw Error("Choose an actual saved roll.");
    requireCharacterAccess(p, c.campaignId, roll.characterId);
  }
  const key = fingerprint({ ...c, revision: undefined, player: p!.playerId });
  db.exec("BEGIN IMMEDIATE");
  try {
    const old = db
      .prepare(
        "SELECT fingerprint FROM quarter_resolution_commands WHERE campaign_id=? AND request_id=?",
      )
      .get(c.campaignId, c.requestId);
    if (old) {
      if (old.fingerprint !== key)
        throw Error("Resolution request already used for a different choice.");
      db.exec("COMMIT");
      return {
        record: repo.get(c.campaignId)!,
        ...resolutionView(repo, c.campaignId, c.entryId),
        replayed: true,
      };
    }
    let r = repo.get(c.campaignId)!,
      s = r.session,
      f = readFlow(repo, r.id, c.entryId);
    if (r.revision !== c.revision)
      throw Error(
        "The campaign changed. Refresh the saved quarter-day before continuing.",
      );
    if (!f) {
      if (c.operation !== "start" || !c.options || c.confirmed !== true)
        throw Error(
          "Review and explicitly start assisted resolution for this saved entry.",
        );
      if (completionFor(s, c.entryId))
        throw Error(
          "Historical completed quarters cannot be adopted or replayed.",
        );
      const now = new Date().toISOString();
      f = {
        ...c.options,
        entryId: c.entryId,
        controllerId: p!.playerId,
        actorId: c.actorId,
        status: "Ready to resolve",
        prompt: "",
        revision: 0,
        steps: [],
        kept: [],
        selected: {},
        createdAt: now,
        updatedAt: now,
      };
      saveFlow(repo, r.id, f);
      if (s.quarterDays) {
        Object.assign(s.quarterDays.settings, {
          resolutionMode: "AI GM Assisted",
          autoComplete: f.autoComplete,
          encounterHandling: f.encounterHandling,
        });
        r = repo.update(r.id, r.revision, s, { workflowValidated: true });
      }
    }
    f.actorId = c.actorId;
    if (completionFor(s, c.entryId)) {
      f.status = "Quarter completed";
      f.prompt = "This saved quarter has already advanced time.";
    } else {
      const entry = s.dayTracker!.find((e) => e.id === c.entryId)!;
      if (
        ["skip", "waive", "ruling", "resolve-scene", "introduce"].includes(
          c.operation,
        )
      ) {
        if (!tableGM(repo, r.id, p).isTableGM)
          throw Error(
            "Only the assigned Table GM can authorize this correction or testing override.",
          );
        if (!c.confirmed || !c.reason)
          throw Error("Review this specific operation and confirm a reason.");
      }
      if (c.operation === "select") {
        const roll = s.dice?.find((d) => d.id === c.rollId),
          ctx = navigationContext(s),
          watch = entry.assignments.find((a) => a.activity === "Keep Watch");
        if (!roll) throw Error("Choose an actual saved card.");
        if (p?.mode !== "trusted-local")
          requireCharacterAccess(p, r.id, roll.characterId);
        if (
          ctx &&
          roll.characterId === ctx.characterId &&
          roll.result.skill === "Survival"
        )
          f.selected[ctx.checkId] = roll.id;
        else if (
          watch &&
          roll.characterId === watch.characterId &&
          roll.result.skill === "Scouting"
        )
          f.selected.watch = roll.id;
        else
          throw Error(
            "This card does not belong to the pending navigation or Watch assignment.",
          );
      }
      const keptWatch =
        c.operation === "keep" &&
        c.rollId === f.selected.watch &&
        s.dice?.some(
          (d) =>
            d.id === c.rollId &&
            d.result.skill === "Scouting" &&
            entry.assignments.some(
              (a) =>
                a.activity === "Keep Watch" && a.characterId === d.characterId,
            ),
        );
      if (keptWatch) {
        if (!f.kept.includes(c.rollId!)) f.kept.push(c.rollId!);
      } else if (
        c.operation === "keep" ||
        c.operation === "forest" ||
        c.operation === "ruling"
      ) {
        const roll = s.dice?.find((d) => d.id === c.rollId),
          ctx = navigationContext(s),
          native = currentRoutine(s)?.activities.find(
            (a) =>
              a.request?.rollId === roll?.id &&
              ["forage", "hunt-search"].includes(
                a.request?.context.step ?? "",
              ) &&
              a.status === "Awaiting Push/keep decision",
          ),
          a = entry.assignments.find(
            (a) =>
              a.characterId === roll?.characterId &&
              (native
                ? a.id === native.assignmentId
                : a.activity === "Lead the Way"),
          ),
          scope = native?.request?.context.requestId ?? ctx?.checkId;
        if (
          !roll ||
          !a ||
          !scope ||
          (!native && roll.journeyContext?.checkId !== ctx?.checkId)
        )
          throw Error(
            "Select the current bound unresolved navigation roll or eligible Forage/Hunt search.",
          );
        if (c.operation !== "ruling" && p?.mode !== "trusted-local")
          requireCharacterAccess(p, r.id, roll.characterId);
        if (c.operation === "keep") {
          if (!f.kept.includes(roll.id)) f.kept.push(roll.id);
          if (native) {
            resolveActivityRoll(repo, r.id, s, entry.id, native, roll);
            repo.update(r.id, r.revision, s, { activitiesValidated: true });
          }
        } else {
          if (c.operation === "forest" && roll.result.successes > 0)
            throw Error(
              "The saved roll already succeeded; no Willpower intervention is needed.",
            );
          if (c.operation === "forest" && !c.confirmed)
            throw Error("Explicitly confirm spending one Willpower.");
          if (outcomeFor(s, entry.id, a.characterId, roll.id, scope))
            throw Error("This activity already has a final outcome receipt.");
          const talent =
            c.operation === "forest"
              ? pathOfForest(repo, r.id, s, a.characterId, a.activity)
              : null;
          if (c.operation === "forest" && (!talent || talent.availableWP < 1))
            throw Error(
              "Verified Path of the Forest rank, Druid profession and one available Willpower are required.",
            );
          if (c.operation === "forest") {
            const ch = s.characters.find((ch) => ch.id === a.characterId)!,
              sheet = sheetFor(ch);
            sheet.willpower = String(talent!.availableWP - 1);
            s.characters = s.characters.map((ch2) =>
              ch2.id === ch.id ? applySheet(ch, sheet) : ch2,
            );
          }
          (s.activityOutcomes ??= []).push({
            id: c.requestId,
            entryId: entry.id,
            assignmentId: a.id,
            characterId: a.characterId,
            scope,
            rollId: roll.id,
            rawSuccesses: roll.result.successes,
            finalSuccesses: c.operation === "forest" || c.success ? 1 : 0,
            source: c.operation === "forest" ? "talent" : "table_gm_ruling",
            reference: talent
              ? JSON.stringify(talent.reference)
              : "Explicit scoped Table GM ruling",
            wpCost: talent ? 1 : 0,
            reason:
              c.reason ||
              "Owner authorized Path of the Forest automatic success.",
            actorId: p!.playerId,
            at: new Date().toISOString(),
          });
          if (native)
            resolveActivityRoll(repo, r.id, s, entry.id, native, roll);
          repo.update(r.id, r.revision, s, {
            orchestrationValidated: true,
            activitiesValidated: !!native,
          });
        }
      }
      if (
        ["skip", "waive", "resolve-scene", "introduce"].includes(c.operation)
      ) {
        if (activeCombat(repo, r.id))
          throw Error(
            "Use the existing reviewed administrative combat recovery first. Saved damage, dice and unresolved obligations cannot be undone by an encounter skip.",
          );
        const check =
          checkFor(repo, r.id, s, entry.id) ??
          (entry.traveling ? null : pendingCheck(repo, r.id, s, entry.id));
        if (!check)
          throw Error(
            "The encounter check is not yet at its actual route position.",
          );
        if (c.operation === "waive") {
          if (check.status !== "pending" || check.faces)
            throw Error(
              "Only this pending, unrolled check can be waived. A rolled encounter must be skipped explicitly.",
            );
          check.status = "waived";
        }
        if (c.operation === "skip") {
          if (!["scene", "review"].includes(check.status) || !check.entryNumber)
            throw Error(
              "Choose the actual unresolved encounter; no encounter is available to skip.",
            );
          check.status = "skipped";
        }
        if (c.operation === "resolve-scene") {
          if (check.status !== "scene")
            throw Error(
              "Resolve the actual introduced scene, with its recorded outcome.",
            );
          check.status = "resolved";
        }
        if (c.operation === "introduce") {
          if (check.status !== "review")
            throw Error(
              "Only the current source-preparation hold can be introduced.",
            );
          check.publicIntro = c.reason!;
          check.status = "scene";
        }
        check.reason = c.reason!;
        check.overrideId = c.requestId;
        saveCheck(repo, r.id, check);
        const fresh = repo.get(r.id)!;
        fresh.session.journal.push({
          id: c.requestId,
          title:
            c.operation === "skip"
              ? "Skipped — Table GM Testing Override"
              : c.operation === "waive"
                ? "Encounter check waived — Table GM Testing Override"
                : "Encounter scene review",
          text: `${entry.date} · ${entry.quarter} · ${check.hex}\n${c.reason}\nOriginal D66: ${check.faces?.join(", ") ?? "Not rolled"}; original entry: ${check.entryNumber ?? "Not selected"}. No victory, escape, rewards or restoration applied.`,
        });
        repo.update(r.id, fresh.revision, fresh.session);
      }
      let partyController = false;
      try {
        controller(repo, r.id, c.entryId, c.actorId, p);
        partyController = true;
      } catch {}
      if (partyController)
        run(repo, r.id, f, p, die, c.operation === "complete");
      else {
        f.status = "Ready to resolve";
        f.prompt =
          "Your authorized choice is saved. The party controller can continue this same quarter; no other character’s resources, movement or time were changed.";
      }
    }
    saveFlow(repo, r.id, f);
    db.prepare("INSERT INTO quarter_resolution_commands VALUES (?,?,?,?)").run(
      r.id,
      c.requestId,
      key,
      JSON.stringify({ entryId: c.entryId }),
    );
    db.exec("COMMIT");
    return {
      record: repo.get(r.id)!,
      ...resolutionView(repo, r.id, c.entryId),
      replayed: false,
    };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function run(
  repo: SqliteCampaignRepository,
  id: string,
  f: Flow,
  p: CharacterPrincipal | null,
  die?: (n: number) => number,
  complete = false,
) {
  const hold = (status: Flow["status"], prompt: string) => {
    f.status = status;
    f.prompt = prompt;
  };
  for (let n = 0; n < 20; n++) {
    const r = repo.get(id)!,
      s = r.session,
      entry = s.dayTracker!.find((e) => e.id === f.entryId)!;
    if (completionFor(s, entry.id)) {
      hold("Quarter completed", "Saved quarter-day completed exactly once.");
      return;
    }
    const j = (operation: string, values: object) =>
      executeJourney(
        {
          campaignId: id,
          revision: repo.get(id)!.revision,
          actionId: stableId(entry.id, operation),
          ...values,
        },
        repo,
      );
    if (activeCombat(repo, id)) {
      hold(
        "Encounter interruption",
        "Resolve the active combat through its existing controls.",
      );
      return;
    }
    repo.db.exec("SAVEPOINT quarter_resolution_step");
    try {
      if (entry.traveling) {
        let route = expeditionFor(s, entry.id);
        if (!route.plan) {
          const leader = entry.assignments.find(
              (a) => a.activity === "Lead the Way",
            )!,
            talent = pathfinder(repo, id, s, leader.characterId);
          j("route", {
            type: "quarter-chat-plan-route",
            entryId: entry.id,
            confirmed: true,
            review: {
              route: [entry.destination],
              mode: f.mode,
              mounts: [],
              conditions:
                "Submitted destination; verified map adjacency and terrain. No crossings, mounts or special visibility assumed.",
              navigationModifier:
                (entry.quarter === "Night" ? -2 : 0) + talent.modifier,
              modifierReason:
                "Printed darkness and verified Pathfinder rank only.",
              crossings: [],
              mixedReview: null,
            },
          });
          continue;
        }
        if (route.interrupted) {
          hold(
            "Awaiting Table GM ruling",
            "Resolve the saved navigation mishap or journey interruption in Advanced Table GM Review.",
          );
          return;
        }
        if (
          route.nextHex &&
          route.nextStep < route.limit &&
          (!route.entries.length || !!route.encounter)
        ) {
          const ctx = navigationContext(s);
          let rollId: string | null = null;
          if (!visitedHexes(s).has(route.nextHex)) {
            const leader = entry.assignments.find(
                (a) => a.activity === "Lead the Way",
              )!,
              m = mechanicalCharacter(
                s.characters.find((ch) => ch.id === leader.characterId)!,
              ),
              skill = m.skills["skill-survival"],
              base = m.attributes.wits.current;
            if (base === null || skill === null)
              throw Error(
                "Record current Wits and Survival before resolving navigation.",
              );
            const candidates =
              s.dice?.filter(
                (d) =>
                  d.characterId === leader.characterId &&
                  (!ctx ||
                    !f.selected[ctx.checkId] ||
                    f.selected[ctx.checkId] === d.id) &&
                  !d.metadata.utility &&
                  !d.combatContext &&
                  !d.activityContext &&
                  !d.narrativeRequestId &&
                  !d.procedureContext &&
                  d.result.skill === "Survival" &&
                  (d.journeyContext?.checkId === ctx?.checkId ||
                    (!d.journeyContext &&
                      (d.id === leader.rollId ||
                        (d.status === "Pending" &&
                          d.createdAt >=
                            s.chatJourney!.forms.find(
                              (f) => f.entryId === entry.id,
                            )!.requestedAt)))) &&
                  !s.chatJourney!.updates.some(
                    (u) => u.entryReceipt?.navigationRollId === d.id,
                  ) &&
                  d.metadata.attribute === "wits" &&
                  d.original.attribute.length === base &&
                  d.original.skillDice.length ===
                    Math.abs(skill + route.plan!.navigationModifier) &&
                  d.original.negativeSkill ===
                    skill + route.plan!.navigationModifier < 0 &&
                  !d.original.gear.length &&
                  (!d.original.artifacts.length ||
                    (pathfinder(repo, id, s, leader.characterId)
                      .artifactAllowed &&
                      d.original.artifacts.length === 1 &&
                      d.original.artifacts[0].sides === 8)),
              ) ?? [];
            if (candidates.length !== 1) {
              hold(
                candidates.length
                  ? "Awaiting player decision"
                  : "Awaiting roll",
                candidates.length
                  ? "Multiple eligible Survival cards exist. Bind the intended card in Advanced Table GM Review."
                  : "Roll Survival from the leader’s sheet using the reviewed navigation modifier " +
                      route.plan.navigationModifier +
                      ".",
              );
              return;
            }
            const card = candidates[0];
            if (!card.journeyContext) {
              card.journeyContext = ctx!;
              repo.update(id, r.revision, s);
              continue;
            }
            const final = outcomeFor(
              s,
              entry.id,
              leader.characterId,
              card.id,
              ctx!.checkId,
            );
            if (
              leader.outcome === "Success" &&
              card.result.successes === 0 &&
              !final
            ) {
              hold(
                "Awaiting Table GM ruling",
                "Recorded Success disagrees with the raw zero-success roll. Establish the actual talent, Willpower or scoped ruling; none has been assumed.",
              );
              return;
            }
            if (!(final?.finalSuccesses ?? card.result.successes)) {
              const forest = pathOfForest(
                repo,
                id,
                s,
                leader.characterId,
                "Lead the Way",
              );
              hold(
                f.kept.includes(card.id)
                  ? "Awaiting Table GM ruling"
                  : "Awaiting player decision",
                f.kept.includes(card.id)
                  ? "Kept failed navigation requires the actual D66 mishap and reviewed consequences in Advanced Table GM Review."
                  : "Navigation failed. Choose a legal Push on the saved card, keep the result" +
                      (forest
                        ? " or explicitly spend 1 WP for Path of the Forest."
                        : "."),
              );
              return;
            }
            rollId = card.id;
          }
          j("enter:" + route.nextStep, {
            type: "quarter-chat-enter-hex",
            entryId: entry.id,
            routeId: route.routeId,
            step: route.nextStep,
            navigationRollId: rollId,
            adjudication:
              "Saved navigation outcome verified; entered the actual adjacent route hex once.",
            confirmed: true,
          });
          continue;
        }
      }
      if (
        entry.assignments.some(
          (a) => a.activity === "Hike" && a.skill !== "No roll",
        )
      ) {
        hold(
          "Awaiting Table GM ruling",
          "This Hike has an explicit Endurance or manual requirement. Review its actual procedure before completion.",
        );
        return;
      }
      const watcher = entry.assignments.find(
          (a) => a.activity === "Keep Watch",
        ),
        wm =
          watcher &&
          mechanicalCharacter(
            s.characters.find((c) => c.id === watcher.characterId)!,
          );
      const watches =
        watcher && wm
          ? (s.dice ?? []).filter(
              (d) =>
                d.characterId === watcher.characterId &&
                (!f.selected.watch || f.selected.watch === d.id) &&
                d.result.skill === "Scouting" &&
                d.metadata.attribute === "wits" &&
                !d.metadata.utility &&
                !d.journeyContext &&
                !d.combatContext &&
                !d.activityContext &&
                !d.narrativeRequestId &&
                !d.procedureContext &&
                (d.id === watcher.rollId ||
                  d.id === f.selected.watch ||
                  (d.status === "Pending" &&
                    d.createdAt >=
                      s.chatJourney!.forms.find((f) => f.entryId === entry.id)!
                        .requestedAt)) &&
                d.original.attribute.length === wm.attributes.wits.current &&
                d.original.skillDice.length === wm.skills["skill-scouting"] &&
                !d.original.negativeSkill &&
                !d.original.gear.length &&
                !d.original.artifacts.length,
            )
          : [];
      if (watches.length === 1) f.selected.watch = watches[0].id;
      const check = performCheck(
        repo,
        id,
        s,
        entry.id,
        f.encounterHandling,
        die,
      );
      if (["pending", "review"].includes(check.status)) {
        hold(
          "Awaiting Table GM ruling",
          check.status === "pending"
            ? "Encounter handling is Manual. Review this unrolled check or explicitly waive it for testing."
            : "The actual Guide encounter is saved. The Table GM must review and introduce its source-backed scene; it will not be rerolled.",
        );
        return;
      }
      if (check.status === "scene") {
        if (/ambush|lying in wait|surprise attack/i.test(check.publicIntro)) {
          check.detection = "opposed_review";
          saveCheck(repo, id, check);
          hold(
            "Awaiting Table GM ruling",
            "The actual introduced scene establishes an ambush. Resolve its opposed Scouting/Sneak procedure; no automatic sighting or attack was assumed.",
          );
          return;
        }
        if (watches.length !== 1) {
          hold(
            watches.length ? "Awaiting player decision" : "Awaiting roll",
            watches.length
              ? "Multiple eligible Keep Watch cards exist. Select the intended saved card."
              : "An actual encounter is saved. Roll Scouting from the lookout’s sheet to resolve detection; the encounter will not be rerolled.",
          );
          return;
        }
        const watch = watches[0];
        if (
          watch.result.successes === 0 &&
          canPush(watch) &&
          !f.kept.includes(watch.id)
        ) {
          hold(
            "Awaiting player decision",
            "Keep Watch failed. Choose a legal Push on the saved card or keep this result before detection is established.",
          );
          return;
        }
        check.detection =
          watch.result.successes > 0 ? "safe_distance" : "close";
        saveCheck(repo, id, check);
        if (watch.status !== "Submitted") {
          watch.status = "Submitted";
          watch.submittedAt = new Date().toISOString();
          repo.update(id, r.revision, s);
        }
        presentEncounter(repo, id, repo.get(id)!.session, check);
        hold(
          "Encounter interruption",
          "An actual encounter needs the party’s response. Observe, speak, avoid, or make a specific choice; combat has not been assumed.",
        );
        return;
      }
      if (entry.traveling) {
        const route = expeditionFor(s, entry.id);
        if (!route.encounter) {
          j("encounter-review", {
            type: "quarter-chat-expedition-review",
            entryId: entry.id,
            kind: "encounter",
            result:
              check.status === "none"
                ? "none"
                : check.status === "waived"
                  ? "waived"
                  : check.status === "skipped"
                    ? "skipped"
                    : "scene-resolved",
            reason:
              check.status === "none"
                ? "Original Guide D66 check established no encounter."
                : check.reason,
            encounterId: null,
            rollId: null,
            navigationRollId: null,
            confirmed: true,
          });
          continue;
        }
      }
      const routine = currentRoutine(s);
      if (routine?.entryId === entry.id) {
        const waiting = routine.activities.find((a) => a.status !== "Resolved");
        if (waiting) {
          if (
            waiting.activity === "Make Camp" &&
            !waiting.request &&
            waiting.stage === "initial"
          ) {
            executeActivity(
              repo,
              {
                campaignId: id,
                revision: r.revision,
                requestId: stableId(entry.id, waiting.assignmentId, "prepare"),
                actorId: f.actorId,
                operation: "prepare",
                assignmentId: waiting.assignmentId,
                confirmed: true,
              },
              p,
            );
            continue;
          }
          hold(
            waiting.status.includes("roll")
              ? "Awaiting roll"
              : "Awaiting player decision",
            waiting.summary ||
              "Resolve " +
                waiting.activity +
                " through the existing activity controls below.",
          );
          return;
        }
      }
      if (watches.length > 1) {
        hold(
          "Awaiting player decision",
          "Multiple eligible Keep Watch cards exist; select the intended saved card in Advanced Table GM Review.",
        );
        return;
      }
      if (!f.autoComplete && !complete) {
        hold(
          "Mechanically complete",
          "All required mechanics are ready. Complete this quarter-day when ready.",
        );
        return;
      }
      if (watches[0] && watches[0].status !== "Submitted") {
        watches[0].status = "Submitted";
        watches[0].submittedAt = new Date().toISOString();
        repo.update(id, r.revision, s);
        continue;
      }
      if (routine?.entryId === entry.id)
        executeActivity(
          repo,
          {
            campaignId: id,
            revision: r.revision,
            requestId: stableId(entry.id, "complete"),
            actorId: f.actorId,
            operation: "complete",
            entryId: entry.id,
            confirmed: true,
          },
          p,
        );
      else
        j("complete", {
          type: "quarter-chat-complete",
          entryId: entry.id,
          actorId: f.actorId,
          confirmed: true,
          resolution: {
            endingHex: s.campaign.hex,
            quarterDays: 1,
            nextWeather: s.campaign.weather,
            restConfirmed:
              check.status === "none" &&
              entry.assignments.some(
                (a) =>
                  a.activity === "Lead the Way" &&
                  pathfinder(repo, id, s, a.characterId).rank >= 2,
              ),
            adjudication:
              "Assisted resolution: saved navigation, physical position and original-source encounter procedure verified. " +
              (check.status === "skipped"
                ? "Encounter skipped by explicit Table GM testing override."
                : check.status === "waived"
                  ? "Encounter check waived by explicit Table GM testing override."
                  : check.reason),
            narrative: "",
          },
        });
      continue;
    } catch (e) {
      repo.db.exec("ROLLBACK TO quarter_resolution_step");
      hold(
        "Awaiting Table GM ruling",
        e instanceof Error
          ? e.message
          : "Review this specific procedure before continuing.",
      );
      return;
    } finally {
      repo.db.exec("RELEASE quarter_resolution_step");
    }
  }
  hold(
    "Ready to resolve",
    "Saved progress retained. Continue bounded resolution.",
  );
}
export function resumeQuarter(
  repo: SqliteCampaignRepository,
  id: string,
  p: CharacterPrincipal | null,
  requestId: string,
) {
  const s = repo.get(id)?.session,
    entryId = s?.chatJourney?.forms.find(
      (f) => f.entryId && !completionFor(s, f.entryId),
    )?.entryId;
  if (!entryId) return null;
  const f = readFlow(repo, id, entryId);
  if (!f || f.status === "Quarter completed") return null;
  const actor =
    p?.grants.find((g) => g.campaignId === id)?.characterIds[0] ?? f.actorId;
  try {
    controller(repo, id, entryId, actor, p);
  } catch {
    return null;
  }
  return executeQuarterResolution(
    repo,
    {
      campaignId: id,
      entryId,
      actorId: actor,
      requestId: stableId(requestId, "quarter-resume"),
      revision: repo.get(id)!.revision,
      operation: "continue",
    },
    p,
  );
}
