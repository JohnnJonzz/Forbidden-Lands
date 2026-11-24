import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { activeChatForm } from "../../lib/journey/chat-engine";
import { readFlow } from "./store";
import { executeQuarterResolution } from "./service";
export function quarterConversation(
  repo: SqliteCampaignRepository,
  id: string,
  actorId: string,
  requestId: string,
  text: string,
  p: CharacterPrincipal | null,
) {
  const r = repo.get(id)!,
    entryId = activeChatForm(r.session)?.entryId;
  if (!entryId || !readFlow(repo, id, entryId)) return null;
  let operation: "complete" | "continue" | "skip" | "waive" | null = null;
  if (
    /for testing purposes.*skip this encounter|skip this encounter.*for testing/i.test(
      text,
    )
  )
    operation = "skip";
  else if (/waive (?:the |this )?encounter check.*testing/i.test(text))
    operation = "waive";
  else if (
    /^(?:please )?(?:finish|complete) (?:this|the) quarter[- ]day[.!]?$/i.test(
      text.trim(),
    )
  )
    operation = "complete";
  else if (
    /^(?:please )?continue(?: the quarter[- ]day)?[.!]?$/i.test(text.trim())
  )
    operation = "continue";
  if (!operation) return null;
  try {
    const v = executeQuarterResolution(
      repo,
      {
        campaignId: id,
        entryId,
        actorId,
        requestId,
        revision: r.revision,
        operation,
        ...(["skip", "waive"].includes(operation)
          ? { reason: text, confirmed: true }
          : {}),
      },
      p,
    );
    return v.flow?.prompt ?? "Saved quarter-day resolution updated.";
  } catch (e) {
    return e instanceof Error ? e.message : "Resolution needs review.";
  }
}
