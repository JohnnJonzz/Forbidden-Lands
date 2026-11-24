import boundaries from "./encounter-boundaries.json";
import { z } from "zod";
import { randomInt } from "node:crypto";
import type { SqliteCampaignRepository } from "../sqlite";
import type { Session } from "../../lib/types";
import { sameDay } from "../../lib/calendar";
import { encounterSelection } from "../narrative/encounters";
import { combatPages } from "../combat/sources";
import { stableId } from "./store";
const checkSchema = z
  .object({
    id: z.string().uuid(),
    entryId: z.string().uuid(),
    date: z.string(),
    quarter: z.string(),
    traveling: z.boolean(),
    hex: z.string(),
    terrain: z.string(),
    status: z.enum([
      "pending",
      "none",
      "review",
      "scene",
      "resolved",
      "skipped",
      "waived",
    ]),
    faces: z
      .tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)])
      .nullable(),
    entryNumber: z.number().int().nullable(),
    sourceId: z.string().nullable(),
    publicIntro: z.string().max(2000),
    detection: z.enum([
      "unresolved",
      "safe_distance",
      "close",
      "opposed_review",
    ]),
    reason: z.string(),
    overrideId: z.string().uuid().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type EncounterCheck = z.infer<typeof checkSchema>;
export function checks(repo: SqliteCampaignRepository, id: string) {
  return repo.db
    .prepare(
      "SELECT state_json FROM quarter_encounter_checks WHERE campaign_id=? ORDER BY rowid",
    )
    .all(id)
    .map((r) => checkSchema.parse(JSON.parse(String(r.state_json))));
}
export function checkFor(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  entryId: string,
) {
  const entry = s.dayTracker?.find((e) => e.id === entryId);
  if (!entry) return null;
  return (
    checks(repo, id).find(
      (c) =>
        c.entryId === entryId ||
        (!entry.traveling &&
          !c.traveling &&
          sameDay(c.date, entry.date, s.environment?.calendar)),
    ) ?? null
  );
}
export function saveCheck(
  repo: SqliteCampaignRepository,
  id: string,
  c: EncounterCheck,
) {
  repo.db
    .prepare(
      "INSERT INTO quarter_encounter_checks VALUES (?,?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET state_json=excluded.state_json",
    )
    .run(id, c.id, c.entryId, JSON.stringify(checkSchema.parse(c)));
}
export function pendingCheck(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  entryId: string,
) {
  const old = checkFor(repo, id, s, entryId);
  if (old) return old;
  const entry = s.dayTracker!.find((e) => e.id === entryId)!;
  const c: EncounterCheck = {
    id: stableId(entryId, "encounter"),
    entryId,
    date: entry.date,
    quarter: entry.quarter,
    traveling: entry.traveling,
    hex: s.campaign.hex,
    terrain: s.campaign.terrain,
    status: "pending",
    faces: null,
    entryNumber: null,
    sourceId: null,
    publicIntro: "",
    detection: "unresolved",
    reason:
      "Required source-backed " +
      (entry.traveling ? "hiking quarter" : "stationary daily") +
      " encounter procedure.",
    overrideId: null,
    createdAt: new Date().toISOString(),
  };
  saveCheck(repo, id, c);
  return c;
}
export function performCheck(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  entryId: string,
  handling: string,
  die: (sides: number) => number = (n) => randomInt(1, n + 1),
) {
  const c = pendingCheck(repo, id, s, entryId);
  if (c.status !== "pending" || handling === "Manual") return c;
  // Resolve rules before drawing: absence of an original table is a hold, not invented odds.
  const frequency = combatPages(repo, id, "handbook").find((p) =>
    /once every Quarter Day while you HIKE[\s\S]*once per day/i.test(
      p.text.replace(/-\s+/g, "").replace(/\s+/g, " "),
    ),
  );
  if (!frequency)
    throw Error(
      "Restore the original Handbook encounter-frequency procedure before drawing a check.",
    );
  encounterSelection(repo, id, s.campaign.terrain, [1, 1]);
  const faces = [die(6), die(6)] as [number, number],
    result = encounterSelection(repo, id, s.campaign.terrain, faces);
  Object.assign(c, {
    faces,
    hex: s.campaign.hex,
    terrain: s.campaign.terrain,
    ...result,
    status: result.entryNumber === 0 ? "none" : "review",
  });
  saveCheck(repo, id, c); // A positive result survives source-content/AI failures without rerolling.
  if (c.entryNumber && handling === "AI GM Assisted") {
    const scene = readAloud(repo, id, c.entryNumber);
    if (scene) {
      c.publicIntro = scene;
      c.status = "scene";
      saveCheck(repo, id, c);
    }
  }
  return c;
}
// These short boundaries identify the original italic read-aloud, not its private GM explanation.
// The actual scene text is read only from the campaign's authorized original Guide at runtime.
export function readAloud(
  repo: SqliteCampaignRepository,
  id: string,
  n: number,
) {
  const boundary = (
    boundaries as Record<
      string,
      | { start: string; end: string }
      | { parts: { start: string; end: string }[] }
    >
  )[String(n)];
  if (!boundary) return null;
  const text = combatPages(repo, id, "guide")
    .map((p) =>
      p.text
        .replace(/[^\r\n]*\(Order #\d+\)[^\r\n]*/g, "")
        .replace(/-\s*\n\s*/g, "")
        .replace(/\s+/g, " ")
        .replace(
          /(?:chapter\s*7|e\s*n\s*c\s*o\s*u\s*n\s*t\s*e\s*r\s*s)\s+1[4-6]\d\b/gi,
          "",
        ),
    )
    .join(" ");
  const fragments: string[] = [];
  for (const part of "parts" in boundary ? boundary.parts : [boundary]) {
    const start = text.indexOf(part.start);
    if (start < 0) return null;
    const end = text.indexOf(part.end, start + part.start.length);
    if (end < 0) return null;
    const scene = text.slice(start, end + part.end.length);
    if (
      scene.length > 2000 ||
      /TERRAIN TYPES:|STRENGTH \d|SKILLS:|\(Order #\d+\)/.test(scene)
    )
      return null;
    fragments.push(scene);
  }
  return fragments.join(" ");
}
export function presentEncounter(
  repo: SqliteCampaignRepository,
  id: string,
  s: Session,
  c: EncounterCheck,
) {
  if (c.status !== "scene") return;
  const messageId = "quarter-scene:" + c.id;
  if (s.messages.some((m) => m.id === messageId)) return;
  const detection =
    c.detection === "safe_distance"
      ? "The saved Keep Watch result establishes detection at a safe distance."
      : c.detection === "close"
        ? "The saved Keep Watch failed: the encounter is close before being noticed. No surprise attack or damage has been assumed."
        : "Detection still needs its actual procedure; no successful sighting or surprise was assumed.";
  s.messages.push({
    id: messageId,
    role: "gm",
    author: "Game Master",
    provider: "application",
    text:
      c.publicIntro +
      "\n\n" +
      detection +
      "\n\nThe party is at " +
      c.hex +
      ". Observe, speak, avoid, or choose a response; combat has not been started automatically.",
  });
  repo.update(id, repo.get(id)!.revision, s);
}
