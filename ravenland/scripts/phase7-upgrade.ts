import { preparePhase7Map } from "../src/server/gameplay/prepare-map";
import { upgradeTestRuns } from "../src/server/gameplay/test-runs";
import { ensureRollQueue } from "../src/server/gameplay/roll-store";
import { resolve } from "node:path";
import {
  readProfile,
  profileFile,
  requireProfile,
} from "../src/server/gameplay/profile";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { upgradeRollQueue } from "../src/server/gameplay/upgrade";
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--directory")
    throw Error(
      "Stop the application and use npm run phase7:upgrade -- --directory /existing/private/phase7-directory. Back up the stopped profile first. Never rerun setup.",
    );
  const file = profileFile(resolve(args[1])),
    p = readProfile(file);
  const check = new SqliteCampaignRepository(p.database, { readOnly: true });
  try {
    requireProfile(check, file);
  } finally {
    check.close();
  }
  const repo = new SqliteCampaignRepository(p.database);
  try {
    const result = upgradeRollQueue(repo, file);
    for (const row of repo.list()) ensureRollQueue(repo, row.id);
    console.log(
      JSON.stringify({
        rollQueue: result,
        testRuns: upgradeTestRuns(repo, file),
        map: await preparePhase7Map(repo, file),
      }),
    );
  } finally {
    repo.close();
  }
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Upgrade failed");
  process.exitCode = 1;
});
