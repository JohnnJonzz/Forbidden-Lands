import { executeActivity } from "../activities/service";
import { currentRoutine } from "../../lib/activities";
import { narrativeState } from "../narrative/state";
import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { activeChatForm, completionFor } from "../../lib/journey/chat-engine";
import { tableGM } from "../narrative/authority";
import { transitions } from "../transitions/service";
import { readFlow, stableId } from "./store";
import { executeQuarterResolution } from "./service";
import { checkFor } from "./director";
export function completionIntent(text: string, quarter: string) {
  const v = text.trim().replace(/[.!]+$/, "");
  if (
    /\?|\b(?:yesterday|last night|used to|maybe|if|can we|could we)\b/i.test(v)
  )
    return null;
  const finish =
    /^(?:(?:please\s+)?return to camp and\s+)?(?:please\s+)?(?:finish|complete|close)\s+(?:(?:this|the|our|current)\s+)*(?:(Morning|Day|Evening|Night)(?:\s+quarter[- ]?day)?|quarter[- ]?day|quarter)$/i.exec(
      v,
    );
  const advance =
    /^(?:please\s+)?advance to (Morning|Day|Evening|Night)$/i.exec(v);
  if (!finish && !advance) return null;
  const quarters = ["Morning", "Day", "Evening", "Night"],
    next = quarters[(quarters.indexOf(quarter) + 1) % 4];
  if (finish?.[1] && finish[1].toLowerCase() !== quarter.toLowerCase())
    return {
      error: `The authoritative quarter is ${quarter}; ${finish[1]} cannot be completed as the current quarter.`,
    };
  if (advance && advance[1].toLowerCase() !== next.toLowerCase())
    return {
      error: `The authoritative quarter is ${quarter}; the next legal transition is ${next}, one quarter only.`,
    };
  return { error: null };
}
export function quarterConversation(
  repo: SqliteCampaignRepository,
  id: string,
  actorId: string,
  requestId: string,
  text: string,
  p: CharacterPrincipal | null,
  die?: (n: number) => number,
) {
  const r = repo.get(id)!;
  const finish = completionIntent(text, r.session.campaign.quarter),
    entryId = activeChatForm(r.session)?.entryId;
  let operation: "complete" | "continue" | "skip" | "waive" | "avoid" | null =
    finish ? "complete" : null;
  if (
    /for testing purposes.*skip this encounter|skip this encounter.*for testing/i.test(
      text,
    )
  )
    operation = "skip";
  else if (/waive (?:the |this )?encounter check.*testing/i.test(text))
    operation = "waive";
  else if (
    /^(?:please )?continue(?: the quarter[- ]?day)?[.!]?$/i.test(text.trim())
  )
    operation = "continue";
  const avoid =
      /^(?:we (?:choose to |will |want to )?)?avoid(?: (?:them|the orcs|the encounter|contact))?[.!]?$/i.test(
        text.trim(),
      ),
    letPass =
      /^(?:we (?:will |choose to )?)?(?:remain (?:at camp|concealed) and )?let (?:them|the orcs|the procession) pass(?: (?:by|without contact))?[.!]?$/i.test(
        text.trim(),
      );
  if (entryId && (avoid || letPass)) operation = "avoid";
  if (!operation) return null;
  // Continue is also used by other gameplay services when no submitted quarter exists.
  if (!entryId)
    return finish
      ? "No submitted quarter is awaiting completion. The authoritative clock is " +
          r.session.campaign.quarter +
          "; assign the next Quarter-Day Activities draft."
      : null;
  if (finish?.error) return finish.error;
  if (operation === "complete" && !tableGM(repo, id, p).isTableGM)
    return "The authenticated Table GM must authorize completion of the current quarter; selecting a character or claiming that role in chat is insufficient.";
  try {
    if (
      !readFlow(repo, id, entryId) &&
      operation === "complete" &&
      currentRoutine(r.session)?.entryId === entryId
    ) {
      executeActivity(
        repo,
        {
          campaignId: id,
          revision: repo.get(id)!.revision,
          requestId,
          actorId,
          operation: "complete",
          entryId,
          confirmed: true,
        },
        p,
      );
      const t = transitions(repo, id).find((t) => t.entryId === entryId);
      return (
        repo
          .get(id)!
          .session.messages.find((m) => m.id === "transition:" + t?.id)?.text ??
        "The saved quarter completed through its existing receipt service."
      );
    }
    if (!readFlow(repo, id, entryId)) {
      if (
        operation === "continue" &&
        narrativeState(repo, id)?.formId === activeChatForm(r.session)?.id
      )
        return null;
      if (operation !== "complete")
        return "Inspect and explicitly adopt this submitted quarter before using assisted encounter decisions.";
      executeQuarterResolution(
        repo,
        {
          campaignId: id,
          entryId,
          actorId,
          requestId: stableId(requestId, "adopt"),
          revision: r.revision,
          operation: "start",
          options: {
            autoComplete: false,
            encounterHandling: "Manual",
            mode: "On foot",
          },
          confirmed: true,
        },
        p,
        die,
      );
    }
    const v = executeQuarterResolution(
      repo,
      {
        campaignId: id,
        entryId,
        actorId,
        requestId,
        revision: repo.get(id)!.revision,
        operation,
        ...(["skip", "waive"].includes(operation)
          ? { reason: text, confirmed: true }
          : {}),
        ...(operation === "avoid" && letPass ? { choice: "let-pass" } : {}),
      },
      p,
      die,
    );
    const completed = completionFor(repo.get(id)!.session, entryId);
    if (completed) {
      const t = transitions(repo, id).find((t) => t.entryId === entryId);
      return (
        repo
          .get(id)!
          .session.messages.find((m) => m.id === "transition:" + t?.id)?.text ??
        "The saved quarter completed once. The authoritative clock is " +
          repo.get(id)!.session.campaign.quarter +
          "."
      );
    }
    const check = checkFor(repo, id, repo.get(id)!.session, entryId),
      outcome =
        operation === "avoid" && check?.resolutionKind === "declined_contact"
          ? "The distant procession passed without contact, as recorded. "
          : "";
    return (
      outcome + (v.flow?.prompt ?? "Saved quarter-day resolution updated.")
    );
  } catch (e) {
    return e instanceof Error ? e.message : "Resolution needs review.";
  }
}
