import { mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { phase7Baseline } from "../src/lib/gameplay";
import {
  profileFile,
  type Phase7Profile,
} from "../src/server/gameplay/profile";
export function createSyntheticProfile(directory: string) {
  const root = resolve(directory);
  if (root === process.cwd() || root.startsWith(resolve("public") + sep))
    throw Error(
      "Choose a new private development directory, outside public assets.",
    );
  mkdirSync(root, { mode: 0o700 });
  const actual = realpathSync(root);
  if (actual !== root)
    throw Error(
      "Use a canonical development path, without symlink redirection.",
    );
  const database = join(root, "campaign.sqlite"),
    images = join(root, "images"),
    sourcebooks = join(root, "sourcebooks");
  mkdirSync(images, { mode: 0o700 });
  mkdirSync(sourcebooks, { mode: 0o700 });
  const repo = new SqliteCampaignRepository(database);
  try {
    repo.db.exec("BEGIN IMMEDIATE");
    try {
      repo.db.exec(
        readFileSync(
          resolve("src/server/gameplay/migrations/001_foundation.sql"),
          "utf8",
        ),
      );
      repo.db
        .prepare("INSERT INTO phase7_schema_migrations VALUES (?,?)")
        .run("001_foundation", new Date().toISOString());
      const s = structuredClone(initialSession);
      s.messages = [];
      s.journal = [];
      delete s.chatJourney;
      delete s.quarterDays;
      delete s.dayTracker;
      delete s.journey;
      delete s.activityState;
      delete s.activityOutcomes;
      delete s.campsites;
      delete s.environment;
      delete s.calendarState;
      Object.assign(s.campaign, {
        name: "Phase 7 isolated V09 planning",
        date: "13th Springrise, 1165",
        quarter: "Evening",
        hex: "V09",
        location: "V09",
        terrain: "Dark Forest",
        weather: "Clear — synthetic starting condition",
      });
      s.characters.forEach((c, i) => {
        c.name =
          ["Grogahx", "Edrus", "Elyanna", "Rose Underbough"][i] ?? c.name;
        c.sheet = {
          name: c.name,
          kin: c.kin,
          profession: c.profession,
          ...Object.fromEntries(
            ["strength", "agility", "wits", "empathy"].flatMap((a) => [
              [`attr-${a}`, "3"],
              [`attr-${a}-regular`, "3"],
            ]),
          ),
          talents: [],
          gear: [],
          weapons: [],
          willpower: "3",
          "skill-survival": "1",
          "skill-scouting": "1",
          "res-food": "D8",
          "res-water": "D8",
        };
      });
      const r = repo.create(s),
        profileId = randomUUID(),
        createdAt = new Date().toISOString(),
        profile: Phase7Profile = {
          format: "ravenland-phase7-development",
          version: 1,
          purpose: "synthetic",
          profileId,
          baselineCommit: phase7Baseline,
          root,
          database,
          images,
          sourcebooks,
          campaignId: r.id,
          createdAt,
        };
      repo.db
        .prepare("INSERT INTO application_meta VALUES ('phase7_profile',?)")
        .run(profileId);
      repo.db
        .prepare("INSERT INTO phase7_campaigns VALUES (?,?,?,?,?)")
        .run(r.id, profileId, phase7Baseline, null, createdAt);
      writeFileSync(
        profileFile(root),
        JSON.stringify(profile, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      repo.db.exec("COMMIT");
      return profile;
    } catch (e) {
      repo.db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    repo.close();
  }
}
if (process.argv[1]?.endsWith("phase7-setup.ts")) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--directory")
    throw Error(
      "Usage: npm run phase7:setup -- --directory /private/new-phase7-directory (synthetic only; never an existing/live database).",
    );
  const p = createSyntheticProfile(args[1]);
  console.log(
    JSON.stringify(
      {
        profile: profileFile(p.root),
        campaignId: p.campaignId,
        mode: p.purpose,
        baseline: p.baselineCommit,
      },
      null,
      2,
    ),
  );
}
