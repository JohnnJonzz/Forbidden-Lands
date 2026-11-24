import { mechanicalCharacter } from "../mechanical-character";
import { combatPages } from "../combat/sources";
import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import { activityRules } from "../activities/rules";
import { activityBlockers, newRequest } from "../activities/state";
import { injuryRow } from "../combat/player-critical";
import { activeCombat } from "../combat/store";
import { readConsequences } from "../consequences/store";
import { checkFor } from "./director";
import { fingerprint, readFlow, stableId } from "./store";
export const injuryMarker = (entryId: string, assignmentId: string) =>
  `[Foraging injury ${entryId}:${assignmentId}]`;
export function foragingEvidence(s: Session, entryId: string) {
  const entry = s.activityState?.entries.find((e) => e.entryId === entryId);
  return (entry?.activities ?? [])
    .filter((a) => a.activity === "Forage")
    .map((a) => {
      const cards = (s.dice ?? []).filter(
        (d) =>
          d.characterId === a.characterId &&
          a.rollIds.includes(d.id) &&
          d.activityContext?.entryId === entryId &&
          d.activityContext.assignmentId === a.assignmentId &&
          d.activityContext.step === "forage-mishap",
      );
      const card = cards.length === 1 ? cards[0] : null,
        n =
          card?.metadata.utility?.kind === "Procedure" &&
          card.metadata.utility.faces.length === 1
            ? card.metadata.utility.faces[0]
            : null;
      const injury = s.characters
        .find((c) => c.id === a.characterId)
        ?.sheet?.injuries?.find((i) =>
          i.source.includes(injuryMarker(entryId, a.assignmentId)),
        );
      return {
        currentState: {
          attributes: mechanicalCharacter(
            s.characters.find((c) => c.id === a.characterId)!,
          ).attributes,
          willpower:
            s.characters.find((c) => c.id === a.characterId)?.sheet
              ?.willpower ?? null,
        },
        assignmentId: a.assignmentId,
        characterId: a.characterId,
        status: a.status,
        stage: a.stage,
        summary: a.summary,
        review: a.review,
        mishapRollId: card?.id ?? null,
        mishap: n,
        ambiguous: cards.length > 1,
        injuryId: injury?.id ?? null,
        injuryDuration: injury?.duration ?? null,
        correctionRequired: n === 3 && !injury,
        moves: (s.dice ?? [])
          .filter(
            (d) =>
              d.characterId === a.characterId &&
              d.result.skill === "Move" &&
              (a.rollIds.includes(d.id) ||
                d.activityContext?.entryId === entryId ||
                d.createdAt >=
                  (s.chatJourney?.forms.find((f) => f.entryId === entryId)
                    ?.requestedAt ??
                    entry?.date ??
                    "")),
          )
          .map((d) => ({
            id: d.id,
            pushed: d.result.pushed,
            successes: d.result.successes,
            attributeDamage: d.result.attributeDamage,
            willpower: d.result.willpower,
            gearDamage: d.result.gearDamage,
            context: d.activityContext ?? null,
            assessment:
              n === 3
                ? "Preserved evidence only: Move is not the printed defense for Foraging D6=3. Push consequences remain committed."
                : "Follow-up requires its exact printed procedure; no Dodge or success inferred.",
          })),
      };
    });
}
export function mishapBlockers(s: Session, entryId: string) {
  return foragingEvidence(s, entryId)
    .filter((e) => e.correctionRequired || e.ambiguous)
    .map(
      (e) =>
        `${s.characters.find((c) => c.id === e.characterId)?.name}: ${e.ambiguous ? "multiple saved Foraging mishap results need review" : "Foraging D6=3 requires reviewed sprained-ankle / blunt 25–26 correction; a Move or snake narration cannot resolve it"}. Open Quarter-Day recovery inspection.`,
    );
}
export function sprainedAnkleRule(repo: SqliteCampaignRepository, id: string) {
  const rules = activityRules(repo, id),
    mishap = rules.pages.find(
      (p) =>
        /FOR\s*AGING MISHAPS/i.test(p.text) &&
        /3\s+Sprained\s+Ankle[\s\S]{0,300}25\s*[–−-]\s*26/i.test(p.text),
    );
  const healing = rules.pages.find(
    (p) =>
      /healing time indicated/i.test(p.text) &&
      /measured in days/i.test(p.text),
  );
  if (!healing)
    throw Error(
      "Restore the original Handbook critical-injury healing-time units before recording a duration.",
    );
  const critical = injuryRow(
    combatPages(repo, id, "handbook").map((p) => ({
      ...p,
      text: p.text.replace(/(\b\d{2})\s*([–−-])\s*(\d{2}\b)/g, "$1$2$3"),
    })),
    "blunt",
    25,
  );
  if (!mishap)
    throw Error(
      "Restore the original Handbook Foraging result 3 source row before correction.",
    );
  if (!critical)
    throw Error(
      "Restore the original blunt 25–26 source row before correction.",
    );
  if (
    !/Broken toes\s+No[\s\S]*RUN becomes a slow action[\s\S]*D6/i.test(
      critical.text,
    )
  )
    throw Error(
      "The original blunt 25–26 effects and healing duration require source review.",
    );
  return {
    mishapSource: mishap.chunkId,
    criticalSource: critical.page.chunkId,
    effect: "To RUN becomes a slow action.",
    healing: "D6 days",
    reference: `Original Handbook printed pp. 150 and 197; indexed physical pages ${mishap.startPage} and ${critical.page.startPage}`,
  };
}
export function inspectQuarterRecovery(
  repo: SqliteCampaignRepository,
  id: string,
  entryId: string,
) {
  const r = repo.get(id);
  if (!r) throw Error("Campaign not found.");
  const s = r.session,
    entry = s.dayTracker?.find((e) => e.id === entryId);
  if (!entry) throw Error("Submitted quarter not found.");
  const encounter = checkFor(repo, id, s, entryId),
    foraging = foragingEvidence(s, entryId),
    routine = s.activityState?.entries.find((e) => e.entryId === entryId),
    combat = activeCombat(repo, id),
    required = readConsequences(repo, id).filter(
      (c) =>
        !["resolved", "superseded"].includes(c.status) &&
        ["life", "mandatory"].includes(c.urgency),
    );
  const obligations = [
    ...mishapBlockers(s, entryId),
    ...activityBlockers(s, entryId),
    ...(encounter && ["scene", "review", "pending"].includes(encounter.status)
      ? [
          `Encounter ${encounter.entryNumber ?? "check"} remains ${encounter.status}; original D66 ${encounter.faces?.join(", ") ?? "unrolled"}. ${encounter.detection === "safe_distance" ? "Choose a source-supported avoidance or review its exact outcome." : "Resolve the actual Scouting/detection procedure before claiming avoidance."}`,
        ]
      : []),
    ...(combat
      ? [
          "Resolve active combat through its existing controls; recovery cannot undo attacks or damage.",
        ]
      : []),
    ...required.map((c) => c.nextProcedure),
  ];
  const { messages: conversation, journal: audit, ...mechanical } = s;
  void conversation;
  void audit;
  const flow = readFlow(repo, id, entryId);
  const flowEvidence = flow
    ? {
        autoComplete: flow.autoComplete,
        encounterHandling: flow.encounterHandling,
        mode: flow.mode,
        entryId: flow.entryId,
        selected: flow.selected,
        kept: flow.kept,
      }
    : null;
  return {
    revision: r.revision,
    previewHash: fingerprint({
      session: mechanical,
      flow: flowEvidence,
      encounter,
      required,
    }),
    entryId,
    clock: {
      date: s.campaign.date,
      quarter: s.campaign.quarter,
      hex: s.campaign.hex,
      weather: s.campaign.weather,
    },
    foraging,
    encounter,
    activities:
      routine?.activities.map((a) => ({
        assignmentId: a.assignmentId,
        characterId: a.characterId,
        activity: a.activity,
        status: a.status,
        summary: a.summary,
        rollIds: a.rollIds,
        request: a.request,
      })) ?? [],
    scouting: (s.dice ?? [])
      .filter(
        (d) =>
          d.result.skill === "Scouting" &&
          entry.assignments.some(
            (a) =>
              a.activity === "Keep Watch" && a.characterId === d.characterId,
          ),
      )
      .map((d) => ({
        id: d.id,
        successes: d.result.successes,
        status: d.status,
        quarterRequestId: d.quarterRequestId ?? null,
        context: d.activityContext ?? null,
      })),
    obligations: [...new Set(obligations)],
    policy:
      "Read-only inspection. AI prose is not a receipt. Reviews preserve original dice and committed Push consequences; no live correction occurs without a fresh authenticated Table GM confirmation.",
  };
}
export function reviewForagingMishap(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  entryId: string,
  assignmentId: string,
  previewHash: string,
  requestId: string,
  reason: string,
  injuryId?: string,
) {
  if (inspectQuarterRecovery(repo, id, entryId).previewHash !== previewHash)
    throw Error(
      "Recovery preview is stale. Inspect the current saved quarter again.",
    );
  if (activeCombat(repo, id))
    throw Error(
      "Resolve active combat through its reviewed recovery controls first.",
    );
  const evidence = foragingEvidence(s, entryId).find(
      (a) => a.assignmentId === assignmentId,
    ),
    entry = s.activityState?.entries.find((e) => e.entryId === entryId),
    a = entry?.activities.find((a) => a.assignmentId === assignmentId);
  if (!entry || entry.completed || !a || evidence?.mishap !== 3)
    throw Error(
      "Choose the current Forage assignment with its one verified D6=3 mishap. No claimed snake or unbound roll is accepted as that result.",
    );
  if (evidence.injuryId)
    throw Error(
      "This mishap already has its correction receipt; resolve its requested healing duration.",
    );
  const previousActivity = {
    status: a.status,
    stage: a.stage,
    summary: a.summary,
    review: a.review,
    request: a.request,
  };
  const rule = sprainedAnkleRule(repo, id),
    ch = s.characters.find((c) => c.id === a.characterId)!;
  ch.sheet ??= {};
  ch.sheet.injuries ??= [];
  let injury = injuryId
    ? ch.sheet.injuries.find((i) => i.id === injuryId && i.status === "active")
    : null;
  if (injuryId && !injury)
    throw Error("Link an actual active injury on the affected character.");
  const source = `${injuryMarker(entryId, assignmentId)} Saved mishap ${evidence.mishapRollId}; ${rule.reference}; ${rule.effect}`;
  if (injury) injury.source += "\n" + source;
  else {
    if (ch.sheet.injuries.length >= 100)
      throw Error(
        "Review the injury record capacity before adding another injury.",
      );
    injury = {
      id: stableId(entryId, assignmentId, "sprained-ankle"),
      name: "Sprained ankle · blunt 25–26 equivalent",
      sustainedDate: entry.date,
      sustainedQuarter: entry.quarter,
      duration: "",
      unit: "review",
      permanent: false,
      status: "active",
      source,
      treatment: "",
      recordedAt: new Date().toISOString(),
    };
    ch.sheet.injuries.push(injury);
  }
  const old = String(ch.sheet["critical-injuries"] ?? "");
  if (!old.includes(injuryMarker(entryId, assignmentId)))
    ch.sheet["critical-injuries"] = (old ? old + "\n" : "") + source;
  a.review =
    (a.review ? a.review + "\n" : "") +
    `Reviewed correction ${requestId}: ${reason}. Original mishap and Move/Push evidence retained. No successful snake defense or resource restoration assumed.`;
  if (
    injury.duration &&
    injury.unit === "days" &&
    Number(injury.duration) > 0
  ) {
    a.status = "Resolved";
    a.stage = "resolved";
    a.request = null;
    a.summary =
      "Sprained-ankle critical linked to the reviewed existing injury; its recorded healing duration and effects remain in force.";
  } else {
    a.stage = "forage-injury-duration";
    a.request = newRequest(
      s,
      entryId,
      a,
      "forage-injury-duration",
      "D6",
      0,
      "D6",
    );
    a.status = "Awaiting roll";
    a.summary =
      "Sprained-ankle critical recorded. Roll the requested D6 healing duration (days), using the typed request. This is not a reroll of the mishap. Already-established durations should be preserved by linking the reviewed existing injury.";
  }
  s.journal.push({
    id: requestId,
    title: "Reviewed Foraging mishap correction",
    text: `${entry.date} · ${entry.quarter} · ${reason}\n${source}\nPrevious activity evidence: ${JSON.stringify(previousActivity)}\nOriginal Move/Push effects retained; no elapsed time, cure or successful Dodge applied.`,
  });
}
