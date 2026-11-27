import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SqliteCampaignRepository } from "../sqlite";
import { requireProfile } from "./profile";
import { readGeography } from "../map/importer";
import { SqliteMapStore } from "../map/store";
import { mapImage } from "../map/assets";
// Explicit upgrade-time reference import only. Never runs from a page/read handler.
export async function preparePhase7Map(
  repo: SqliteCampaignRepository,
  file: string,
) {
  requireProfile(repo, file);
  const store = new SqliteMapStore(repo),
    workbook =
      process.env.RAVENLAND_WORKBOOK_PATH ||
      resolve("data/Ravenland_Campaign_Master.xlsx");
  if (store.hexes().length) return { imported: false, available: true };
  if (!existsSync(workbook)) return { imported: false, available: false };
  const mapping = JSON.parse(
    readFileSync(
      process.env.RAVENLAND_MAP_MAPPING ||
        resolve("config/ravenland-master.json"),
      "utf8",
    ),
  );
  store.import(await readGeography(workbook, mapping));
  const calibration = JSON.parse(
      readFileSync(resolve("config/ravenland-calibration.json"), "utf8"),
    ),
    source = repo.db
      .prepare("SELECT value FROM geography_meta WHERE key='source'")
      .get();
  if (
    !repo.db
      .prepare("SELECT 1 FROM geography_meta WHERE key='calibration'")
      .get() &&
    source &&
    JSON.parse(String(source.value)).checksum ===
      calibration.workbookChecksum &&
    mapImage()?.checksum === calibration.imageChecksum
  )
    store.calibrate(calibration.grid);
  return { imported: true, available: true };
}
