import { assertRun, testRun } from "./test-runs";
import { randomUUID, randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import type { PendingDice, RollMetadata } from "../../lib/dice/schema";
import {
  generatePool,
  applyDiceCommand,
  canPush,
  countSuccesses,
} from "../../lib/dice/engine";
import { sheetFor, applySheet } from "../../lib/character-sheet";
import { sessionSchema } from "../../lib/validation";
import {
  requireCharacterAccess,
  type CharacterPrincipal,
} from "../character-access";
import { tableGM } from "../narrative/authority";
import {
  rollCommandSchema,
  parseExpression,
  type DiceSpec,
  type RollRequest,
} from "../../lib/gameplay-rolls";
import { requireProfile } from "./profile";
import { hasRollQueue } from "./upgrade";
import {
  currentActivity,
  requests,
  putRequest,
  ensureRollQueue,
  correctionPreview,
  digest,
} from "./roll-store";
import {
  derivePool,
  forestIntervention,
  sprainEvidence,
  rollRules,
} from "./roll-rules";
const geo = { lookup: () => null, adjacent: () => false, calibrated: false };
const active = (r: RollRequest) => r.status !== "superseded";
const now = () => new Date().toISOString();
export function rollQueueView(repo: SqliteCampaignRepository, id: string) {
  if (!hasRollQueue(repo)) return null;
  const a = currentActivity(repo, id),
    s = repo.get(id)!.session,
    list = requests(repo, id).filter((r) => r.activityId === a?.id),
    current = list.filter(active),
    cards = s.dice?.filter((d) => d.phase7?.activityId === a?.id) ?? [],
    pending = current.filter((r) => r.status !== "resolved");
  return {
    runId: testRun(repo,id)?.id ?? null,
    requests: list.map((r) => ({
      ...r,
      availableWillpower: Number(
        s.characters.find((c) => c.id === r.characterId)?.sheet?.willpower ?? 0,
      ),
      correction: correctionPreview(repo, r),
    })),
    savedRolls: cards,
    packet: {
      activityId: a?.id ?? null,
      clock: s.campaign,
      assignments: a?.assignments ?? [],
      procedures: current.map((r) => ({
        requestId: r.id,
        characterId: r.characterId,
        procedure: r.procedure,
        expression: r.expression,
        modifiers: r.modifiers,
        forageTarget: r.forageTarget,
        savedRollId: r.savedRollId,
        savedRollRevision: r.savedRollRevision,
        raw: r.raw,
        interventions: r.interventions,
        final: r.final,
        decisions: r.audit.filter((e) =>
          ["push", "keep", "talent", "decline", "review"].includes(e.action),
        ),
        sources: r.sources,
      })),
      scope: "dice-procedures-only",
      activityApplied: false,
      committedTalentChanges: list.flatMap((r) =>
        r.interventions
          .filter((i) => i.kind === "talent")
          .map((i) => ({ requestId: r.id, ...i })),
      ),
      verifiedResourceChanges: [],
      committedPushChanges: cards
        .filter((c) => c.result.pushed)
        .map((c) => ({
          rollId: c.id,
          attribute: c.metadata.attribute,
          attributeDamage: c.result.attributeDamage,
          willpower: c.result.willpower,
          gearDamage: c.result.gearDamage,
        })),
      pendingUnappliedConsequences: current.flatMap(
        (r) => r.final?.pending ?? [],
      ),
      outstanding: pending.map((r) => ({
        requestId: r.id,
        status: r.status,
        review: r.review,
      })),
      fullyResolved: !!a && a.status === "planned" && pending.length === 0,
      mechanicallyDetermined:
        !!a && a.status === "planned" && pending.length === 0,
      durablyApplied: false,
      completionEnabled: false,
      completionReceipt: null,
      aiRequests: Number(
        repo.db
          .prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE campaign_id=?")
          .get(id)?.n ?? 0,
      ),
    },
  };
}
function persistDice(
  repo: SqliteCampaignRepository,
  id: string,
  revision: number,
  before: Session,
  after: Session,
) {
  const clean = (s: Session) => {
    const { dice, characters, messages, ...rest } = s;
    void dice;
    void characters;
    void messages;
    return rest;
  };
  if (!isDeepStrictEqual(clean(before), clean(after)))
    throw Error(
      "Dice operation attempted to alter gameplay time or legacy state.",
    );
  const valid = sessionSchema.parse(after),
    result = repo.db
      .prepare(
        "UPDATE campaigns SET public_state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
      )
      .run(JSON.stringify(valid), now(), id, revision);
  if (!result.changes) throw Error("Campaign changed while saving dice.");
}
function rollSummary(card: PendingDice) {
  const u = card.metadata.utility;
  return {
    successes: u ? null : card.original.successes,
    faces:
      u?.kind === "Custom"
        ? u.faces
        : [
            ...card.original.attribute,
            ...card.original.skillDice,
            ...card.original.gear,
            ...card.original.artifacts.map((d) => d.value),
          ],
    total: u?.kind === "Custom" ? u.total : null,
  };
}
function sameExpression(a: DiceSpec, b: DiceSpec) {
  if (a.kind === "dice" && b.kind === "dice")
    return (
      parseExpression(a.expression).expression ===
      parseExpression(b.expression).expression
    );
  return isDeepStrictEqual(a, b);
}
function makeCard(
  s: Session,
  charId: string,
  spec: DiceSpec,
  activityId: string,
  request: RollRequest | null,
  die: (n: number) => number,
  requestedId?: string,
) {
  const id = requestedId ?? randomUUID();
  let roll, metadata: RollMetadata;
  if (spec.kind === "pool") {
    roll = generatePool(
      { id, characterId: charId, skill: spec.skill },
      { base: spec.base, skill: spec.skillDice, gear: spec.gear },
      die,
    );
    roll.artifacts = spec.artifacts.map((sides) => ({
      sides,
      value: die(sides),
    }));
    roll.successes = countSuccesses(roll);
    metadata = {
      attribute: spec.attribute,
      isArmor: false,
      weaponIndex: null,
      weaponDamage: null,
    };
  } else {
    const p = parseExpression(spec.expression),
      faces: number[] = [],
      values: number[] = [];
    for (const term of p.terms)
      for (let i = 0; i < term.count; i++) {
        const value = die(term.sides);
        if (!Number.isInteger(value) || value < 1 || value > term.sides)
          throw Error("Invalid random result.");
        faces.push(value);
        values.push(value * term.sign);
      }
    const total = p.d66
      ? faces[0] * 10 + faces[1]
      : values.reduce((a, b) => a + b, p.constant);
    roll = generatePool(
      { id, characterId: charId, skill: p.expression },
      { base: 0, skill: 0, gear: 0 },
      die,
    );
    metadata = {
      attribute: null,
      isArmor: false,
      weaponIndex: null,
      weaponDamage: null,
      utility: { kind: "Custom", expression: p.expression, faces, total },
    };
  }
  const next = applyDiceCommand(
      s,
      {
        type: "create",
        campaignId: request?.campaignId ?? randomUUID(),
        actionId: id,
        roll,
        metadata,
      },
      geo,
      now(),
      die,
    ),
    card = next.dice!.find((d) => d.id === id)!;
  card.phase7 = {
    activityId,
    requestId: request?.id ?? null,
    procedure: request?.procedure ?? null,
    pushAllowed: false,
    revision: 1,
    expression:
      spec.kind === "dice" ? parseExpression(spec.expression).expression : null,
  };
  return { session: next, card };
}
function freshSpec(repo: SqliteCampaignRepository, r: RollRequest, s: Session) {
  if (["camp", "forage", "watch"].includes(r.procedure)) {
    const fresh = derivePool(repo, r.campaignId, s, r.characterId, r.activity);
    if (fresh.expression?.kind === "pool" && r.expression?.kind === "pool") {
      if (r.expression.artifacts.length && !fresh.artifactAllowed)
        throw Error(
          "The current talent rank no longer permits this Artifact Die. Recheck the request.",
        );
      fresh.expression.artifacts = r.expression.artifacts;
    }
    if (
      !fresh.expression ||
      !r.expression ||
      !sameExpression(fresh.expression, r.expression) ||
      !isDeepStrictEqual(fresh.modifiers, r.modifiers) ||
      !isDeepStrictEqual(fresh.sources, r.sources) ||
      !isDeepStrictEqual(fresh.talents, r.talents) ||
      fresh.artifactAllowed !== r.artifactAllowed
    )
      throw Error(
        "The sheet, modifiers or source evidence changed. Use Recheck before rolling.",
      );
  } else if (["forage-mishap", "forage-duration"].includes(r.procedure))
    sprainEvidence(repo, r.campaignId);
  else throw Error("This procedure needs mechanical review.");
}
function attach(
  repo: SqliteCampaignRepository,
  r: RollRequest,
  card: PendingDice,
  s: Session,
) {
  if (r.savedRollId || r.status !== "awaiting_roll")
    throw Error("This request already has a result or is not awaiting a roll.");
  if (
    !card.phase7 ||
    card.phase7.activityId !== r.activityId ||
    card.characterId !== r.characterId ||
    card.createdAt < r.createdAt
  )
    throw Error(
      "Wrong activity, character or timing. Old dice cannot satisfy this request.",
    );
  if (card.phase7.requestId && card.phase7.requestId !== r.id)
    throw Error("This saved roll belongs to another procedure.");
  if (card.status !== "Pending" || card.result.pushed)
    throw Error("Only a fresh, unpushed Phase 7 roll may be linked.");
  if (
    repo.db
      .prepare("SELECT 1 FROM phase7_roll_bindings WHERE roll_id=?")
      .get(card.id)
  )
    throw Error(
      "This roll has already been used; corrections do not erase its history.",
    );
  const e = r.expression;
  if (!e) throw Error("No verified expression.");
  if (e.kind === "dice") {
    const u = card.metadata.utility;
    if (
      u?.kind !== "Custom" ||
      parseExpression(u.expression).expression !==
        parseExpression(e.expression).expression
    )
      throw Error("Wrong dice expression for the requested procedure.");
  } else if (
    card.metadata.utility ||
    card.metadata.attribute !== e.attribute ||
    card.result.skill !== e.skill ||
    card.result.attribute.length !== e.base ||
    card.result.skillDice.length !== Math.abs(e.skillDice) ||
    card.result.negativeSkill !== e.skillDice < 0 ||
    card.result.gear.length !== e.gear ||
    !isDeepStrictEqual(
      card.result.artifacts.map((d) => d.sides),
      e.artifacts,
    )
  )
    throw Error("Wrong skill pool or modifiers for this procedure.");
  freshSpec(repo, r, s);
  repo.db
    .prepare("INSERT INTO phase7_roll_bindings VALUES (?,?,1)")
    .run(card.id, r.id);
  r.savedRollId = card.id;
  r.savedRollRevision = card.phase7.revision;
  r.raw = rollSummary(card);
  card.phase7.requestId = r.id;
  card.phase7.procedure = r.procedure;
  card.phase7.pushAllowed = r.expression?.kind === "pool" && r.pushEligible;
  if (e.kind === "pool" && card.result.successes === 0) {
    r.status = canPush(card)
      ? "awaiting_push_decision"
      : r.talents.length
        ? "awaiting_talent_decision"
        : "resolved";
    if (r.status === "resolved") finalize(repo, r, card, s);
  } else finalize(repo, r, card, s);
}
function followup(
  repo: SqliteCampaignRepository,
  parent: RollRequest,
  procedure: "forage-mishap" | "forage-duration",
  sources: RollRequest["sources"],
) {
  const found = requests(repo, parent.campaignId).find(
    (r) =>
      r.activityId === parent.activityId &&
      r.characterId === parent.characterId &&
      r.procedure === procedure &&
      active(r),
  );
  if (found) return found;
  const r: RollRequest = {
    ...structuredClone(parent),
    id: randomUUID(),
    procedure,
    expression: { kind: "dice", expression: "D6" },
    modifiers: [],
    sources,
    pushEligible: false,
    artifactAllowed: false,
    talents: [],
    dependencyId: parent.id,
    interventions: [],
    status: "awaiting_roll",
    savedRollId: null,
    savedRollRevision: null,
    raw: null,
    final: null,
    review: null,
    revision: 1,
    createdAt: now(),
    updatedAt: now(),
    audit: [
      {
        operationId: randomUUID(),
        actorId: "deterministic-engine",
        action: "followup",
        reason: "Depends on " + parent.id,
        at: now(),
      },
    ],
  };
  putRequest(repo, r);
  return r;
}
function finalize(
  repo: SqliteCampaignRepository,
  r: RollRequest,
  card: PendingDice,
  s: Session,
  override = false,
) {
  const successes = override ? 1 : card.result.successes;
  r.status = "resolved";
  card.status = "Submitted";
  card.phase7!.pushAllowed = false;
  card.submittedAt = now();
  r.final = {
    outcome:
      r.expression?.kind === "pool"
        ? successes > 0
          ? "success"
          : "failure"
        : "determined",
    successes: r.expression?.kind === "pool" ? successes : null,
    summary: override
      ? "Path of the Forest: authorized 1 WP establishes success."
      : r.procedure === "watch"
        ? "Prepared Watch result only; no encounter or detection adjudicated."
        : r.expression?.kind === "pool"
          ? successes > 0
            ? "Skill check succeeded."
            : "Final skill check failed."
          : "Saved procedural dice determined.",
    pending: [],
  };
  if (r.procedure === "forage" && successes === 0) {
    const sources = sprainEvidence(repo, r.campaignId);
    followup(repo, r, "forage-mishap", sources);
    r.status = "awaiting_followup_roll";
  } else if (r.procedure === "forage" && successes > 0) {
    const ch = s.characters.find((c) => c.id === r.characterId)!,
      rank = Number(
        ch.sheet?.talents?.find((t) => t.name?.toLowerCase() === "gatherer")
          ?.rank ?? 0,
      );
    r.final.pending.push({
      kind: "foraging-yield-choice",
      description:
        r.forageTarget === "water"
          ? "Forage for water: group skins up to D12; not applied."
          : "Forage for food: " +
            successes * (rank >= 3 ? 2 : 1) +
            " units Vegetables; no inventory awarded.",
      durationDays: null,
      durablyApplied: false,
    });
  } else if (r.procedure === "camp") {
    r.final.pending.push({
      kind: successes > 0 ? "camp-establishment" : "camp-mishap-review",
      description:
        successes > 0
          ? "Camp check succeeded; durable campsite establishment belongs to 7.0C."
          : "Failed Make Camp requires its printed mishap procedure and Table GM review; no campsite established.",
      durationDays: null,
      durablyApplied: false,
    });
    if (successes === 0) {
      r.status = "awaiting_mechanical_review";
      r.review =
        "Make Camp mishap follow-up is not automated; Table GM review required.";
    }
  } else if (r.procedure === "forage-mishap") {
    const u = card.metadata.utility;
    if (u?.kind !== "Custom" || u.expression !== "D6")
      throw Error("Use the saved mishap D6.");
    if (u.total === 3) {
      r.sources = sprainEvidence(repo, r.campaignId);
      r.final.summary =
        "Foraging Mishap 3: Sprained Ankle, equivalent to blunt critical 25–26. RUN becomes a slow action; healing requires D6 days.";
      followup(repo, r, "forage-duration", r.sources);
      r.status = "awaiting_followup_roll";
    } else {
      r.status = "awaiting_mechanical_review";
      r.review =
        "Foraging mishap " +
        u.total +
        " requires its specific source-backed Table GM procedure; no encounter, damage or resource transaction invented.";
    }
  } else if (r.procedure === "forage-duration") {
    const u = card.metadata.utility;
    if (u?.kind !== "Custom" || u.expression !== "D6")
      throw Error("Use the saved duration D6.");
    r.final.summary =
      "Sprained Ankle: RUN becomes a slow action for " +
      u.total +
      " days. Mechanically determined, not durably applied.";
    r.final.pending.push({
      kind: "critical-injury",
      description: "Sprained Ankle (blunt 25–26): RUN becomes a slow action.",
      durationDays: u.total,
      durablyApplied: false,
    });
    closeParents(repo, r);
  }
}
function closeParents(repo: SqliteCampaignRepository, child: RollRequest) {
  if (!child.dependencyId) return;
  const parent = requests(repo, child.campaignId).find(
    (r) => r.id === child.dependencyId,
  )!;
  if (parent.status === "awaiting_followup_roll") {
    parent.status = "resolved";
    parent.revision++;
    parent.updatedAt = now();
    putRequest(repo, parent);
    closeParents(repo, parent);
  }
}
export function executeRoll(
  repo: SqliteCampaignRepository,
  raw: unknown,
  principal: CharacterPrincipal | null,
  profile?: string,
  die = (n: number) => randomInt(1, n + 1),
) {
  const c = rollCommandSchema.parse(raw);
  requireProfile(repo, profile);
  if (!hasRollQueue(repo))
    throw Error("Run the explicit phase7:upgrade command before using dice.");
  requireCharacterAccess(principal, c.campaignId, c.actorId);
  const db = repo.db,
    fp = digest({ ...c, revision: undefined, playerId: principal!.playerId });
  db.exec("BEGIN IMMEDIATE");
  try {
    assertRun(repo,c.campaignId,c.runId);
    const old = db
      .prepare(
        "SELECT * FROM phase7_roll_commands WHERE campaign_id=? AND operation_id=?",
      )
      .get(c.campaignId, c.operationId);
    if (old) {
      if (old.fingerprint !== fp)
        throw Error("Operation ID reused with different roll parameters.");
      db.exec("COMMIT");
      return {
        replayed: true,
        rollId: JSON.parse(String(old.result_json)).rollId,
        queue: rollQueueView(repo, c.campaignId),
      };
    }
    const a = currentActivity(repo, c.campaignId),
      record = repo.get(c.campaignId);
    if (!a || a.id !== c.activityId || a.status !== "planned" || !record)
      throw Error("Choose the current complete activity.");
    const clock = {
      date: record.session.campaign.date,
      quarter: record.session.campaign.quarter,
      hex: record.session.campaign.hex,
      elapsedQuarters: record.session.calendarState?.elapsedQuarters ?? null,
    };
    if (digest(clock) !== digest(a.clockRef))
      throw Error(
        "This activity is stale; its authoritative clock/location changed.",
      );
    let s = structuredClone(record.session),
      r = c.requestId
        ? requests(repo, c.campaignId).find(
            (r) => r.id === c.requestId && r.activityId === a.id,
          )
        : null,
      rollId: string | null = null;
    if (c.requestId && !r)
      throw Error("Request does not belong to the current activity.");
    if (r) {
      if (r.revision !== c.revision)
        throw Error("Request revision changed. Refresh before continuing.");
      if (!active(r)) throw Error("This request was superseded.");
      if (c.operation !== "correct" && c.operation !== "review") {
        if (r.characterId !== c.actorId)
          throw Error(
            "Only the owning character can roll or decide this request.",
          );
        requireCharacterAccess(principal, c.campaignId, r.characterId);
      }
    }
    const audit = (action: string, reason = "") => {
      if (r) {
        r.audit.push({
          operationId: c.operationId,
          actorId: principal!.playerId,
          action,
          reason,
          at: now(),
        });
        r.revision++;
        r.updatedAt = now();
        putRequest(repo, r);
      }
    };
    if (c.operation === "roll") {
      let spec = c.expression;
      if (r) {
        if (r.status !== "awaiting_roll" || !r.expression)
          throw Error("Resolve the pending decision or review before rolling.");
        freshSpec(repo, r, s);
        if (spec && !sameExpression(spec, r.expression))
          throw Error("Wrong dice expression or pool.");
        spec = r.expression;
      } else {
        if (!spec) throw Error("Choose an unlinked dice expression or pool."); // Unlinked pools are explicitly miscellaneous; request linking separately verifies the actual sheet and modifiers.
      }
      const made = makeCard(
        s,
        c.actorId,
        spec!,
        a.id,
        r ?? null,
        die,
        c.rollId,
      );
      s = made.session;
      rollId = made.card.id;
      if (r) {
        attach(repo, r, made.card, s);
        audit("roll");
      }
    } else if (c.operation === "link") {
      if (!r) throw Error("Select a pending request for this explicit link.");
      const card = s.dice?.find((d) => d.id === c.rollId);
      if (!card || card.phase7?.revision !== c.rollRevision)
        throw Error("Saved roll revision changed or roll missing.");
      attach(repo, r, card, s);
      rollId = card.id;
      audit("link");
    } else if (c.operation === "correct") {
      if (!r || !tableGM(repo, c.campaignId, principal).isTableGM)
        throw Error("Only the actual Table GM can correct a binding.");
      const preview = correctionPreview(repo, r);
      if (preview.hash !== c.previewHash)
        throw Error(
          "Correction preview is stale. Review affected procedures again.",
        );
      if (!r.savedRollId) throw Error("There is no binding to correct.");
      for (const child of requests(repo, c.campaignId).filter((q) =>
        preview.affectedIds.includes(q.id),
      )) {
        child.status = "superseded";
        child.revision++;
        child.audit.push({
          operationId: c.operationId,
          actorId: principal!.playerId,
          action: "correction",
          reason: c.reason,
          at: now(),
        });
        putRequest(repo, child);
        db.prepare(
          "UPDATE phase7_roll_bindings SET active=0 WHERE request_id=?",
        ).run(child.id);
      }
      const replacement: RollRequest = {
        ...structuredClone(r),
        id: randomUUID(),
        generation: r.generation + 1,
        interventions: [],
        status: "awaiting_roll",
        savedRollId: null,
        savedRollRevision: null,
        raw: null,
        final: null,
        revision: 1,
        createdAt: now(),
        updatedAt: now(),
        audit: [
          {
            operationId: c.operationId,
            actorId: principal!.playerId,
            action: "replacement",
            reason: c.reason,
            at: now(),
          },
        ],
      };
      if (replacement.expression?.kind === "pool")
        try {
          Object.assign(
            replacement,
            derivePool(repo, c.campaignId, s, r.characterId, r.activity),
          );
        } catch (e) {
          replacement.status = "awaiting_mechanical_review";
          replacement.review = String(e);
        }
      putRequest(repo, replacement);
      r = null;
    } else if (c.operation === "recheck") {
      if (!r || r.savedRollId)
        throw Error("Only an unrolled request can be rechecked.");
      if (["camp", "forage", "watch"].includes(r.procedure))
        Object.assign(
          r,
          derivePool(repo, c.campaignId, s, r.characterId, r.activity),
        );
      else if (["forage-mishap", "forage-duration"].includes(r.procedure)) {
        r.sources = sprainEvidence(repo, c.campaignId);
        r.expression = { kind: "dice", expression: "D6" };
        r.review = null;
      } else
        throw Error(
          "This unsupported procedure needs its specific Table GM review.",
        );
      r.status = "awaiting_roll";
      audit("recheck");
    } else if (c.operation === "target") {
      if (
        !r ||
        r.procedure !== "forage" ||
        r.status !== "awaiting_roll" ||
        r.savedRollId
      )
        throw Error("Choose food or water before rolling.");
      r.forageTarget = c.target;
      audit("target", "Player chose " + c.target + " before the roll.");
    } else if (c.operation === "artifact") {
      if (
        !r ||
        r.status !== "awaiting_roll" ||
        !r.artifactAllowed ||
        r.expression?.kind !== "pool" ||
        r.expression.artifacts.length
      )
        throw Error("No eligible optional Artifact Die at this timing.");
      r.expression.artifacts = [8];
      audit("artifact", "Quartermaster rank 3 optional D8 authorized.");
    } else if (c.operation === "review") {
      if (!r || !tableGM(repo, c.campaignId, principal).isTableGM)
        throw Error("The actual Table GM must review this procedure.");
      r.review =
        "Table GM review: " +
        c.reason +
        " Mechanical application remains blocked; no unverified success or consequence assumed.";
      r.status = "awaiting_mechanical_review";
      audit("review", c.reason);
    } else {
      if (!r || !r.savedRollId) throw Error("No saved roll for this decision.");
      const card = s.dice?.find((d) => d.id === r!.savedRollId);
      if (!card || card.phase7?.revision !== r.savedRollRevision)
        throw Error("Saved roll revision changed. Inspect the actual binding.");
      rollId = card.id;
      if (c.operation === "push") {
        if (
          r.status !== "awaiting_push_decision" ||
          !r.pushEligible ||
          !canPush(card)
        )
          throw Error("Push is not legal at this timing.");
        rollRules(repo, c.campaignId);
        s = applyDiceCommand(
          s,
          {
            type: "push",
            campaignId: c.campaignId,
            actionId: c.operationId,
            rollId: card.id,
          },
          geo,
          now(),
          die,
        );
        const pushed = s.dice!.find((d) => d.id === card.id)!;
        pushed.phase7!.revision++;
        pushed.phase7!.pushAllowed = false;
        r.savedRollRevision = pushed.phase7!.revision;
        r.interventions.push({
          kind: "push",
          name: "Push",
          willpowerChange: pushed.result.willpower,
          attributeDamage: pushed.result.attributeDamage,
          source: r.sources[0] ?? null,
          operationId: c.operationId,
        });
        if (pushed.result.successes > 0) finalize(repo, r, pushed, s);
        else if (r.talents.length) r.status = "awaiting_talent_decision";
        else finalize(repo, r, pushed, s);
        audit("push");
      } else if (c.operation === "keep") {
        if (r.status !== "awaiting_push_decision")
          throw Error("No pending Push decision.");
        card.phase7!.pushAllowed = false;
        if (r.talents.length) r.status = "awaiting_talent_decision";
        else finalize(repo, r, card, s);
        audit("keep");
      } else if (c.operation === "talent") {
        if (
          !["awaiting_push_decision", "awaiting_talent_decision"].includes(
            r.status,
          ) ||
          card.result.successes > 0
        )
          throw Error("Talent activation is not legal at this timing.");
        const intervention = forestIntervention(
            repo,
            c.campaignId,
            s,
            r.characterId,
            r.activity,
          ),
          index = s.characters.findIndex((ch) => ch.id === r!.characterId),
          sheet = structuredClone(sheetFor(s.characters[index]));
        sheet.willpower = String(intervention.wp - intervention.cost);
        s.characters[index] = applySheet(s.characters[index], sheet);
        r.sources.push(intervention.source);
        r.interventions.push({
          kind: "talent",
          name: "Path of the Forest",
          willpowerChange: -intervention.cost,
          attributeDamage: 0,
          source: intervention.source,
          operationId: c.operationId,
        });
        finalize(repo, r, card, s, true);
        audit(
          "talent",
          "Authorized Path of the Forest rank 1: spend exactly 1 WP.",
        );
      } else if (c.operation === "decline") {
        if (r.status !== "awaiting_talent_decision")
          throw Error("No pending talent decision.");
        finalize(repo, r, card, s);
        audit("decline");
      }
    }
    for (const card of s.dice ?? []) {
      const prior = record.session.dice?.find((d) => d.id === card.id);
      if (
        prior?.phase7 &&
        card.phase7 &&
        !isDeepStrictEqual(prior, card) &&
        prior.phase7.revision === card.phase7.revision
      ) {
        card.phase7.revision++;
        if (r?.savedRollId === card.id) {
          r.savedRollRevision = card.phase7.revision;
          putRequest(repo, r);
        }
      }
    }
    if (!isDeepStrictEqual(s, record.session))
      persistDice(repo, c.campaignId, record.revision, record.session, s);
    db.prepare("INSERT INTO phase7_roll_commands VALUES (?,?,?,?)").run(
      c.campaignId,
      c.operationId,
      fp,
      JSON.stringify({ rollId }),
    );
    db.exec("COMMIT");
    return {
      replayed: false,
      rollId,
      queue: rollQueueView(repo, c.campaignId),
    };
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
