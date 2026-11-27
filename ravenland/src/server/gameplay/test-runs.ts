import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { requireCharacterAccess } from "../character-access";
import { tableGM } from "../narrative/authority";
import { requireProfile } from "./profile";
import { digest, currentActivity, requests, putRequest } from "./roll-store";
import { syntheticSession } from "./synthetic-fixture";
import { sessionSchema } from "../../lib/validation";
export function hasTestRuns(repo: SqliteCampaignRepository) {
  return !!repo.db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='phase7_test_runs'")
    .get();
}
export function testRun(repo: SqliteCampaignRepository, id: string) {
  if (!hasTestRuns(repo)) return null;
  const r = repo.db
    .prepare("SELECT * FROM phase7_test_runs WHERE campaign_id=?")
    .get(id);
  return r
    ? {
        id: String(r.run_id),
        hasCheckpoint: !!r.checkpoint_json,
        createdAt: String(r.created_at),
      }
    : null;
}
export function assertRun(
  repo: SqliteCampaignRepository,
  id: string,
  runId?: string | null,
) {
  if (hasTestRuns(repo) && (!runId || testRun(repo, id)?.id !== runId))
    throw Error(
      "This test run has changed. Refresh before acting; an old request cannot cross a reset.",
    );
}
export function upgradeTestRuns(repo: SqliteCampaignRepository, file: string) {
  const p = requireProfile(repo, file),
    db = repo.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    const old = hasTestRuns(repo);
    if (!old) {
      db.exec(
        readFileSync(
          resolve("src/server/gameplay/migrations/003_test_runs.sql"),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO phase7_test_runs VALUES (?,?,NULL,?)").run(
        p.campaignId,
        randomUUID(),
        new Date().toISOString(),
      );
      db.prepare("INSERT INTO phase7_schema_migrations VALUES (?,?)").run(
        "003_test_runs",
        new Date().toISOString(),
      );
    }
    db.exec("COMMIT");
    return {
      version: "7.0B.2",
      applied: !old,
      checkpointCreated: false,
      campaignChanged: false,
    };
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
function authorize(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
  principal: CharacterPrincipal | null,
  file?: string,
) {
  const p = requireProfile(repo, file);
  requireCharacterAccess(principal, id, actor);
  if (
    p.purpose !== "synthetic" ||
    p.campaignId !== id ||
    !repo.db
      .prepare(
        "SELECT 1 FROM phase7_campaigns WHERE campaign_id=? AND profile_id=?",
      )
      .get(id, p.profileId) ||
    !tableGM(repo, id, principal).isTableGM
  )
    throw Error(
      "Development Testing requires the actual Table GM of this enrolled synthetic profile.",
    );
  if (!repo.get(id)?.session.characters.some((c) => c.id === actor))
    throw Error("Choose an actual campaign character.");
  if (!testRun(repo, id))
    throw Error(
      "Stop the server, back up this profile and run phase7:upgrade first.",
    );
}
// Full session captures resources, wounds, inventory, dice, Push costs, camps and clock.
// Related rows are archived for inspection; old Phase 7 records are never deleted.
function snapshot(repo: SqliteCampaignRepository, id: string) {
  const related: Record<string, unknown> = {};
  for (const row of repo.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()) {
    const name = String(row.name);
    if (
      !/^[a-z0-9_]+$/.test(name) ||
      ["phase7_test_archives", "phase7_test_commands"].includes(name)
    )
      continue;
    if (
      repo.db
        .prepare(`PRAGMA table_info("${name}")`)
        .all()
        .some((c) => c.name === "campaign_id")
    )
      related[name] = repo.db
        .prepare(`SELECT * FROM "${name}" WHERE campaign_id=?`)
        .all(id);
  }
  related.phase7_roll_bindings = repo.db
    .prepare(
      "SELECT b.* FROM phase7_roll_bindings b JOIN phase7_roll_requests r ON r.id=b.request_id WHERE r.campaign_id=?",
    )
    .all(id);
  return { record: repo.get(id)!, related };
}
export function resetPreview(
  repo: SqliteCampaignRepository,
  id: string,
  actor: string,
  p: CharacterPrincipal | null,
  file?: string,
) {
  authorize(repo, id, actor, p, file);
  const versions = repo.db
    .prepare("SELECT version FROM phase7_schema_migrations")
    .all();
  if (
    versions.some(
      (v) =>
        !["001_foundation", "002_roll_queue", "003_test_runs"].includes(
          String(v.version),
        ),
    )
  )
    throw Error(
      "Reset requires a reviewed state-restoration adapter for the newer Phase 7 milestone. No partial reset is allowed.",
    );
  const run = testRun(repo, id)!,
    r = repo.get(id)!;
  const target = run.hasCheckpoint
    ? "Reset Test Quarter"
    : "Create Fresh Synthetic Test Baseline";
  return {
    run,
    campaignName: r.session.campaign.name,
    checkpoint: run.hasCheckpoint
      ? {
          label: "Reviewed synthetic checkpoint",
          id: digest(
            repo.db
              .prepare(
                "SELECT checkpoint_json FROM phase7_test_runs WHERE campaign_id=?",
              )
              .get(id)!.checkpoint_json,
          ),
        }
      : {
          label: "Known synthetic fixture v1 — explicit replacement required",
          id: "synthetic-fixture-v1",
        },
    target,
    hash: digest({ snapshot: snapshot(repo, id), run }),
    current: {
      date: r.session.campaign.date,
      quarter: r.session.campaign.quarter,
      dice: r.session.dice?.length ?? 0,
    },
    baseline: {
      date: "13th Springrise, 1165",
      quarter: "Evening",
      hex: "V09",
      terrain: "Dark Forest",
      weather: "Clear — synthetic starting condition",
    },
    warning: run.hasCheckpoint
      ? "Archive this test run and restore the reviewed checkpoint, including all character mechanics."
      : "No proven initialization checkpoint exists. Archive the current test, then explicitly replace its mechanical state with the known original synthetic fixture. This does not infer the original resources of the current saved party.",
    preserved:
      "Same campaign, sourcebooks and indexed evidence, portraits, player access and GM configuration. No quarter completion or travel.",
  };
}
export const resetCommandSchema = z
  .object({
    campaignId: z.string().uuid(),
    actorId: z.string().min(1),
    operationId: z.string().uuid(),
    runId: z.string().uuid(),
    previewHash: z.string().length(64),
    confirmation: z.enum([
      "Reset Test Quarter",
      "Create Fresh Synthetic Test Baseline",
    ]),
  })
  .strict();
export function resetTest(
  repo: SqliteCampaignRepository,
  raw: unknown,
  p: CharacterPrincipal | null,
  file?: string,
) {
  const c = resetCommandSchema.parse(raw);
  authorize(repo, c.campaignId, c.actorId, p, file);
  const db = repo.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Must precede receipt lookup: old reset IDs cannot reset a new run.
    assertRun(repo, c.campaignId, c.runId);
    const preview = resetPreview(repo, c.campaignId, c.actorId, p, file);
    if (c.previewHash !== preview.hash || c.confirmation !== preview.target)
      throw Error(
        "The reviewed preview changed. Review it again before confirming.",
      );
    const r = repo.get(c.campaignId)!,
      row = db
        .prepare(
          "SELECT checkpoint_json FROM phase7_test_runs WHERE campaign_id=?",
        )
        .get(c.campaignId)!;
    const baseline = row.checkpoint_json
      ? sessionSchema.parse(JSON.parse(String(row.checkpoint_json)))
      : syntheticSession();
    // Reference assets are not mechanical test state. Preserve each actual portrait.
    for (const ch of baseline.characters) {
      const old = r.session.characters.find((v) => v.id === ch.id);
      if (old?.portraitId) ch.portraitId = old.portraitId;
    }
    baseline.campaign.name = r.session.campaign.name;
    const checkpoint = sessionSchema.parse(baseline),
      archiveId = randomUUID(),
      nextRun = randomUUID(),
      now = new Date().toISOString();
    db.prepare("INSERT INTO phase7_test_archives VALUES (?,?,?,?,?,?,?)").run(
      archiveId,
      r.id,
      c.runId,
      preview.target,
      JSON.stringify(snapshot(repo, r.id)),
      p!.playerId,
      now,
    );
    const activity = currentActivity(repo, r.id);
    for (const q of requests(repo, r.id).filter(
      (q) => q.activityId === activity?.id && q.status !== "superseded",
    ))
      putRequest(repo, {
        ...q,
        status: "superseded",
        revision: q.revision + 1,
        updatedAt: now,
        audit: [
          ...q.audit,
          {
            operationId: c.operationId,
            actorId: p!.playerId,
            action: "reset",
            reason:
              "Archived test run; active state restored by explicit Table GM confirmation",
            at: now,
          },
        ],
      });
    db.prepare(
      "UPDATE phase7_roll_bindings SET active=0 WHERE request_id IN (SELECT id FROM phase7_roll_requests WHERE activity_id=?)",
    ).run(activity?.id ?? "");
    db.prepare(
      "UPDATE campaigns SET public_state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
    ).run(JSON.stringify(checkpoint), now, r.id, r.revision);
    db.prepare(
      "UPDATE phase7_campaigns SET current_activity_id=NULL WHERE campaign_id=?",
    ).run(r.id);
    db.prepare(
      "UPDATE phase7_test_runs SET run_id=?,checkpoint_json=?,created_at=? WHERE campaign_id=?",
    ).run(nextRun, JSON.stringify(checkpoint), now, r.id);
    db.prepare("INSERT INTO phase7_events VALUES (?,?,NULL,?,?,?,?)").run(
      randomUUID(),
      r.id,
      "test_reset",
      JSON.stringify({
        text: "Table GM explicitly restored the synthetic Evening checkpoint. No activities have been completed.",
        archiveId,
        priorRun: c.runId,
        runId: nextRun,
      }),
      p!.playerId,
      now,
    );
    const result = { runId: nextRun, archiveId, restored: true };
    db.prepare("INSERT INTO phase7_test_commands VALUES (?,?,?,?)").run(
      r.id,
      c.operationId,
      digest(c),
      JSON.stringify(result),
    );
    db.exec("COMMIT");
    return result;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
