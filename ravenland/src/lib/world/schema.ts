import { z } from "zod";
const ref = z.string().min(1).max(160);
export const worldIntentSchema = z
  .object({
    kind: z.enum([
      "observe",
      "search",
      "transfer",
      "move",
      "interact",
      "assist",
      "advance_time",
    ]),
    actorId: ref,
    targetId: ref.nullable(),
    itemRef: ref.nullable(),
    destination: z.enum(["near", "depart"]).nullable(),
    interaction: z.enum(["speak", "signal"]).nullable(),
    intent: z.string().min(1).max(1000),
  })
  .strict();
export type WorldIntent = z.infer<typeof worldIntentSchema>;
// The chooser cannot supply duration, success, evidence, authority or state edits.
export const worldDecisionSchema = z
  .object({
    action: worldIntentSchema.nullable(),
    boundary: z.string().max(500),
  })
  .strict();
export const durationSchema = z
  .object({
    unit: z.enum([
      "rounds",
      "minutes",
      "hours",
      "days",
      "quarter_days",
      "journey",
    ]),
    amount: z.number().int().min(0).max(10000),
  })
  .strict();
export const worldCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("propose"),
      campaignId: z.string().uuid(),
      characterId: ref,
      requestId: ref,
      sceneId: ref,
      expectedState: ref,
      action: worldIntentSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("adjudicate"),
      campaignId: z.string().uuid(),
      characterId: ref,
      requestId: z.string().uuid(),
      pendingId: ref,
      expectedState: ref,
      decision: z.enum(["approve", "decline"]),
      duration: durationSchema.nullable(),
      reason: z.string().min(1).max(1000),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("reconcile"),
      campaignId: z.string().uuid(),
      characterId: ref,
      requestId: z.string().uuid(),
      sceneId: ref,
      expectedState: ref,
      reason: z.string().min(1).max(1000),
      confirmed: z.literal(true),
    })
    .strict(),
]);
export type WorldCommand = z.infer<typeof worldCommandSchema>;
export type Duration = z.infer<typeof durationSchema>;
export interface WorldEvent {
  requestId: string;
  campaignId: string;
  sceneId: string;
  state: string;
  actorId: string | null;
  targetId: string | null;
  intent: WorldIntent | null;
  status:
    | "completed"
    | "awaiting_player_input"
    | "awaiting_verified_roll"
    | "awaiting_adjudication"
    | "blocked";
  code: string;
  summary: string;
  elapsed: Duration | null;
  linkedConsequences: string[];
  evidence: string[];
  affectedPossessions: never[];
  createdAt: string;
  pendingId?: string;
  replayed?: boolean;
}

export type WorldDecision = z.infer<typeof worldDecisionSchema>;
