import { checkFor } from "./director";
import { activeChatForm } from "../../lib/journey/chat-engine";
import { navigationContext } from "../../lib/journey/expedition";
import { mechanicalCharacter } from "../mechanical-character";
import type { SqliteCampaignRepository } from "../sqlite";
import { readFlow, stableId } from "./store";
import { pathfinder } from "./talents";
export function requestedNavigationRoll(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
) {
  const s = repo.get(id)?.session;
  if (!s) return null;
  const entryId = activeChatForm(s)?.entryId,
    ctx = navigationContext(s);
  if (
    !entryId ||
    !readFlow(repo, id, entryId) ||
    !ctx ||
    ctx.characterId !== actor ||
    s.dice?.some((d) => d.journeyContext?.checkId === ctx.checkId)
  )
    return null;
  const ch = mechanicalCharacter(s.characters.find((c) => c.id === actor)!),
    base = ch.attributes.wits.current,
    skill = ch.skills["skill-survival"];
  if (base === null || skill === null) return null;
  const talent = pathfinder(repo, id, s, actor);
  return {
    context: ctx,
    label: "Survival",
    purpose: "Lead the Way",
    attribute: "wits" as const,
    base,
    skill,
    gear: 0,
    modifier: ctx.modifier,
    isArmor: false,
    instructions:
      "Navigate to " +
      ctx.hex +
      " using current Wits/Survival and the reviewed modifier. " +
      (talent.artifactAllowed
        ? "Pathfinder rank 3 permits an optional D8 artifact die."
        : "No unverified gear or artifact bonus has been assumed."),
  };
}
export function requestedWatchRoll(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
) {
  const s = repo.get(id)?.session;
  if (!s) return null;
  const entryId = activeChatForm(s)?.entryId;
  if (!entryId) return null;
  const flow = readFlow(repo, id, entryId),
    entry = s.dayTracker?.find((e) => e.id === entryId),
    watch = entry?.assignments.find((a) => a.activity === "Keep Watch");
  if (
    !flow ||
    watch?.characterId !== actor ||
    flow.selected.watch ||
    checkFor(repo, id, s, entryId)?.status !== "scene"
  )
    return null;
  const ch = mechanicalCharacter(s.characters.find((c) => c.id === actor)!),
    base = ch.attributes.wits.current,
    skill = ch.skills["skill-scouting"];
  if (base === null || skill === null) return null;
  return {
    context: { quarterRequestId: stableId(entryId, "watch") },
    label: "Scouting",
    purpose: "Keep Watch",
    attribute: "wits" as const,
    base,
    skill,
    gear: 0,
    modifier: 0,
    isArmor: false,
    instructions:
      "An actual encounter has been rolled and saved. Resolve detection with Scouting; this does not reroll the encounter. Active ambushes require the separate opposed procedure.",
  };
}
