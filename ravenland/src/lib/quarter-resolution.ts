import { z } from "zod";
import type { Session } from "./types";
export const encounterHandlingSchema = z.enum([
  "AI GM Assisted",
  "Table GM Review",
  "Manual",
]);
export const assistedSubmissionSchema = z
  .object({
    autoComplete: z.boolean(),
    encounterHandling: encounterHandlingSchema,
    mode: z.enum(["On foot", "Mounted"]),
  })
  .strict();
export const activityOutcomeSchema = z
  .object({
    id: z.string().uuid(),
    entryId: z.string().uuid(),
    assignmentId: z.string(),
    characterId: z.string(),
    scope: z.string(),
    rollId: z.string().uuid().nullable(),
    rawSuccesses: z.number().int().nonnegative().nullable(),
    finalSuccesses: z.number().int().nonnegative(),
    source: z.enum(["talent", "table_gm_ruling"]),
    reference: z.string(),
    wpCost: z.number().int().nonnegative(),
    reason: z.string().min(1).max(1600),
    actorId: z.string(),
    at: z.string().datetime(),
  })
  .strict();
export type ActivityOutcome = z.infer<typeof activityOutcomeSchema>;
export function outcomeFor(
  s: Session,
  entryId: string,
  characterId: string,
  rollId: string | null,
  scope?: string,
) {
  return s.activityOutcomes?.find(
    (o) =>
      o.entryId === entryId &&
      o.characterId === characterId &&
      o.rollId === rollId &&
      (!scope || o.scope === scope),
  );
}
export const resolutionStatuses = [
  "Ready to resolve",
  "Awaiting roll",
  "Awaiting player decision",
  "Awaiting Table GM ruling",
  "Encounter interruption",
  "Mechanically complete",
  "Quarter completed",
] as const;
