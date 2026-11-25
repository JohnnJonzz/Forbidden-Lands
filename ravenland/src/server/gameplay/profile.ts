import { z } from "zod";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import type { SqliteCampaignRepository } from "../sqlite";
import { phase7Baseline } from "../../lib/gameplay";
export const profileSchema = z
  .object({
    format: z.literal("ravenland-phase7-development"),
    version: z.literal(1),
    purpose: z.literal("synthetic"),
    profileId: z.string().uuid(),
    baselineCommit: z.literal(phase7Baseline),
    root: z.string(),
    database: z.string(),
    images: z.string(),
    sourcebooks: z.string(),
    campaignId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type Phase7Profile = z.infer<typeof profileSchema>;
export function readProfile(filename = process.env.RAVENLAND_PHASE7_PROFILE) {
  if (!filename)
    throw Error(
      "Phase 7 requires an explicit isolated development profile. Use npm run dev:phase7.",
    );
  const file = realpathSync(filename),
    p = profileSchema.parse(JSON.parse(readFileSync(file, "utf8"))),
    root = realpathSync(p.root);
  if (root !== dirname(file) || p.root !== root)
    throw Error("Phase 7 profile root does not match its actual directory.");
  for (const [name, path] of Object.entries({
    database: p.database,
    images: p.images,
    sourcebooks: p.sourcebooks,
  })) {
    if (!resolve(path).startsWith(root + sep) || realpathSync(path) !== path)
      throw Error(
        "Phase 7 " +
          name +
          " must be its own private profile path, without symlink redirection.",
      );
  }
  if (
    [p.database, p.images, p.sourcebooks].some(
      (path) =>
        path === resolve(process.cwd(), "data/ravenland.sqlite") ||
        path.startsWith(resolve(process.cwd(), "public") + sep),
    )
  )
    throw Error(
      "Phase 7 cannot use the default campaign database or public asset storage.",
    );
  return p;
}
export function requireProfile(
  repo: SqliteCampaignRepository,
  filename?: string,
) {
  const p = readProfile(filename),
    row = repo.db
      .prepare("PRAGMA database_list")
      .all()
      .find((r) => r.name === "main"),
    meta = repo.db
      .prepare("SELECT value FROM application_meta WHERE key='phase7_profile'")
      .get();
  if (
    !row ||
    realpathSync(String(row.file)) !== p.database ||
    meta?.value !== p.profileId
  )
    throw Error("Phase 7 database does not match the isolated profile.");
  return p;
}
export const profileFile = (root: string) => join(root, "phase7-profile.json");
