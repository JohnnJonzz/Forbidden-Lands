import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import { exactInteger, mechanicalCharacter } from "../mechanical-character";
import { combatPages, citation } from "../combat/sources";
export function pathOfForest(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  characterId: string,
  activity: string,
) {
  if (!["Lead the Way", "Forage", "Hunt"].includes(activity)) return null;
  const ch = s.characters.find((c) => c.id === characterId);
  if (!ch || ch.profession.toLowerCase() !== "druid") return null;
  const talent = mechanicalCharacter(ch).talents.find(
    (t) => t.name.toLowerCase() === "path of the forest",
  );
  if (!talent?.rank) return null;
  const page = combatPages(repo, id, "handbook").find(
    (p) =>
      /PATH OF THE FOREST/.test(p.text) &&
      /succeed automatically/.test(p.text.replace(/\s+/g, " ")) &&
      /roll first and spend the point if you fail/.test(
        p.text.replace(/\s+/g, " "),
      ),
  );
  if (!page) return null;
  const wp = exactInteger(ch.sheet?.willpower, 0, 100);
  if (wp === null)
    throw Error(
      "Record the character’s actual Willpower before using Path of the Forest.",
    );
  return {
    name: "Path of the Forest",
    rank: talent.rank,
    cost: 1,
    reference: citation(page),
    availableWP: wp,
  };
}
export function pathfinder(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  characterId: string,
) {
  const ch = s.characters.find((c) => c.id === characterId),
    rank =
      ch &&
      mechanicalCharacter(ch).talents.find(
        (t) => t.name.toLowerCase() === "pathfinder",
      )?.rank;
  if (!rank)
    return { rank: 0, modifier: 0, artifactAllowed: false, sources: [] };
  const page = combatPages(repo, id, "handbook").find(
    (p) =>
      /PATHFINDER/.test(p.text) &&
      /SURVIVAL roll is modified by/.test(p.text.replace(/\s+/g, " ")),
  );
  if (!page)
    throw Error(
      "Restore original Pathfinder talent evidence before using its modifier.",
    );
  return {
    rank,
    modifier: 1,
    artifactAllowed: rank >= 3,
    sources: [citation(page)],
  };
}
