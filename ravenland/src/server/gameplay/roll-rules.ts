import { injuryRow } from "../combat/player-critical";
import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import type { RollRequest, DiceSpec } from "../../lib/gameplay-rolls";
import { combatPages, citation } from "../combat/sources";
import { mechanicalCharacter, exactInteger } from "../mechanical-character";
import { terrainModifiers } from "../activities/rules";
import { campaignSeason } from "../../lib/campaign-calendar";
import { weatherModifier } from "../../lib/weather-context";
const normalized = (s: string) => s.replace(/-\s+/g, "").replace(/\s+/g, " ");
export function rollRules(repo: SqliteCampaignRepository, campaignId: string) {
  if (repo.get(campaignId)?.session.campaign.settings?.houseRules?.trim())
    throw Error(
      "Free-text campaign house rules require a scoped Table GM review before automatic dice procedures; no official rule silently overrides them.",
    );
  if (
    repo.db
      .prepare(
        "SELECT 1 FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule' AND (lower(override_scope) LIKE '%forag%' OR lower(override_scope) LIKE '%camp%' OR lower(override_scope) LIKE '%push%' OR lower(override_scope) LIKE '%talent%' OR lower(override_scope) LIKE '%scout%')",
      )
      .get(campaignId)
  )
    throw Error(
      "A scoped house rule requires Table GM mechanical review before official automation.",
    );
  let originals;
  try {
    originals = combatPages(repo, campaignId, "handbook");
  } catch {
    throw Error(
      "The Phase 7 roll queue requires one applicable indexed original Player’s Handbook. Missing or ambiguous source editions require review in Existing Rules Library administration.",
    );
  }
  const pages = originals.map((p) => ({
    ...p,
    text: normalized(p.text),
  }));
  const find = (pattern: RegExp, label: string) => {
    const p = pages.find((p) => pattern.test(p.text));
    if (!p)
      throw Error(
        "Original Handbook evidence missing: " +
          label +
          ". Restore the applicable indexed source; no result is assumed.",
      );
    return p;
  };
  return { find, pages };
}
export function sprainEvidence(repo: SqliteCampaignRepository, id: string) {
  const r = rollRules(repo, id),
    m = r.find(
      /FOR\s*AGING MISHAPS.*3\s+Sprained\s+Ankle.*25\s*[–−-]\s*26/i,
      "Foraging mishap 3",
    ),
    h = r.find(
      /healing time indicated.*measured in days/i,
      "critical healing units",
    );
  const critical = injuryRow(
    combatPages(repo, id, "handbook").map((p) => ({
      ...p,
      text: p.text.replace(/(\b\d{2})\s*([–−-])\s*(\d{2}\b)/g, "$1$2$3"),
    })),
    "blunt",
    25,
  );
  if (
    !critical ||
    !/Broken toes\s+No[\s\S]*RUN becomes a slow action[.\s]*D6\b/i.test(
      critical.text,
    )
  )
    throw Error(
      "The original blunt 25–26 row does not verify RUN restriction and D6 healing. Table GM source review required.",
    );
  return [m, critical.page, h].map(citation);
}

export function derivePool(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  charId: string,
  activity: string,
): Pick<
  RollRequest,
  | "expression"
  | "modifiers"
  | "sources"
  | "pushEligible"
  | "artifactAllowed"
  | "talents"
  | "review"
