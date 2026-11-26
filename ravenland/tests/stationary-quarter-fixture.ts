import { randomUUID } from "node:crypto";
import type { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { executeJourney } from "../src/server/journey/service";
import { executeActivity } from "../src/server/activities/service";
import { executeDice } from "../src/server/dice/service";
import { applyDiceCommand } from "../src/lib/dice/engine";
import { activeChatForm } from "../src/lib/journey/chat-engine";
import { executeQuarterResolution } from "../src/server/quarter-resolution/service";
export function stationaryFixture(
  repo: SqliteCampaignRepository,
  sourceId: string,
) {
  const s = structuredClone(initialSession);
  Object.assign(s.campaign, {
    name: "Isolated Phase 6.8f.1 V09 Evening",
    hex: "V09",
    location: "V09",
    terrain: "Dark Forest",
    date: "13th Springrise, 1165",
    quarter: "Evening",
    weather: "Established clear weather",
  });
  s.messages = [];
  s.journal = [];
  s.characters.forEach((c, i) => {
    c.name = ["Grogahx", "Edrus", "Elyanna", "Rose Underbough"][i];
    c.sheet = {
      ...Object.fromEntries(
        ["strength", "agility", "wits", "empathy"].flatMap((a) => [
          [`attr-${a}`, "3"],
          [`attr-${a}-regular`, "3"],
        ]),
      ),
      weapons: [],
      gear: [],
      talents: [],
      willpower: "3",
      "skill-survival": "2",
      "skill-scouting": "2",
      "skill-move": "0",
      "res-food": "D8",
      "res-water": "D8",
    };
  });
  const r = repo.create(s),
    id = r.id,
    actor = s.characters[0].id,
    current = () => repo.get(id)!;
  repo.db
    .prepare(
      "INSERT INTO campaign_sourcebooks (campaign_id,document_id) SELECT ?,id FROM source_documents WHERE campaign_id=?",
    )
    .run(id, sourceId);
  const principal = {
    playerId: "trusted-local",
    mode: "trusted-local" as const,
    grants: [{ campaignId: id, characterIds: s.characters.map((c) => c.id) }],
  };
  const journey = (values: object) =>
    executeJourney(
      {
        campaignId: id,
        revision: current().revision,
        actionId: randomUUID(),
        ...values,
      },
      repo,
    );
  journey({ type: "quarter-chat-request" });
  const form = activeChatForm(current().session)!;
  journey({
    type: "quarter-chat-submit",
    formId: form.id,
    actorId: actor,
    routineActivities: true,
    draft: {
      ...form.draft,
      traveling: false,
      assignments: form.draft.assignments.map((a, i) => ({
        ...a,
        activity: ["Forage", "Make Camp", "Sleep", "Keep Watch"][i],
        skill: "No roll",
        outcome: "",
      })),
    },
  });
  const entryId = activeChatForm(current().session)!.entryId!,
    activities = () =>
      current().session.activityState!.entries.find(
        (e) => e.entryId === entryId,
      )!.activities;
  const activity = (operation: string, i: number, extra: object = {}) =>
    executeActivity(
      repo,
      {
        campaignId: id,
        revision: current().revision,
        requestId: randomUUID(),
        actorId: actor,
        confirmed: true,
        operation,
        assignmentId: activities()[i].assignmentId,
        ...extra,
      },
      principal,
    );
  const roll = (i: number, success = true, face = 3) => {
    const req = activities()[i].request!;
    if (!req) throw Error("No requested roll for " + i);
    const rollId = randomUUID(),
      n = req.skillDice + req.modifier,
      utility = req.utility
        ? { kind: "Procedure", sides: 6, faces: [face] }
        : null;
    executeDice(
      {
        campaignId: id,
        actionId: randomUUID(),
        type: "create",
        expectedActivityContext: req.context,
        roll: {
          id: rollId,
          characterId: req.characterId,
          skill: req.skill,
          attribute: req.utility
            ? []
            : Array.from({ length: req.base }, (_, j) =>
                success && j === 0 ? 6 : 2,
              ),
          skillDice: Array(Math.abs(n)).fill(2),
          negativeSkill: n < 0,
          gear: Array(req.gear).fill(2),
          artifacts: [],
          successes: req.utility ? 0 : success ? 1 : 0,
          pushed: false,
          attributeDamage: 0,
          gearDamage: 0,
          willpower: 0,
          quarterDayId: null,
          requestId: null,
        },
        metadata: {
          attribute: req.attribute,
          isArmor: false,
          weaponIndex: null,
          weaponDamage: null,
          ...(utility ? { utility } : {}),
        },
      },
      repo,
      principal,
    );
    return rollId;
  };
  roll(1);
  activity("configure", 0, { season: "Spring" });
  activity("prepare", 0, { target: "food" });
  roll(0, false);
  activity("keep", 0);
  const mishap = roll(0, false, 3);
  const moveId = randomUUID(),
    record = current();
  let changed = applyDiceCommand(
    record.session,
    {
      type: "create",
      campaignId: id,
      actionId: randomUUID(),
      roll: {
        id: moveId,
        characterId: actor,
        skill: "Move",
        attribute: [1, 2, 3],
        skillDice: [],
        negativeSkill: false,
        gear: [],
        artifacts: [],
        successes: 0,
        pushed: false,
        attributeDamage: 0,
        gearDamage: 0,
        willpower: 0,
        quarterDayId: null,
        requestId: null,
      },
      metadata: {
        attribute: "agility",
        isArmor: false,
        weaponIndex: null,
        weaponDamage: null,
      },
    },
    { lookup: () => null, adjacent: () => false, calibrated: false },
    new Date().toISOString(),
    () => 2,
  );
  let face = 0;
  changed = applyDiceCommand(
    changed,
    { type: "push", campaignId: id, actionId: randomUUID(), rollId: moveId },
    { lookup: () => null, adjacent: () => false, calibrated: false },
    new Date().toISOString(),
    () => (face++ === 0 ? 6 : 2),
  );
  changed.dice!.find((d) => d.id === moveId)!.status = "Submitted";
  changed.dice!.find((d) => d.id === moveId)!.submittedAt =
    new Date().toISOString();
  repo.update(id, record.revision, changed);
  activity("watch-threat", 3, {
    reason:
      "The actual distant orc procession requires the printed straight Scouting detection procedure.",
  });
  const scouting = roll(3);
  let call = 0;
  const start = executeQuarterResolution(
    repo,
    {
      campaignId: id,
      entryId,
      actorId: actor,
      revision: current().revision,
      requestId: randomUUID(),
      operation: "start",
      confirmed: true,
      options: {
        autoComplete: false,
        encounterHandling: "AI GM Assisted",
        mode: "On foot",
      },
    },
    principal,
    () => [5, 1][call++] ?? 1,
  );
  return {
    id,
    entryId,
    actor,
    principal,
    current,
    activities,
    activity,
    roll,
    mishap,
    moveId,
    scouting,
    start,
  };
}
