import { assertRun, testRun } from "./test-runs";
import { requests, putRequest } from "./roll-store";
import { ensureRollQueue } from "./roll-store";
import { rollQueueView } from "./roll-engine";
import { hasRollQueue } from "./upgrade";
import { randomUUID, createHash } from "node:crypto";
import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { requireCharacterAccess, mayReadCharacter } from "../character-access";
import { tableGM } from "../narrative/authority";
import { occupiedCamp } from "../../lib/campsites";
import { displayDate } from "../../lib/calendar";
import {
  gameplayCommandSchema,
  gameplayAnswerSchema,
  type GameplayAnswer,
  gameplayStateSchema,
  phase7Capability,
  type Assignment,
  type GameplayState,
} from "../../lib/gameplay";
import { requireProfile } from "./profile";
import { interpretStationaryPlan } from "./intent";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function readActivity(repo: SqliteCampaignRepository, id: string) {
  const row = repo.db
    .prepare(
      "SELECT a.state_json FROM phase7_campaigns c LEFT JOIN phase7_activities a ON a.id=c.current_activity_id WHERE c.campaign_id=?",
    )
    .get(id);
  return row?.state_json
    ? gameplayStateSchema.parse(JSON.parse(String(row.state_json)))
    : null;
}
function enrolled(
  repo: SqliteCampaignRepository,
  id: string,
  profile?: string,
) {
  const p = requireProfile(repo, profile);
  if (
    !repo.db
      .prepare(
        "SELECT 1 FROM phase7_campaigns WHERE campaign_id=? AND profile_id=?",
      )
      .get(id, p.profileId)
  )
    throw Error(
      "This campaign has not been explicitly enrolled in this Phase 7 development profile. Existing campaigns are not migrated automatically.",
    );
  const r = repo.get(id);
  if (!r) throw Error("Campaign not found.");
  return r;
}
function authorize(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
  principal: CharacterPrincipal | null,
  write = false,
) {
  requireCharacterAccess(principal, id, actor);
  const r = repo.get(id)!;
  if (!r.session.characters.some((c) => c.id === actor))
    throw Error("Choose an actual campaign character.");
  if (
    write &&
    !(
      principal?.mode === "trusted-local" &&
      principal.playerId === "trusted-local"
    )
  )
    for (const c of r.session.characters)
      requireCharacterAccess(principal, id, c.id);
  return r;
}
export function gameplayView(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
  principal: CharacterPrincipal | null,
  profile?: string,
) {
  const r = enrolled(repo, id, profile);
  authorize(repo, id, actor, principal);
  const s = r.session,
    state = readActivity(repo, id),
    clock = {
      date: s.campaign.date,
      quarter: s.campaign.quarter,
      hex: s.campaign.hex,
      elapsedQuarters: s.calendarState?.elapsedQuarters ?? null,
    },
    stale = !!state && hash(state.clockRef) !== hash(clock);
  const queue = rollQueueView(repo, id);
  return {
    run: testRun(repo, id),
    campaignName: s.campaign.name,
    objective: s.campaign.objective,
    milestone: testRun(repo, id)
      ? "7.0B.2"
      : hasRollQueue(repo)
        ? "7.0B"
        : "7.0A",
    rolls: queue,
    campaignId: id,
    campaignRevision: r.revision,
    activity: state,
    clock: {
      ...clock,
      displayDate: displayDate(s.campaign.date, s.environment?.calendar),
      location: s.campaign.location,
      terrain: s.campaign.terrain,
      weather: s.campaign.weather,
      campsite: occupiedCamp(s)?.locationName ?? null,
    },
    party: s.characters.map((c) => ({
      id: c.id,
      name: c.name,
      profession: c.profession,
      mayAct:
        principal?.mode === "trusted-local" ||
        mayReadCharacter(principal, id, c.id),
    })),
    actorId: actor,
    isTableGM: tableGM(repo, id, principal).isTableGM,
    blockers: stale
      ? [
          "The authoritative clock changed outside this plan. This activity cannot be continued or replayed.",
        ]
      : queue && state?.status === "planned"
        ? [
            ...queue.packet.outstanding.map(
              (r) => r.review ?? r.status.replaceAll("_", " "),
            ),
            phase7Capability,
          ]
        : (state?.obligations.map((o) => o.question) ?? [
            "Declare the party’s stationary activities or open the optional planner.",
          ]),
    events: repo.db
      .prepare(
        "SELECT id,kind,payload_json,created_at FROM phase7_events WHERE campaign_id=? ORDER BY rowid DESC LIMIT 30",
      )
      .all(id)
      .reverse()
      .map((e) => ({
        id: String(e.id),
        kind: String(e.kind),
        ...JSON.parse(String(e.payload_json)),
        at: String(e.created_at),
      })),
    capabilities: {
      planning: true,
      dice: hasRollQueue(repo),
      completion: false,
      encounters: false,
      travel: false,
    },
    canRevise: !!state && !queue?.savedRolls.length,
    stale,
  };
}
export type GameplayResult = GameplayAnswer & {
  replayed: boolean;
  view: ReturnType<typeof gameplayView>;
};
export function executeGameplay(
  repo: SqliteCampaignRepository,
  raw: unknown,
  principal: CharacterPrincipal | null,
  profile?: string,
): GameplayResult {
  const c = gameplayCommandSchema.parse(raw);
  enrolled(repo, c.campaignId, profile);
  authorize(repo, c.campaignId, c.actorId, principal, true);
  const {
      campaignRevision: expectedCampaign,
      activityRevision: expectedActivity,
      ...identity
    } = c,
    fp = hash({ identity, playerId: principal!.playerId }),
    db = repo.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    assertRun(repo, c.campaignId, c.runId);
    const receipt = db
      .prepare(
        "SELECT fingerprint,result_json FROM phase7_commands WHERE campaign_id=? AND operation_id=?",
      )
      .get(c.campaignId, c.operationId);
    if (receipt) {
      if (receipt.fingerprint !== fp)
        throw Error(
          "Operation ID already used for another declaration or actor.",
        );
      db.exec("COMMIT");
      return {
        ...gameplayAnswerSchema.parse(JSON.parse(String(receipt.result_json))),
        replayed: true,
        view: gameplayView(repo, c.campaignId, c.actorId, principal, profile),
      };
    }
    const r = repo.get(c.campaignId)!,
      s = r.session,
      current = readActivity(repo, r.id),
      clock = {
        date: s.campaign.date,
        quarter: s.campaign.quarter,
        hex: s.campaign.hex,
        elapsedQuarters: s.calendarState?.elapsedQuarters ?? null,
      };
    if (
      r.revision !== expectedCampaign ||
      (current?.revision ?? null) !== expectedActivity
    )
      throw Error(
        "The campaign or activity changed. Refresh the saved activity before submitting; no second plan was created.",
      );
    if (current && hash(current.clockRef) !== hash(clock))
      throw Error(
        "The saved plan belongs to a different clock/location identity. No history or completed quarter was replayed.",
      );
    const party = s.characters.map((c) => ({ id: c.id, name: c.name }));
    if (!party.length) throw Error("Add actual characters before planning.");
    const prior =
      current?.status === "clarification" ? current.assignments : [];
    const input =
      c.type === "declare"
        ? interpretStationaryPlan(c.text, party, prior)
        : { recognized: true, assignments: c.assignments, question: null };
    if (!input.recognized) {
      const answer: GameplayAnswer = {
        status: "clarification",
        text: input.question ?? "Declare stationary activities.",
      };
      saveReceipt(answer);
      db.exec("COMMIT");
      return {
        ...answer,
        replayed: false,
        view: gameplayView(repo, r.id, c.actorId, principal, profile),
      };
    }
    const assignments = normalize(input.assignments);
    if (
      new Set(assignments.map((a) => a.characterId)).size !==
        assignments.length ||
      assignments.some((a) => !party.some((p) => p.id === a.characterId))
    )
      throw Error(
        "Assignments must identify actual party members exactly once.",
      );
    const missing = party.filter(
      (p) => !assignments.some((a) => a.characterId === p.id),
    );
    if (c.type === "plan" && missing.length)
      throw Error("The planner must assign every character exactly once.");
    if (
      assignments.filter((a) => a.activity === "Make Camp").length > 1 ||
      assignments.filter((a) => a.activity === "Keep Watch").length > 1
    )
      throw Error(
        "Assign one camp maker and one lookout. Assistance needs its supported procedure, not duplicate roles.",
      );
    if (assignments.some((a) => a.activity === "Other" && !a.description))
      throw Error(
        "Describe an Other activity without inventing its mechanical effects.",
      );
    if (c.type === "revise") {
      if (!testRun(repo, r.id) || !tableGM(repo, r.id, principal).isTableGM)
        throw Error(
          "Revise Activity Plan requires the actual Table GM in an upgraded synthetic profile.",
        );
      if (!current) throw Error("There is no current activity to revise.");
      if (
        (s.dice ?? []).some((d) => d.phase7?.activityId === current.id) ||
        requests(repo, r.id).some(
          (q) => q.activityId === current.id && q.savedRollId,
        )
      )
        throw Error(
          "Saved dice or Push consequences already exist. Retain this plan, use the reviewed binding correction, or explicitly reset the test quarter. Plan revision cannot erase or reuse rolled results.",
        );
      db.prepare("INSERT INTO phase7_test_archives VALUES (?,?,?,?,?,?,?)").run(
        randomUUID(),
        r.id,
        c.runId!,
        "plan_revision",
        JSON.stringify({
          activity: current,
          queue: requests(repo, r.id).filter(
            (q) => q.activityId === current.id,
          ),
        }),
        principal!.playerId,
        new Date().toISOString(),
      );
      for (const q of requests(repo, r.id).filter(
        (q) => q.activityId === current.id && q.status !== "superseded",
      ))
        putRequest(repo, {
          ...q,
          status: "superseded",
          revision: q.revision + 1,
        });
      current.status = "clarification";
    }
    if (current?.status === "planned") {
      if (
        hash(normalize(current.assignments)) !== hash(assignments) ||
        input.question
      )
        throw Error(
          "This quarter already has a saved plan. Plan changes require a reviewed Phase 7 operation; no second workflow was started.",
        );
      const answer: GameplayAnswer = {
        status: "planned",
        activityId: current.id,
        text: "This is the same saved activity plan. " + phase7Capability,
      };
      ensureRollQueue(repo, r.id);
      saveReceipt(answer);
      db.exec("COMMIT");
      return {
        ...answer,
        replayed: false,
        view: gameplayView(repo, r.id, c.actorId, principal, profile),
      };
    }
    const now = new Date().toISOString(),
      id = current?.id ?? randomUUID(),
      question =
        input.question ??
        (missing.length
          ? "Assign " + missing.map((c) => c.name).join(", ") + "."
          : null),
      state: GameplayState = {
        schemaVersion: 1,
        id,
        campaignId: r.id,
        revision: (current?.revision ?? 0) + 1,
        clockRef: clock,
        status: question ? "clarification" : "planned",
        intent:
          c.type === "declare"
            ? (current?.intent ? current.intent + "\n" : "") + c.text
            : (current?.intent ??
              "Party activities assigned through the optional planner."),
        assignments,
        obligations: [
          {
            id: randomUUID(),
            kind: question ? "plan_choice" : "milestone_capability",
            question: question ?? phase7Capability,
            characterIds: missing.map((c) => c.id),
            status: "pending",
          },
        ],
        procedures: [],
        rollRequests: [],
        savedRollIds: [],
        mechanicalEffects: [],
        encounters: [],
        outcomes: [],
        completionAuthorization: "not_granted",
        transitionReceipt: null,
        createdBy: current?.createdBy ?? principal!.playerId,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
    if (state.intent.length > 3000)
      throw Error(
        "The saved planning clarification is too long. Use the planner to finish this same draft.",
      );
    db.prepare(
      "INSERT INTO phase7_activities VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json",
    ).run(id, r.id, JSON.stringify(gameplayStateSchema.parse(state)));
    db.prepare(
      "UPDATE phase7_campaigns SET current_activity_id=? WHERE campaign_id=?",
    ).run(id, r.id);
    const answer: GameplayAnswer = {
      status: state.status,
      activityId: id,
      text:
        question ??
        "The " +
          clock.quarter +
          " plan is saved: " +
          assignments
            .map(
              (a) =>
                party.find((p) => p.id === a.characterId)!.name +
                " — " +
                a.activity,
            )
            .join("; ") +
          ". " +
          phase7Capability,
    };
    db.prepare("INSERT INTO phase7_events VALUES (?,?,?,?,?,?,?)").run(
      c.operationId,
      r.id,
      id,
      c.type === "revise"
        ? "plan_revised"
        : question
          ? "planning_clarification"
          : "plan_created",
      JSON.stringify({
        input: c.type === "declare" ? c.text : "Optional activity planner",
        text: answer.text,
      }),
      principal!.playerId,
      now,
    );
    ensureRollQueue(repo, r.id);
    saveReceipt(answer);
    db.exec("COMMIT");
    return {
      ...answer,
      replayed: false,
      view: gameplayView(repo, r.id, c.actorId, principal, profile),
    };
    function saveReceipt(answer: GameplayAnswer) {
      db.prepare("INSERT INTO phase7_commands VALUES (?,?,?,?,?)").run(
        c.campaignId,
        c.operationId,
        principal!.playerId,
        fp,
        JSON.stringify(answer),
      );
    }
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
function normalize(a: Assignment[]) {
  return a
    .map((a) => ({ ...a, description: a.description.trim() }))
    .sort((a, b) => a.characterId.localeCompare(b.characterId));
}
