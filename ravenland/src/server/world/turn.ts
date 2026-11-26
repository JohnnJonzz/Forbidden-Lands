import { aiWorkflowPermit } from "../rulings/ai-policy";
import type { SqliteCampaignRepository } from "../sqlite";
import type { GMTurn } from "../../lib/ai/schema";
import { worldDecisionSchema, type WorldEvent } from "../../lib/world/schema";
import type { CharacterPrincipal } from "../character-access";
import { requireCharacterAccess } from "../character-access";
import { consequenceContext } from "../consequences/context";
import {
  worldContext,
  worldEvents,
  worldHash,
  type WorldChooser,
} from "./context";
import { dispatchWorldAction } from "./dispatcher";
import { AIError } from "../ai/config";
export const WORLD_ACTION_BUDGET = 3;
export async function worldTurn(
  repo: SqliteCampaignRepository,
  c: GMTurn,
  principal: CharacterPrincipal | null,
  choose?: WorldChooser,
  onUsage?: (r: {
    inputTokens: number | null;
    outputTokens: number | null;
    model: string;
  }) => void,
) {
  if (!worldContext(repo, c.campaignId, principal)) return null;
  requireCharacterAccess(principal, c.campaignId, c.characterId);
  const receiptId = "world:" + c.requestId,
    read = (id: string) => {
      const row = repo.db
        .prepare(
          "SELECT result_json FROM consequence_commands WHERE campaign_id=? AND request_id=?",
        )
        .get(c.campaignId, id);
      return row ? JSON.parse(row.result_json as string) : null;
    };
  const saved = read(receiptId);
  if (saved) return saved.worldBoundary as string;
  const summaries: string[] = [];
  const aiPermit = aiWorkflowPermit(repo, c);
  function finish(text?: string) {
    if (text && summaries.at(-1) !== text) summaries.push(text);
    const narration = summaries.join("\n\n");
    repo.db
      .prepare("INSERT OR IGNORE INTO consequence_commands VALUES (?,?,?,?,?)")
      .run(
        c.campaignId,
        receiptId,
        worldHash(c),
        JSON.stringify({ worldBoundary: narration }),
        new Date().toISOString(),
      );
    return narration;
  }
  for (let step = 0; step < WORLD_ACTION_BUDGET; step++) {
    const requestId = receiptId + ":" + step,
      prior = read(requestId)?.worldEvent as WorldEvent | undefined;
    // Resuming after a failed provider/response never chooses again for a committed step.
    if (prior) {
      summaries.push(prior.summary);
      if (
        prior.status !== "completed" ||
        ["departed", "treatment_attempted", "time_recorded"].includes(
          prior.code,
        )
      )
        return finish();
      continue;
    }
    const context = worldContext(repo, c.campaignId, principal);
    if (!context)
      return finish(
        "The source scene changed. No further world action occurred.",
      );
    if (context.reconciliationRequired)
      return finish(
        "Historical NPC narration has no verified world-action receipt. A trusted local controller must reconcile it before the next NPC action. No search, theft or elapsed round has been replayed; the saved injury and deadline remain authoritative.",
      );
    if (context.pending && !aiPermit) return finish(context.pending.summary);
    if (!context.actors.length)
      return finish(
        summaries.length
          ? undefined
          : "No capable GM-controlled NPC is established as present. Existing injuries remain recorded; no helper or rescue was invented.",
      );
    const obligations = consequenceContext(repo, c.campaignId, principal).open,
      urgent = obligations
        .filter((v) => ["life", "mandatory"].includes(v.urgency))
        .map((v) => ({
          id: v.id,
          description: v.description,
          nextProcedure: v.nextProcedure,
        }));
    if (obligations.some((v) => v.status === "awaiting_roll"))
      return finish(
        "A required roll is pending. Resolve it before further world progression.",
      );
    if (!choose) return summaries.length ? finish() : null;
    const result = await choose({
      world: context,
      playerMessage: c.action,
      urgent,
    });
    onUsage?.(result);
    const parsed = worldDecisionSchema.safeParse(result.decision);
    if (!parsed.success)
      throw new AIError(
        "world_decision",
        "The GM world intention failed validation. No additional world action occurred.",
        502,
      );
    if (!parsed.data.action)
      return finish(
        summaries.length
          ? undefined
          : "The GM reached a scene boundary. No additional NPC action or elapsed time was verified. Resolve the visible player decision, roll or adjudication before continuing.",
      );
    const held = context.pending
      ? worldEvents(repo, c.campaignId).find(
          (v) => v.requestId === context.pending!.requestId,
        )?.intent
      : null;
    if (
      held &&
      !(
        aiPermit &&
        held.kind === "interact" &&
        (!process.env.RAVENLAND_AI_RULINGS ||
          process.env.RAVENLAND_AI_RULINGS === "enabled") &&
        repo.db
          .prepare("SELECT routine_ai FROM gm_policy WHERE campaign_id=?")
          .get(c.campaignId)?.routine_ai !== 0
      ) &&
      [
        "kind",
        "actorId",
        "targetId",
        "itemRef",
        "destination",
        "interaction",
      ].every(
        (k) =>
          (held as unknown as Record<string, unknown>)[k] ===
          (parsed.data.action as unknown as Record<string, unknown>)[k],
      )
    )
      return finish(context.pending!.summary);
    const event = dispatchWorldAction(
      {
        type: "propose",
        campaignId: c.campaignId,
        characterId: c.characterId,
        requestId,
        sceneId: context.sceneId,
        expectedState: context.state,
        action: parsed.data.action,
      },
      repo,
      principal,
      undefined,
      aiPermit,
    );
    summaries.push(event.summary);
    if (
      event.status !== "completed" ||
      ["departed", "treatment_attempted", "time_recorded"].includes(event.code)
    )
      return finish();
  }
  return finish(
    "The GM action budget is reached. No further world action or time was recorded in this response.",
  );
}
