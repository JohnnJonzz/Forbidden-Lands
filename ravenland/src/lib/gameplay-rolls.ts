import { z } from "zod";
const id = z.string().uuid();
export const sourceSchema = z.object({
  documentId: id,
  chunkId: z.string(),
  page: z.number(),
  title: z.string(),
});
export const poolSchema = z
  .object({
    kind: z.literal("pool"),
    attribute: z.enum(["strength", "agility", "wits", "empathy"]),
    skill: z.string().min(1).max(100),
    base: z.number().int().min(0).max(100),
    skillDice: z.number().int().min(-100).max(100),
    gear: z.number().int().min(0).max(100),
    artifacts: z
      .array(z.union([z.literal(8), z.literal(10), z.literal(12)]))
      .max(4),
  })
  .strict();
export const diceSpecSchema = z.union([
  poolSchema,
  z
    .object({ kind: z.literal("dice"), expression: z.string().max(100) })
    .strict(),
]);
export type DiceSpec = z.infer<typeof diceSpecSchema>;
export const rollRequestSchema = z
  .object({
    id,
    campaignId: id,
    activityId: id,
    characterId: z.string(),
    activity: z.string(),
    procedure: z.enum([
      "camp",
      "forage",
      "watch",
      "forage-mishap",
      "forage-duration",
      "unsupported",
    ]),
    forageTarget: z.enum(["food", "water"]).nullable().default(null),
    generation: z.number().int().nonnegative(),
    dependencyId: id.nullable(),
    expression: diceSpecSchema.nullable(),
    modifiers: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
        source: sourceSchema.nullable(),
      }),
    ),
    sources: z.array(sourceSchema),
    pushEligible: z.boolean(),
    artifactAllowed: z.boolean(),
    talents: z.array(z.string()),
    interventions: z
      .array(
        z.object({
          kind: z.enum(["push", "talent"]),
          name: z.string(),
          willpowerChange: z.number().int(),
          attributeDamage: z.number().int().nonnegative(),
          source: sourceSchema.nullable(),
          operationId: id,
        }),
      )
      .default([]),
    status: z.enum([
      "awaiting_roll",
      "awaiting_push_decision",
      "awaiting_talent_decision",
      "awaiting_followup_roll",
      "awaiting_mechanical_review",
      "resolved",
      "superseded",
    ]),
    savedRollId: id.nullable(),
    savedRollRevision: z.number().int().positive().nullable(),
    raw: z
      .object({
        successes: z.number().nullable(),
        faces: z.array(z.number()),
        total: z.number().nullable(),
      })
      .nullable(),
    final: z
      .object({
        outcome: z.enum(["success", "failure", "determined"]),
        successes: z.number().nullable(),
        summary: z.string(),
        pending: z.array(
          z.object({
            kind: z.string(),
            description: z.string(),
            durationDays: z.number().nullable(),
            durablyApplied: z.literal(false),
          }),
        ),
      })
      .nullable(),
    review: z.string().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    audit: z.array(
      z.object({
        operationId: id,
        actorId: z.string(),
        action: z.string(),
        reason: z.string(),
        at: z.string(),
      }),
    ),
  })
  .strict();
export type RollRequest = z.infer<typeof rollRequestSchema>;
const command = {
  campaignId: id,
  runId: z.string().uuid().optional(),
  activityId: id,
  actorId: z.string().min(1).max(100),
  operationId: id,
  requestId: id.nullable(),
  revision: z.number().int().positive().nullable(),
};
export const rollCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...command,
      operation: z.literal("roll"),
      rollId: id.optional(),
      expression: diceSpecSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...command,
      operation: z.enum([
        "push",
        "keep",
        "talent",
        "decline",
        "artifact",
        "recheck",
      ]),
    })
    .strict(),
  z
    .object({
      ...command,
      operation: z.literal("target"),
      target: z.enum(["food", "water"]),
    })
    .strict(),
  z
    .object({
      ...command,
      operation: z.literal("link"),
      rollId: id,
      rollRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...command,
      operation: z.literal("correct"),
      previewHash: z.string().length(64),
      reason: z.string().trim().min(12).max(1000),
    })
    .strict(),
  z
    .object({
      ...command,
      operation: z.literal("review"),
      reason: z.string().trim().min(12).max(1000),
    })
    .strict(),
]);
export type RollCommand = z.infer<typeof rollCommandSchema>;
export function parseExpression(raw: string) {
  const text = raw.replace(/\s/g, "").toUpperCase();
  if (text === "D66" || text === "1D66")
    return {
      expression: "D66",
      terms: [{ count: 2, sides: 6, sign: 1 }],
      constant: 0,
      d66: true,
    };
  if (!/^(?:\d{0,3}D\d{1,4})(?:[+-](?:\d{0,3}D\d{1,4}|\d{1,5}))*$/.test(text))
    throw Error("Use a dice expression such as D6, 2D8+1, 2D6+1D8 or D66.");
  const terms: { count: number; sides: number; sign: number }[] = [],
    parts = text.match(/[+-]?[^+-]+/g)!,
    constants: number[] = [];
  for (const part of parts) {
    const m = /^([+-]?)(\d*)D(\d+)$/.exec(part);
    if (m) {
      const count = Number(m[2] || 1),
        sides = Number(m[3]);
      if (sides === 66)
        throw Error(
          "D66 uses two D6 digits and must be rolled as D66 or 1D66, never as a 66-sided die.",
        );
      if (count < 1 || count > 100 || sides < 2 || sides > 1000)
        throw Error("Dice limits: 1–100 dice, 2–1000 sides.");
      terms.push({ count, sides, sign: m[1] === "-" ? -1 : 1 });
    } else constants.push(Number(part));
  }
  if (terms.reduce((n, t) => n + t.count, 0) > 100)
    throw Error("At most 100 dice per roll.");
  return {
    expression:
      terms
        .map(
          (t, i) =>
            (t.sign < 0 ? "-" : i ? "+" : "") +
            (t.count === 1 ? "" : t.count) +
            "D" +
            t.sides,
        )
        .join("") +
      (constants.reduce((a, b) => a + b, 0) > 0 ? "+" : "") +
      (constants.reduce((a, b) => a + b, 0) || ""),
    terms,
    constant: constants.reduce((a, b) => a + b, 0),
    d66: false,
  };
}
