import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseExpression, rollCommandSchema } from "../src/lib/gameplay-rolls";
import { createSyntheticProfile } from "../scripts/phase7-setup";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { upgradeRollQueue } from "../src/server/gameplay/upgrade";
import { profileFile } from "../src/server/gameplay/profile";
import { executeGameplay } from "../src/server/gameplay/service";
import { ensureRollQueue, requests } from "../src/server/gameplay/roll-store";
test("universal expression grammar supports standard dice and bounded custom terms", () => {
  for (const s of [6, 8, 10, 12, 20])
    assert.equal(parseExpression("D" + s).terms[0].sides, s);
  assert.equal(parseExpression("2d6 + d8 - 2").expression, "2D6+D8-2");
  for (const s of ["101d6", "1d1001", "d0", "1d6;run", "1d6/0"])
    assert.throws(() => parseExpression(s));
});
test("D66 is two D6 digits rather than an integer from 1 through 66", () => {
  const spec = parseExpression("D66");
  assert.equal(spec.d66, true);
  assert.deepEqual(spec.terms, [{ count: 2, sides: 6, sign: 1 }]);
  assert.equal(spec.constant, 0);
  assert.equal(parseExpression("1D66").d66, true);
  assert.throws(() => parseExpression("2D66"));
  assert.throws(() => parseExpression("D66+1"));
});
test("dice commands cannot inject faces, permanent injury, manual success or a clock transition", () => {
  const base = {
    campaignId: randomUUID(),
    activityId: randomUUID(),
    actorId: "pc",
    operationId: randomUUID(),
    requestId: randomUUID(),
    revision: 1,
    operation: "roll",
  };
  for (const extra of [
    { faces: [6] },
    { result: "success" },
    { injury: "applied" },
    { quarter: "Night" },
  ])
    assert.equal(
      rollCommandSchema.safeParse({ ...base, ...extra }).success,
      false,
    );
});
test("profile upgrade preserves existing plan and manifest; missing sources produce explicit review obligations", () => {
  const dir = mkdtempSync(join(tmpdir(), "raven-roll-upgrade-")),
    p = createSyntheticProfile(join(dir, "profile")),
    file = profileFile(p.root),
    repo = new SqliteCampaignRepository(p.database);
  try {
    executeGameplay(
      repo,
      {
        campaignId: p.campaignId,
        actorId: "ilva",
        operationId: randomUUID(),
        campaignRevision: 1,
        activityRevision: null,
        type: "declare",
        text: "Edrus makes camp, Grogahx forages, Rose keeps watch, Elyanna rests.",
      },
      {
        playerId: "trusted-local",
        mode: "trusted-local",
        grants: [{ campaignId: p.campaignId, characterIds: ["ilva"] }],
      },
      file,
    );
    const before = repo.get(p.campaignId),
      plan = repo.db.prepare("SELECT * FROM phase7_activities").all(),
      manifest = readFileSync(file);
    assert.equal(upgradeRollQueue(repo, file).applied, true);
    ensureRollQueue(repo, p.campaignId);
    ensureRollQueue(repo, p.campaignId);
    assert.equal(upgradeRollQueue(repo, file).applied, false);
    assert.deepEqual(repo.get(p.campaignId), before);
    assert.deepEqual(
      repo.db.prepare("SELECT * FROM phase7_activities").all(),
      plan,
    );
    assert.deepEqual(readFileSync(file), manifest);
    assert.equal(requests(repo, p.campaignId).length, 3);
    assert.ok(
      requests(repo, p.campaignId).every(
        (r) =>
          r.status === "awaiting_mechanical_review" &&
          r.review?.includes("Handbook"),
      ),
    );
  } finally {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
