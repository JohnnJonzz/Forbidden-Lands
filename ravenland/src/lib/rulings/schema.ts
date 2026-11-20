import { z } from "zod";
const ref = z.string().min(1).max(160),
  text = z.string().trim().min(1).max(1600);
export const rulingDomains = [
  "weapon_repair",
  "routine_action",
  "duration",
  "scene_access",
  "healing_rule",
  "rules_conflict",
  "item_transfer",
  "time_conversion",
  "consequence_review",
] as const;
export const effectSchema = z.discriminatedUnion("type", [
 z.object({type:z.literal("travel_house_rule"),ruleId:z.string().uuid(),revision:z.number().int().positive(),allowance:z.number().int().min(1).max(3),terrain:z.literal("Forest"),mode:z.literal("On foot")}).strict(),
 z.object({type:z.literal("journey_allowance"),entryId:z.string().uuid(),allowance:z.number().int().min(1).max(3)}).strict(),
 z.object({type:z.literal("weapon_repair"),characterId:ref,weaponIndex:z.number().int().nonnegative(),rollId:ref,before:z.number().int().nonnegative(),after:z.number().int().nonnegative(),repairLimit:z.number().int().nonnegative()}).strict(),
  z
    .object({
      type: z.literal("routine_action"),
      actorId: ref,
      targetId: ref.nullable(),
      kind: z.enum(["observe", "interact", "search"]),
      basis: z.enum([
        "visible_scene",
        "bounded_speech",
        "accessible_broken_target",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("duration"),
      pendingId: ref,
      unit: z.enum(["rounds", "minutes", "hours", "days"]),
      amount: z.number().int().min(0).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene_access"),
      consequenceId: ref,
      healerId: ref,
      safe: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("healing_rule"),
      consequenceId: ref,
      rules: z
        .array(
          z.object({ id: ref, revision: z.number().int().positive() }).strict(),
        )
        .min(1)
        .max(20),
      interpretation: z.literal("official_in_this_scope"),
    })
    .strict(),
  z
    .object({
      type: z.literal("consequence_review"),
      consequenceId: ref,
      decision: z.enum(["retain_mechanics", "supersede_question"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("time_conversion"),
      timeEventId: ref,
      consequenceId: ref,
      unit: z.enum(["rounds", "hours", "days"]),
      amount: z.number().int().nonnegative().max(10000),
    })
    .strict(),
]);
export type RulingEffect = z.infer<typeof effectSchema>;
export const rulingSchema = z
  .object({
    id: ref,
    campaignId: z.string().uuid(),
    sceneId: ref.nullable(),
    originId: ref,
    consequenceId: ref.nullable(),
    domain: z.enum(rulingDomains),
    question: text,
    facts: z.array(z.string().max(1600)).max(40),
    sources: z.array(ref).max(40),
    decision: text.nullable(),
    reasoning: z.string().max(1600),
    scope: z.object({ key: ref, fingerprint: ref }).strict(),
    authority: z.enum(["A", "B", "C"]),
    decisionMaker: z
      .object({
        kind: z.enum(["ai_workflow", "human_controller", "deterministic"]),
        id: ref,
      })
      .strict(),
    effects: z.array(effectSchema).max(5),
    risk: z.enum(["routine", "bounded", "protected"]),
    status: z.enum([
      "proposed",
      "accepted",
      "applied",
      "rejected",
      "awaiting_review",
      "superseded",
      "invalidated",
    ]),
    blockingReason: z.string().max(1600),
    resolutionTypes: z.array(z.string().max(100)).max(10),
    requestId: ref.nullable(),
    receiptId: ref.nullable(),
    revision: z.number().int().nonnegative(),
    history: z.array(
      z
        .object({
          status: z.string(),
          at: z.string(),
          reason: z.string().max(1600),
        })
        .strict(),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type GMRuling = z.infer<typeof rulingSchema>;
export const rulingCommandSchema = z
  .object({
    campaignId: z.string().uuid(),
    characterId: ref,
    requestId: z.string().uuid(),
    rulingId: ref,
    revision: z.number().int().positive(),
    expectedScope: ref,
    reason: z.string().trim().min(1).max(1000),
    decision: z.enum(["apply", "reject"]),
    effect: effectSchema.nullable(),
    confirmed: z.literal(true),
  })
  .strict();
