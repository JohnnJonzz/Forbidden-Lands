import {
  resolveRuling,
  currentRulingScope,
} from "../src/server/rulings/service";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { worldFixture, syntheticWorldRules } from "./fixtures/world-state";
import {
  executeConsequence,
  syncConsequenceRecords,
} from "../src/server/consequences/service";
import {
  readConsequences,
  newConsequence,
  saveConsequence,
} from "../src/server/consequences/store";
import { CompendiumStore } from "../src/server/compendium/store";
import { treatmentRules } from "../src/server/consequences/rules";
import {
  makeRuling,
  ruleScopeFingerprint,
  saveRuling,
  rulings,
} from "../src/server/rulings/store";
const cmd = (f: ReturnType<typeof worldFixture>, type: string, extra = {}) => ({
  type,
  campaignId: f.r.id,
  characterId: f.patient.id,
  requestId: randomUUID(),
  confirmed: true,
  ...extra,
});
test("defect 1: unauthenticated journey weather ruling is rejected before mutation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruling-auth-")),
    old = process.env.RAVENLAND_DB_PATH;
  process.env.RAVENLAND_DB_PATH = join(dir, "isolated.sqlite");
  const f = worldFixture(process.env.RAVENLAND_DB_PATH);
  try {
    const { POST } = await import("../src/app/api/journey/route");
    const before = JSON.stringify(f.repo.get(f.r.id));
    const response = await POST(
      new Request("http://localhost/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: f.r.id,
          revision: f.r.revision,
          actionId: randomUUID(),
          type: "weather",
          description: "Unauthenticated ruling",
          source: "Manual",
          unverifiedEffects: "",
        }),
      }),
    );
    assert.ok(
      [401, 403].includes(response.status),
      "Unauthenticated journey mutation must be denied",
    );
    assert.equal(JSON.stringify(f.repo.get(f.r.id)), before);
  } finally {
    f.repo.close();
    if (old === undefined) delete process.env.RAVENLAND_DB_PATH;
    else process.env.RAVENLAND_DB_PATH = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
test("defect 2: one scene round advances both active same-clock deadlines exactly once", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const second = newConsequence(
      f.r.id,
      { ...f.injury.source, id: "second", procedureId: "second" },
      "lethal_injury",
      "Second injury",
    );
    second.visibility = "Party Known";
    second.characterIds = [f.patient.id];
    second.state.deadline = structuredClone(f.injury.state.deadline);
    saveConsequence(f.repo, second);
    const c = cmd(f, "elapsed", {
      consequenceId: f.injury.id,
      unit: "rounds",
      amount: 1,
      reason: "One verified scene round.",
    });
    executeConsequence(c, f.repo, f.principal);
    assert.deepEqual(
      readConsequences(f.repo, f.r.id)
        .filter((c) => c.state.deadline)
        .map((c) => c.state.deadline!.elapsed),
      [1, 1],
    );
    executeConsequence(c, f.repo, f.principal);
    assert.ok(
      readConsequences(f.repo, f.r.id)
        .filter((c) => c.state.deadline)
        .every((c) => c.state.deadline!.elapsed === 1),
    );
  } finally {
    f.repo.close();
  }
});
test("defect 3: an explicit adjudication hold survives synchronization", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    executeConsequence(
      cmd(f, "adjudication", {
        consequenceId: f.injury.id,
        note: "Resolve the disputed source interpretation before this procedure.",
      }),
      f.repo,
      f.principal,
    );
    syncConsequenceRecords(f.repo, f.r.id);
    const c = readConsequences(f.repo, f.r.id).find(
      (c) => c.id === f.injury.id,
    )!;
    assert.equal(c.status, "awaiting_adjudication");
    assert.match(c.nextProcedure, /disputed source interpretation/);
  } finally {
    f.repo.close();
  }
});
test("defect 4: a typed scoped Healing override resolves only its matching rule requirement", () => {
  const f = worldFixture();
  try {
    syntheticWorldRules(f.repo, f.r.id);
    const rule = new CompendiumStore(f.repo).save(f.r.id, {
      title: "Healing exception",
      body: "Isolated test exception.",
      topic: "Combat",
      documentType: "House Rule",
      visibility: "Player Visible",
      sourceReference: "Test only",
      overrideScope: "Lifesaving Healing",
    });
    assert.throws(() => treatmentRules(f.repo, f.r.id, f.injury.id));
    const held = rulings(f.repo, f.r.id).find(
      (r) => r.domain === "healing_rule",
    )!;
    resolveRuling(
      {
        campaignId: f.r.id,
        characterId: f.patient.id,
        requestId: randomUUID(),
        rulingId: held.id,
        revision: held.revision,
        expectedScope: currentRulingScope(f.repo, held),
        reason:
          "Explicit scoped test review: use the verified official procedure for this injury.",
        decision: "apply",
        effect: {
          type: "healing_rule",
          consequenceId: f.injury.id,
          rules: [{ id: rule.id, revision: rule.revision }],
          interpretation: "official_in_this_scope",
        },
        confirmed: true,
      },
      f.repo,
      f.principal,
    );
    assert.ok(treatmentRules(f.repo, f.r.id, f.injury.id).sources.length);
    assert.throws(() => treatmentRules(f.repo, f.r.id, "another-injury"));
  } finally {
    f.repo.close();
  }
});
