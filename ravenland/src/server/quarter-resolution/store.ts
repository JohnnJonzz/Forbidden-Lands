import { z } from "zod";
import { createHash } from "node:crypto";
import type { SqliteCampaignRepository } from "../sqlite";
import {
  assistedSubmissionSchema,
  resolutionStatuses,
} from "../../lib/quarter-resolution";
export const flowSchema = assistedSubmissionSchema
  .extend({
    entryId: z.string().uuid(),
    controllerId: z.string(),
    actorId: z.string(),
    status: z.enum(resolutionStatuses),
    prompt: z.string(),
    revision: z.number().int(),
    steps: z.array(z.string()).max(100),
    kept: z.array(z.string().uuid()).max(100),
    selected: z.record(z.string(), z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Flow = z.infer<typeof flowSchema>;
export const stableId = (...v: string[]) => {
  const h = createHash("sha256").update(v.join(":")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function readFlow(
  repo: SqliteCampaignRepository,
  id: string,
  entryId: string,
) {
  const row = repo.db
    .prepare(
      "SELECT state_json FROM quarter_resolution_flows WHERE campaign_id=? AND entry_id=?",
    )
    .get(id, entryId);
  return row ? flowSchema.parse(JSON.parse(String(row.state_json))) : null;
}
export function saveFlow(repo: SqliteCampaignRepository, id: string, f: Flow) {
  f.revision++;
  f.updatedAt = new Date().toISOString();
  repo.db
    .prepare(
      "INSERT INTO quarter_resolution_flows VALUES (?,?,?) ON CONFLICT(campaign_id,entry_id) DO UPDATE SET state_json=excluded.state_json",
    )
    .run(id, f.entryId, JSON.stringify(flowSchema.parse(f)));
}