> {
  const r = rollRules(repo, id),
    ch = s.characters.find((c) => c.id === charId)!;
  if (!ch) throw Error("Character not found.");
  const m = mechanicalCharacter(ch),
    rank = (n: string) =>
      m.talents.find((t) => t.name.toLowerCase() === n.toLowerCase())?.rank ??
      0;
  if (s.environment?.weatherStatus === "pending")
    throw Error(
      "Current weather requires its reviewed established conditions before deriving modifiers.",
    );
  const attribute = "wits",
    skill = activity === "Keep Watch" ? "Scouting" : "Survival",
    base = m.attributes.wits.current,
    trained = m.skills["skill-" + skill.toLowerCase()];
  if (base === null || trained === null || trained === undefined)
    throw Error("Record actual Wits and " + skill + " on the character sheet.");
  if (Object.values(m.attributes).some((a) => a.current === 0))
    throw Error("Resolve Broken recovery before this ordinary skill roll.");
  const sources = [
      citation(
        r.find(
          /PUSHING.*YOUR ROLL.*all the dice.*six.*one/i,
          "Push eligibility",
        ),
      ),
      citation(
        r.find(
          /SKILL DICE:.*ones.*do not count.*ONLY ONCE/i,
          "Push restrictions and Skill Dice",
        ),
      ),
    ],
    modifiers: RollRequest["modifiers"] = [];
  let modifier = 0,
    artifactAllowed = false;
  const add = (
    name: string,
    value: number,
    source: ReturnType<typeof citation> | null,
  ) => {
    modifier += value;
    modifiers.push({ name, value, source });
    if (source) sources.push(source);
  };
  if (activity === "Make Camp") {
    sources.push(
      citation(r.find(/Only one person rolls to MAK\s*E CAMP/i, "Make Camp")),
    );
    if (rank("Quartermaster")) {
      const p = r.find(
        /QUARTERMASTER.*SURVIVAL roll is modified by.*\+1.*MAKE CAMP/i,
        "Quartermaster",
      );
      if (rank("Quartermaster") >= 3)
        r.find(
          /QUARTERMASTER.*RANK 3.*D8 Artifact Die.*MAKE CAMP/i,
          "Quartermaster optional Artifact Die",
        );
      add("Quartermaster", 1, citation(p));
      artifactAllowed = rank("Quartermaster") >= 3;
    }
    add("Established campaign weather", weatherModifier(s, "Make Camp"), null);
  } else if (activity === "Forage") {
    sources.push(citation(r.find(/To FOR\s*AGE.*SURVIVAL roll/i, "Forage")));
    const terrain = terrainModifiers[s.campaign.terrain]?.forage,
      season = campaignSeason(s);
    if (terrain === undefined || terrain === null || !season)
      throw Error(
        "Review current calendar season and canonical foraging terrain.",
      );
    const p = r.find(/TERRAIN TYPES.*Dark Forest/i, "terrain table");
    const escaped = s.campaign.terrain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      !new RegExp(
        escaped +
          "\\s+(?:Open terrain|Difficult terrain|Requires a raft)\\s+" +
          (terrain < 0
            ? "[−-]" + Math.abs(terrain)
            : terrain > 0
              ? "\\+" + terrain
              : "0") +
          "\\s",
        "i",
      ).test(p.text)
    )
      throw Error("The actual terrain row could not verify the modifier.");
    const seasonal = { Spring: -1, Summer: 0, Autumn: 1, Winter: -2 }[season];
    const sp = r.find(
      /SEASONS.*Spring\s*[−-]1.*Summer\s*0.*Autumn\s*\+1.*Winter\s*[−-]2/i,
      "season modifiers",
    );
    add("Terrain: " + s.campaign.terrain, terrain, citation(p));
    add("Calendar season: " + season, seasonal, citation(sp));
    if (rank("Gatherer")) {
      const gp = r.find(
        /SURVIVAL roll is modified by\s*\+1 when you FORAGE/i,
        "Gatherer",
      );
      add("Gatherer", 1, citation(gp));
      if (rank("Gatherer") >= 3)
        r.find(/amount of VEGETABLES.*doubled/i, "Gatherer rank 3 yield");
    }
  } else if (activity === "Keep Watch") {
    sources.push(citation(r.find(/SCOUTING roll to detect it/i, "Keep Watch")));
    if (
      s.characters.some(
        (c) =>
          (mechanicalCharacter(c).talents.find(
            (t) => t.name.toLowerCase() === "quartermaster",
          )?.rank ?? 0) >= 2,
      )
    )
      throw Error(
        "Quartermaster rank 2 requires review of an actually established camp before the Watch modifier; a planned camp is not an established camp.",
      );
  } else
    throw Error(
      "This activity needs its specific Table GM procedure; stationary completion is reserved for 7.0C.",
    );
  const talents: string[] = [];
  if (activity === "Forage" && rank("Path of the Forest")) {
    if (ch.profession.toLowerCase() !== "druid")
      throw Error(
        "Path of the Forest requires an actual Druid, not general Pathfinder.",
      );
    r.find(
      /PATH OF THE FOREST.*succeed automatically.*roll first and spend the point if you fail/i,
      "Path of the Forest rank 1",
    );
    talents.push("Path of the Forest");
  }
  return {
    expression: {
      kind: "pool",
      attribute,
      skill,
      base,
      skillDice: trained + modifier,
      gear: 0,
      artifacts: [],
    },
    modifiers,
    sources,
    pushEligible: true,
    artifactAllowed,
    talents,
    review:
      activity === "Keep Watch"
        ? "Prepared Watch roll only: no threat, encounter, or detection result has been established."
        : null,
  };
}
export function forestIntervention(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  charId: string,
  activity: string,
) {
  const p = derivePool(repo, id, s, charId, activity);
  if (!p.talents.includes("Path of the Forest"))
    throw Error(
      "No eligible Path of the Forest talent; Pathfinder is not this ability.",
    );
  const ch = s.characters.find((c) => c.id === charId)!,
    wp = exactInteger(ch.sheet?.willpower, 0, 10);
  if (wp === null || wp < 1) throw Error("Insufficient verified Willpower.");
  return {
    cost: 1,
    wp,
    source: citation(
      rollRules(repo, id).find(
        /PATH OF THE FOREST.*succeed automatically.*roll first and spend the point if you fail/i,
        "Path of the Forest",
      ),
    ),
  };
}
