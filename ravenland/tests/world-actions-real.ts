import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SqliteCampaignRepository } from "../src/server/sqlite";
import { worldFixture } from "./fixtures/world-state";
import { dispatchWorldAction } from "../src/server/world/dispatcher";
import { readConsequences } from "../src/server/consequences/store";
import {
  consequenceRulePages,
  injuryObligation,
} from "../src/server/consequences/rules";
// Called only after the original private fifth-printing PDFs were indexed.
export async function realWorldActionTests(
  t: TestContext,
  repo: SqliteCampaignRepository,
  sourceCampaign: string,
) {
  await t.test(
    "World actions: original Slit Throat evidence, isolated four-round deadline, transactional adjudicated search and replay",
    () => {
      const f = worldFixture(":memory:", repo),
        docs: string[] = [];
      try {
        for (const row of repo.db
          .prepare("SELECT * FROM source_documents WHERE campaign_id=?")
          .all(sourceCampaign)) {
          const id = randomUUID(),
            copy = {
              ...row,
              id,
              campaign_id: f.r.id,
              storage_key: randomUUID() + ".pdf",
            },
            keys = Object.keys(copy);
          docs.push(id);
          repo.db
            .prepare(
              "INSERT INTO source_documents(" +
                keys.join(",") +
                ") VALUES(" +
                keys.map(() => "?").join(",") +
                ")",
            )
            .run(
              ...keys.map(
                (k) => (copy as Record<string, string | number | null>)[k],
              ),
            );
          for (const chunk of repo.db
            .prepare("SELECT * FROM source_chunks WHERE document_id=?")
            .all(row.id!)) {
            const c = { ...chunk, id: randomUUID(), document_id: id },
              ks = Object.keys(c);
            repo.db
              .prepare(
                "INSERT INTO source_chunks(" +
                  ks.join(",") +
                  ") VALUES(" +
                  ks.map(() => "?").join(",") +
                  ")",
              )
              .run(
                ...ks.map(
                  (k) => (c as Record<string, string | number | null>)[k],
                ),
              );
          }
        }
        const fact = injuryObligation(
          consequenceRulePages(repo, f.r.id),
          "slash",
          64,
        );
        assert.ok(fact?.lethal, "Actual critical row must establish lethality");
        assert.equal(fact?.deadline?.unit, "rounds");
        const before = JSON.stringify(repo.get(f.r.id)!.session),
          p = f.propose("search");
        assert.equal(
          dispatchWorldAction(p, repo, f.principal).code,
          "duration_required",
        );
        const c = {
          type: "adjudicate",
          campaignId: f.r.id,
          characterId: f.patient.id,
          requestId: randomUUID(),
          pendingId: p.requestId,
          expectedState: f.context().state,
          decision: "approve",
          duration: { unit: "rounds", amount: 1 },
          reason:
            "Explicit test ruling for duration; the book is not claimed to define a one-round search.",
          confirmed: true,
        };
        const result = dispatchWorldAction(c, repo, f.principal);
        assert.equal(result.status, "completed");
        assert.ok(
          result.evidence.length > 1,
          "Actual governing deadline procedure references required",
        );
        assert.equal(dispatchWorldAction(c, repo, f.principal).replayed, true);
        const injury = readConsequences(repo, f.r.id).find(
          (v) => v.id === f.injury.id,
        )!;
        assert.equal(injury.state.deadline!.elapsed, 1);
        assert.equal(injury.state.deadline!.value, 4);
        assert.equal(injury.state.resolution, null);
        assert.equal(JSON.stringify(repo.get(f.r.id)!.session), before);
      } finally {
        for (const id of docs)
          repo.db.prepare("DELETE FROM source_documents WHERE id=?").run(id);
        repo.db.prepare("DELETE FROM campaigns WHERE id=?").run(f.r.id);
      }
    },
  );
}
