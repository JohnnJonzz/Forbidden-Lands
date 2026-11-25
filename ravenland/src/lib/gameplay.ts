import { z } from "zod";
const id = z.string().uuid();
export const stationaryActivities = [
  "Make Camp",
  "Forage",
  "Hunt",
  "Keep Watch",
  "Rest",
  "Sleep",
  "Cook",
  "Other",
] as const;
export const assignmentSchema = z
  .object({
    characterId: z.string().min(1).max(100),
    activity: z.enum(stationaryActivities),
    description: z.string().trim().max(500).default(""),
  })
  .strict();
export const clockRefSchema = z
  .object({
    date: z.string(),
    quarter: z.enum(["Morning", "Day", "Evening", "Night"]),
    hex: z.string(),
    elapsedQuarters: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const obligationSchema = z
  .object({
    id,
    kind: z.enum(["plan_choice", "milestone_capability"]),
    question: z.string().min(1).max(1000),
    characterIds: z.array(z.string()).max(20),
    status: z.literal("pending"),
  })
  .strict();
// 7.0A cannot contain manufactured rolls, effects, outcomes or completion receipts.
// Later milestones must implement their typed operations before expanding this schema version.
export const gameplayStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    campaignId: id,
    revision: z.number().int().positive(),
    clockRef: clockRefSchema,
    status: z.enum(["clarification", "planned"]),
    intent: z.string().max(3000),
    assignments: z.array(assignmentSchema).max(20),
    obligations: z.array(obligationSchema).max(25),
    procedures: z.array(z.never()).length(0),
    rollRequests: z.array(z.never()).length(0),
    savedRollIds: z.array(z.never()).length(0),
    mechanicalEffects: z.array(z.never()).length(0),
    encounters: z.array(z.never()).length(0),
    outcomes: z.array(z.never()).length(0),
    completionAuthorization: z.literal("not_granted"),
    transitionReceipt: z.null(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type GameplayState = z.infer<typeof gameplayStateSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
const envelope = {
  campaignId: id,
  actorId: z.string().min(1).max(100),
  operationId: id,
  campaignRevision: z.number().int().positive(),
  activityRevision: z.number().int().positive().nullable(),
};
export const gameplayCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...envelope,
      type: z.literal("declare"),
      text: z.string().trim().min(1).max(3000),
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("plan"),
      assignments: z.array(assignmentSchema).min(1).max(20),
    })
    .strict(),
]);
export type GameplayCommand = z.infer<typeof gameplayCommandSchema>;
export const phase7Baseline = "41a274aeb15e66aeb86c7eff3f4a8322084fa15d";
export const phase7Capability =
  "Roll resolution arrives in 7.0B; mechanical completion and time advancement are not enabled in 7.0A.";

export const gameplayAnswerSchema = z
  .object({
    status: z.enum(["clarification", "planned"]),
    activityId: z.string().uuid().optional(),
    text: z.string(),
  })
  .strict();
export type GameplayAnswer = z.infer<typeof gameplayAnswerSchema>;
