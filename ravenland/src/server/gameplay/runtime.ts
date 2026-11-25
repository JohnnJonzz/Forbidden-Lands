import { realpathSync } from "node:fs";
import { getLocalRepository } from "../sqlite";
import { readProfile, requireProfile } from "./profile";
// Validate storage before constructing a repository: a missing/mismatched profile
// must not create or migrate the default campaign database as a side effect.
export function getGameplayRepository() {
  const p = readProfile();
  for (const [key, path] of Object.entries({
    RAVENLAND_DB_PATH: p.database,
    RAVENLAND_IMAGE_DIR: p.images,
    RAVENLAND_SOURCEBOOK_DIR: p.sourcebooks,
  })) {
    const value = process.env[key];
    if (!value || realpathSync(value) !== path)
      throw Error(
        "Phase 7 requires matching explicit database and asset paths. Start npm run dev:phase7 with its profile directory.",
      );
  }
  const repo = getLocalRepository();
  requireProfile(repo);
  return repo;
}
