import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SqliteCampaignRepository } from "../sqlite";
import { requireProfile } from "./profile";
export function hasRollQueue(repo: SqliteCampaignRepository) {
  return !!repo.db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='phase7_roll_requests'",
    )
    .get();
}
export function upgradeRollQueue(
  repo: SqliteCampaignRepository,
  profile: string,
) {
  requireProfile(repo, profile);
  const db = repo.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    const old = db
      .prepare(
        "SELECT 1 FROM phase7_schema_migrations WHERE version='002_roll_queue'",
      )
      .get();
    if (!old) {
      db.exec(
        readFileSync(
          resolve("src/server/gameplay/migrations/002_roll_queue.sql"),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO phase7_schema_migrations VALUES (?,?)").run(
        "002_roll_queue",
        new Date().toISOString(),
      );
    }
    db.exec("COMMIT");
    return { version: "7.0B", applied: !old };
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
