import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import { combatPages, citation } from "../combat/sources";
import { activeCombat } from "../combat/store";
import { checkFor, saveCheck, readAloud } from "./director";
import { eligibleWatchCards } from "./watch-evidence";
import { readFlow } from "./store";
export function avoidEncounter(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  entryId: string,
  requestId: string,
  choice?: string,
) {
  const check = checkFor(repo, id, s, entryId),
    flow = readFlow(repo, id, entryId);
  if (!check || !["scene", "resolved"].includes(check.status))
    throw Error(
      "There is no introduced encounter to avoid. Inspect the current quarter; no escape or closure has been assumed.",
    );
  if (check.status === "resolved") return;
  if (activeCombat(repo, id))
    throw Error(
      "An active combat requires its own Retreat/escape or reviewed recovery procedure. Avoid cannot close it.",
    );
  if (!flow)
    throw Error(
      "Inspect and adopt the saved quarter before resolving its encounter.",
    );
  const watches = eligibleWatchCards(s, entryId, flow),
    card = watches.length === 1 ? watches[0] : null;
  if (
    check.entryNumber !== 3 ||
    check.detection !== "safe_distance" ||
    !card ||
    card.result.successes < 1
  )
    throw Error(
      "Avoidance needs the actual detection and scene-specific procedure. Resolve Scouting first; close contact or an active threat may require Sneak/Retreat or a Table GM review. No successful escape was recorded.",
    );
  const entry = s.dayTracker?.find((e) => e.id === entryId);
  if (check.publicIntro !== readAloud(repo, id, 3))
    throw Error(
      "This scene was modified or introduced with additional facts. Review its actual avoidance procedure; declining ordinary distant contact is not an automatic escape.",
    );
  const combatDuringQuarter = repo.db
    .prepare("SELECT state_json FROM combat_encounters WHERE campaign_id=?")
    .all(id)
    .some((row) => {
      const e = JSON.parse(String(row.state_json));
      return (
        e.sceneHex === check.hex &&
        e.startedAt >= (entry?.submittedAt ?? check.createdAt)
      );
    });
  if (combatDuringQuarter)
    throw Error(
      "Combat history exists for this quarter. Resolve its actual aftermath; it cannot be reclassified as declining contact.",
    );
  const custom = repo.db
    .prepare(
      "SELECT override_scope FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule'",
    )
    .all(id)
    .some((r) => /encounter|avoid|sneak|scout/i.test(String(r.override_scope)));
  if (custom)
    throw Error(
      "Review the applicable encounter/detection house rule before applying the default avoidance procedure.",
    );
  const pages = combatPages(repo, id, "guide").map((p) => ({
    ...p,
    text: p.text.replace(/-\s+/g, "").replace(/\s+/g, " "),
  }));
  const detection = pages.find((p) =>
      /safe distance[\s\S]*SNEAK away undetected/i.test(p.text),
    ),
    procession = pages.find(
      (p) =>
        /THE ORCISH FUGITIVE/.test(p.text) &&
        /on their way back to[\s\S]*their clan/i.test(p.text),
    );
  if (!detection || !procession)
    throw Error(
      "Restore the original Guide safe-distance detection and Orcish Fugitive evidence before resolving this choice.",
    );
  if (choice !== "let-pass")
    throw Error(
      "The procession is detected at a safe distance. Remain at the current position and let it pass without contact, or leave and Sneak away? Choose “Let them pass without contact”; leaving needs its own procedure.",
    );
  Object.assign(check, {
    status: "resolved",
    resolutionId: requestId,
    resolutionKind: "declined_contact",
    reason: `Party chose to let the distant Orcish Fugitive procession pass without contact. Saved Scouting ${card.id}; original Guide detection and encounter 3 (${citation(detection).chunkId}; ${citation(procession).chunkId}). No pursuit, escape roll, movement, reward or combat outcome was assumed.`,
  });
  saveCheck(repo, id, check);
  s.journal.push({
    id: requestId,
    title: "Encounter contact declined",
    text: check.reason,
  });
  repo.update(id, repo.get(id)!.revision, s);
}
