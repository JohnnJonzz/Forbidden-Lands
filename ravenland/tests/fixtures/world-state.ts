import { randomUUID } from "node:crypto";
import { initialSession } from "../../src/lib/mock";
import { SqliteCampaignRepository } from "../../src/server/sqlite";
import { createEncounter } from "../../src/server/combat/engine";
import { saveCombat } from "../../src/server/combat/store";
import {
  newConsequence,
  saveConsequence,
} from "../../src/server/consequences/store";
import { nextConsequenceStep } from "../../src/server/consequences/registry";
import { worldContext } from "../../src/server/world/context";
import type { EnemyTemplate } from "../../src/lib/combat/types";
import type { WorldIntent } from "../../src/lib/world/schema";
// Equivalent persisted state, never an operation against the live campaign.
export function worldFixture(
  filename = ":memory:",
  provided?: SqliteCampaignRepository,
) {
  const repo = provided ?? new SqliteCampaignRepository(filename),
    s = structuredClone(initialSession);
  s.messages = [];
  s.campaign.location = "Muddy road outside The Hollow Watch";
  s.characters[0].name = "Edrus Braveheart";
  s.characters[0].sheet = {
    "attr-strength": "0",
    "attr-strength-regular": "4",
    "attr-agility": "3",
    "attr-wits": "3",
    "attr-empathy": "3",
    gear: [{ item: "Silver ring", quantity: "1" }],
  };
  const r = repo.create(s),
    player = r.session.characters[0],
    foe: EnemyTemplate = {
      name: "Bandit",
      kind: "humanoid",
      origin: "generated",
      attributes: { strength: 3, agility: 3, wits: 3, empathy: 3 },
      skills: {},
      weapons: [],
      armor: 0,
      helmet: 0,
      naturalArmor: false,
      shield: 0,
      talents: [],
      movement: null,
      attacks: [],
      specialRules: [],
      sources: [],
      notes: [],
    },
    e = createEncounter(r.id, s, [foe], "Arm", () => 1, [player.id]);
  const actor = e.combatants.find((a) => a.side === "enemy")!,
    patient = e.combatants.find((a) => a.side === "player")!;
  patient.broken = true;
  patient.current.strength = 0;
  patient.brokenProcedures = [
    {
      id: randomUUID(),
      attribute: "strength",
      active: true,
      cause: "slash",
      stage: "resolved",
      openedAt: new Date().toISOString(),
      rollId: "critical64",
      value: 64,
      note: "Saved Slit Throat",
      sources: [],
    },
  ];
  e.sceneDescription =
    "One bandit survived; established motive: robbery. No companion present.";
  e.status = "ended";
  e.endedAt = new Date().toISOString();
  saveCombat(repo, e);
  const p = patient.brokenProcedures[0],
    injury = newConsequence(
      r.id,
      { kind: "combat_injury", id: p.id, encounterId: e.id, procedureId: p.id },
      "lethal_injury",
      "Edrus has saved Slit Throat, D66 64.",
    );
  injury.visibility = "Party Known";
  injury.characterIds = [patient.id];
  injury.npcIds = [actor.id];
  injury.state.deadline = {
    unit: "rounds",
    dice: 1,
    modifier: -1,
    value: 4,
    rollId: "saved-deadline-four",
    elapsed: 0,
    observedRound: e.round,
    clockDate: s.campaign.date,
    clockQuarter: s.campaign.quarter,
    clockReviewRequired: false,
  };
  nextConsequenceStep(injury);
  saveConsequence(repo, injury);
  const aftermath = newConsequence(
    r.id,
    { kind: "combat_outcome", id: e.id, encounterId: e.id, procedureId: null },
    "aftermath",
    "The robbery aftermath remains unresolved.",
  );
  aftermath.visibility = "Party Known";
  aftermath.characterIds = [patient.id];
  aftermath.npcIds = [actor.id];
  saveConsequence(repo, aftermath);
  const principal = {
      playerId: "owner",
      mode: "trusted-local" as const,
      grants: [{ campaignId: r.id, characterIds: [patient.id] }],
    },
    context = () => worldContext(repo, r.id, principal)!,
    action = (
      kind: WorldIntent["kind"],
      extra: Partial<WorldIntent> = {},
    ): WorldIntent => ({
      kind,
      actorId: actor.id,
      targetId: patient.id,
      itemRef: null,
      destination: null,
      interaction: null,
      intent: "The bandit pursues his robbery objective.",
      ...extra,
    }),
    propose = (
      kind: WorldIntent["kind"],
      extra: Partial<WorldIntent> = {},
    ) => ({
      type: "propose" as const,
      campaignId: r.id,
      characterId: patient.id,
      requestId: randomUUID(),
      sceneId: e.id,
      expectedState: context().state,
      action: action(kind, extra),
    });
  return {
    repo,
    r,
    e,
    actor,
    patient,
    injury,
    aftermath,
    principal,
    context,
    action,
    propose,
  };
}
// Synthetic adapter evidence for unit tests only. Real-PDF tests use the original uploads.
export function syntheticWorldRules(
  repo: SqliteCampaignRepository,
  campaignId: string,
) {
  const handbook =
    "ten cards, numbered 1 through 10. Number 1 acts first. one slow action and one fast action, or two fast actions. defender must declare DODGE or PARRY before you roll. SLASH: STAB: GRAPPLE: SHOOT: Slow action MARKSMANSHIP. For every additional success damage increases by one. Every x x you roll decreases the damage by one. Natural armor is not degraded. attribute score reaches zero, Broken. To succeed with your action, you must roll at least one six. A six is called a success. If your critical injury is listed as LETHAL, you need a successful HEALING roll before the time indicated has passed. Each person trying to HEAL you can only roll once. yourself a -2 penalty. HEALING (EMPATHY) slow action. slow action, but cannot be performed with an enemy at ARM’S LENGTH. ROLLS WITHOUT SKILL simply roll your Base Dice and any applicable Gear Dice.";
  for (const [title, text] of [
    ["Player's Handbook", handbook],
    [
      "Gamemaster's Guide",
      "monster attack is a slow action and cannot be pushed. monster attacks can’t be PARRIED but can be DODGED.",
    ],
  ]) {
    const id = randomUUID();
    repo.db
      .prepare(
        "INSERT INTO source_documents(id,campaign_id,title,original_filename,file_size,sha256,storage_key,page_count,uploaded_at,status,category,visibility) VALUES (?,?,?,?,?,?,?,?,?,'Indexed','Rules','GM Only')",
      )
      .run(
        id,
        campaignId,
        title,
        id + ".pdf",
        1,
        id,
        id,
        1,
        new Date().toISOString(),
      );
    repo.db
      .prepare(
        "INSERT INTO source_chunks(id,document_id,sequence,start_page,end_page,text,heading) VALUES (?,?,0,1,1,?,NULL)",
      )
      .run(randomUUID(), id, text);
  }
}
