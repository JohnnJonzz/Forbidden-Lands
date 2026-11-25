import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readProfile, profileFile } from "../src/server/gameplay/profile";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { requireProfile } from "../src/server/gameplay/profile";
const args = process.argv.slice(2);
if (
  ![2, 4].includes(args.length) ||
  args[0] !== "--directory" ||
  (args.length === 4 && (args[2] !== "--port" || !/^\d+$/.test(args[3])))
)
  throw Error(
    "Usage: npm run dev:phase7 -- --directory /private/phase7-directory [--port 3000]",
  );
const filename = profileFile(resolve(args[1])),
  p = readProfile(filename),
  repo = new SqliteCampaignRepository(p.database, { readOnly: true });
try {
  requireProfile(repo, filename);
} finally {
  repo.close();
}
const child = spawn(
  process.execPath,
  ["scripts/dev-local.mjs", ...(args.length === 4 ? ["--port", args[3]] : [])],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RAVENLAND_PHASE7_PROFILE: filename,
      RAVENLAND_DB_PATH: p.database,
      RAVENLAND_IMAGE_DIR: p.images,
      RAVENLAND_SOURCEBOOK_DIR: p.sourcebooks,
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
console.log(
  "Phase 7 isolated profile. Open /campaigns/" +
    p.campaignId +
    "/play. No live campaign was adopted.",
);
