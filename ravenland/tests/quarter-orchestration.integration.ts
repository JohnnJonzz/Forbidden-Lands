import expectedReadAloudHashes from "./fixtures/encounter-read-aloud-hashes.json";
import { createHash } from "node:crypto";
import { executeActivity } from "../src/server/activities/service";
import { readAloud } from "../src/server/quarter-resolution/director";
import OpenAI from "openai";
import { OpenAIProvider } from "../src/server/ai/provider";
import { AIService } from "../src/server/ai/service";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { SourcebookLibrary } from "../src/server/sourcebooks/library";
import { FileSourcebookStorage } from "../src/server/sourcebooks/storage";
import { SqliteMapStore } from "../src/server/map/store";
import { readGeography } from "../src/server/map/importer";
import { executeJourney } from "../src/server/journey/service";
import { executeDice } from "../src/server/dice/service";
import { executeQuarterResolution } from "../src/server/quarter-resolution/service";
import { activeChatForm } from "../src/lib/journey/chat-engine";
import { expeditionFor } from "../src/lib/journey/expedition";
import { checks } from "../src/server/quarter-resolution/director";
import {
  pathOfForest,
  pathfinder,
} from "../src/server/quarter-resolution/talents";
import { transitions } from "../src/server/transitions/service";
import { quarterConversation } from "../src/server/quarter-resolution/conversation";
test("Phase 6.8f original-PDF coordinator acceptance", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "raven-68f-")),
    file = join(dir, "db.sqlite"),
    repo = new SqliteCampaignRepository(file);
  try {
    const source = repo.create(structuredClone(initialSession)),
      library = new SourcebookLibrary(
        repo,
        new FileSourcebookStorage(join(dir, "books")),
      );
    for (const [name, title] of [
      [
        "Forbidden_Lands_Players_Handbook_5th_printing.pdf",
        "Forbidden Lands Players Handbook",
      ],
      [
        "Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf",
        "Forbidden Lands Gamemasters Guide",
      ],
    ]) {
      const bytes = readFileSync(
          join(
            process.env.RAVENLAND_REAL_SOURCEBOOK_DIR ??
              "/tmp/ravenland-private-sourcebooks",
            name,
          ),
        ),
        doc = await library.upload(
          source.id,
          { title, category: "Rules", visibility: "GM Only" },
          name,
          new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
        );
      await library.index(source.id, doc.document.id);
    }
    const map = new SqliteMapStore(repo);
    map.import(
      await readGeography(
        "data/Ravenland_Campaign_Master.xlsx",
        JSON.parse(readFileSync("config/ravenland-master.json", "utf8")),
      ),
    );
    map.calibrate(
      JSON.parse(readFileSync("config/ravenland-calibration.json", "utf8"))
        .grid,
    );
    function fixture(traveling = true, claimedSuccess = false, forage = false) {
      const s = structuredClone(initialSession);
      Object.assign(s.campaign, {
        hex: "V07",
        terrain: "Dark Forest",
        location: "V07",
        date: "13th Springrise, 1165",
        quarter: "Day",
        weather: "Saved manual clear weather",
      });
      s.messages = [];
      s.journal = [];
      s.characters.forEach((c, i) => {
        c.name = ["Grogahx", "Edrus", "Elyanna", "Rose Underbough"][i];
        c.profession = i === 1 ? "Druid" : c.profession;
        c.sheet = {
          ...Object.fromEntries(
            ["strength", "agility", "wits", "empathy"].flatMap((a) => [
              [`attr-${a}`, "3"],
              [`attr-${a}-regular`, "3"],
            ]),
          ),
          weapons: [],
          gear: [],
          talents:
            i === 1
              ? [{ name: "Path of the Forest", rank: "1", type: "P", desc: "" }]
              : [],
          willpower: "3",
          "skill-survival": "0",
          "skill-scouting": "0",
          "res-food": "D8",
          "res-water": "D8",
        };
      });
      const initial = repo.create(s),
        id = initial.id;
      repo.db
        .prepare(
          "INSERT INTO campaign_sourcebooks (campaign_id,document_id) SELECT ?,id FROM source_documents WHERE campaign_id=?",
        )
        .run(id, source.id);
      const p = {
          playerId: "trusted-local",
          mode: "trusted-local" as const,
          grants: [
            { campaignId: id, characterIds: s.characters.map((c) => c.id) },
          ],
        },
        current = () => repo.get(id)!,
        actor = s.characters[0].id;
      const journey = (values: object) =>
        executeJourney(
          {
            campaignId: id,
            revision: current().revision,
            actionId: randomUUID(),
            ...values,
          },
          repo,
        );
      journey({ type: "quarter-chat-request" });
      const form = activeChatForm(current().session)!;
      journey({
        type: "quarter-chat-submit",
        formId: form.id,
        actorId: actor,
        assisted: {
          autoComplete: true,
          encounterHandling: "AI GM Assisted",
          mode: "On foot",
        },
        ...(!traveling ? { routineActivities: true } : {}),
        draft: {
          ...form.draft,
          traveling,
          destination: traveling ? "V09" : "",
          assignments: form.draft.assignments.map((a, i) => ({
            ...a,
            activity: traveling
              ? i === 1
                ? "Lead the Way"
                : i === 3
                  ? "Keep Watch"
                  : "Hike"
              : forage && i === 1
                ? "Forage"
                : "Rest",
            skill: traveling
              ? i === 1
                ? "Survival"
                : i === 3
                  ? "Scouting"
                  : "No roll"
              : "No roll",
            outcome: claimedSuccess && i === 1 ? "Success" : "",
          })),
        },
      });
      const entryId = activeChatForm(current().session)!.entryId!;
      const command = (operation: string, extra: object = {}, die = () => 1) =>
        executeQuarterResolution(
          repo,
          {
            campaignId: id,
            entryId,
            actorId: actor,
            revision: current().revision,
            requestId: randomUUID(),
            operation,
            ...extra,
          },
          p,
          die,
        );
      const start = (autoComplete = true, handling = "AI GM Assisted") =>
        command("start", {
          confirmed: true,
          options: {
            autoComplete,
            encounterHandling: handling,
            mode: "On foot",
          },
        });
      const roll = (i: number, skill = "Survival", success = true) => {
        const rollId = randomUUID();
        executeDice(
          {
            type: "create",
            campaignId: id,
            actionId: randomUUID(),
            roll: {
              id: rollId,
              characterId: s.characters[i].id,
              skill,
              attribute: success ? [6, 2, 3] : [2, 3, 4],
              skillDice: [],
              negativeSkill: false,
              gear: [],
              artifacts: [],
              successes: success ? 1 : 0,
              pushed: false,
              attributeDamage: 0,
              gearDamage: 0,
              willpower: 0,
              quarterDayId: null,
              requestId: null,
            },
            metadata: {
              attribute: "wits",
              isArmor: false,
              weaponIndex: null,
              weaponDamage: null,
            },
          },
          repo,
          p,
        );
        return rollId;
      };
      return { id, p, current, actor, entryId, command, start, roll };
    }
    await t.test(
      "V07→V09 Day→Evening exactly once; saved rolls and actual no-encounter check; failed Watch is not an attack",
      () => {
        const f = fixture();
        assert.equal(
          map.lookupForCampaign(f.id, "V09")?.terrain,
          "Dark Forest",
        );
        const lead = f.roll(1),
          watch = f.roll(3, "Scouting", false),
          weather = f.current().session.campaign.weather;
        const result = f.start();
        assert.equal(
          result.flow?.status,
          "Quarter completed",
          result.flow?.prompt,
        );
        assert.equal(f.current().session.campaign.hex, "V09");
        assert.equal(f.current().session.campaign.quarter, "Evening");
        assert.equal(f.current().session.campaign.weather, weather);
        assert.equal(
          expeditionFor(f.current().session, f.entryId).entries[0]
            .navigationRollId,
          lead,
        );
        assert.equal(checks(repo, f.id).length, 1);
        assert.deepEqual(checks(repo, f.id)[0].faces, [1, 1]);
        assert.equal(checks(repo, f.id)[0].status, "none");
        assert.equal(
          f.current().session.dice?.find((d) => d.id === watch)?.result
            .successes,
          0,
        );
        assert.equal(transitions(repo, f.id).length, 1);
        f.command("continue", {}, () => 6);
        assert.equal(transitions(repo, f.id).length, 1);
        assert.equal(
          expeditionFor(f.current().session, f.entryId).entries.length,
          1,
        );
      },
    );
    await t.test(
      "explicit Forest activation spends one WP once and preserves original zero successes",
      () => {
        const f = fixture();
        f.start(false);
        const card = f.roll(1, "Survival", false);
        assert.ok(
          pathOfForest(
            repo,
            f.id,
            f.current().session,
            f.current().session.characters[1].id,
            "Lead the Way",
          ),
        );
        assert.equal(
          pathfinder(
            repo,
            f.id,
            f.current().session,
            f.current().session.characters[1].id,
          ).modifier,
          0,
        );
        assert.equal(
          f.command("continue").flow?.status,
          "Awaiting player decision",
        );
        const result = f.command("forest", { rollId: card, confirmed: true });
        assert.equal(
          result.flow?.status,
          "Mechanically complete",
          result.flow?.prompt,
        );
        assert.equal(f.current().session.characters[1].sheet?.willpower, "2");
        assert.equal(
          f.current().session.dice?.find((d) => d.id === card)?.original
            .successes,
          0,
        );
        assert.equal(
          f.current().session.activityOutcomes?.[0].finalSuccesses,
          1,
        );
        f.command("continue");
        assert.equal(f.current().session.characters[1].sheet?.willpower, "2");
        assert.throws(
          () => f.command("forest", { rollId: card, confirmed: true }),
          /current bound|unresolved/,
        );
        assert.match(
          quarterConversation(
            repo,
            f.id,
            f.actor,
            randomUUID(),
            "Finish this quarter-day",
            f.p,
          )!,
          /completed/i,
        );
        assert.equal(f.current().session.campaign.quarter, "Evening");
      },
    );
    await t.test(
      "general Pathfinder ranks retain +1, optional D8 and verified uninterrupted Rest without profession-talent confusion",
      () => {
        const f = fixture(),
          r = f.current();
        r.session.characters[1].sheet!.talents = [
          { name: "Pathfinder", rank: "3", type: "G", desc: "" },
        ];
        r.session.characters[1].sheet!["attr-strength"] = "2";
        repo.update(f.id, r.revision, r.session);
        assert.equal(
          pathOfForest(
            repo,
            f.id,
            f.current().session,
            r.session.characters[1].id,
            "Lead the Way",
          ),
          null,
        );
        f.start(true);
        const rollId = randomUUID();
        executeDice(
          {
            type: "create",
            campaignId: f.id,
            actionId: randomUUID(),
            roll: {
              id: rollId,
              characterId: r.session.characters[1].id,
              skill: "Survival",
              attribute: [6, 2, 3],
              skillDice: [2],
              negativeSkill: false,
              gear: [],
              artifacts: [{ sides: 8, value: 2 }],
              successes: 1,
              pushed: false,
              attributeDamage: 0,
              gearDamage: 0,
              willpower: 0,
              quarterDayId: null,
              requestId: null,
            },
            metadata: {
              attribute: "wits",
              isArmor: false,
              weaponIndex: null,
              weaponDamage: null,
            },
          },
          repo,
          f.p,
        );
        const v = f.command("continue");
        assert.equal(v.flow?.status, "Quarter completed", v.flow?.prompt);
        assert.equal(
          f.current().session.characters[1].sheet!["attr-strength"],
          "3",
        );
        assert.equal(f.current().session.characters[1].sheet!.willpower, "3");
        assert.equal(
          expeditionFor(f.current().session, f.entryId).plan!
            .navigationModifier,
          1,
        );
        assert.equal(
          f.current().session.dice!.find((d) => d.id === rollId)!.original
            .artifacts[0].sides,
          8,
        );
      },
    );
    await t.test(
      "Path of the Forest Forage intervention preserves raw dice and uses existing fresh-food award service",
      () => {
        const f = fixture(false, false, true),
          activity = (values: object) =>
            executeActivity(
              repo,
              {
                campaignId: f.id,
                revision: f.current().revision,
                requestId: randomUUID(),
                actorId: f.actor,
                confirmed: true,
                ...values,
              },
              f.p,
            );
        f.start(false);
        activity({ operation: "configure", season: "Spring" });
        const a = f.current().session.activityState!.entries[0].activities[1];
        activity({
          operation: "prepare",
          assignmentId: a.assignmentId,
          target: "food",
        });
        const request =
            f.current().session.activityState!.entries[0].activities[1]
              .request!,
          rollId = randomUUID(),
          n = request.skillDice + request.modifier;
        executeDice(
          {
            type: "create",
            campaignId: f.id,
            actionId: randomUUID(),
            expectedActivityContext: request.context,
            roll: {
              id: rollId,
              characterId: a.characterId,
              skill: "Survival",
              attribute: Array(request.base).fill(2),
              skillDice: Array(Math.abs(n)).fill(2),
              negativeSkill: n < 0,
              gear: Array(request.gear).fill(2),
              artifacts: [],
              successes: 0,
              pushed: false,
              attributeDamage: 0,
              gearDamage: 0,
              willpower: 0,
              quarterDayId: null,
              requestId: null,
            },
            metadata: {
              attribute: request.attribute,
              isArmor: false,
              weaponIndex: null,
              weaponDamage: null,
            },
          },
          repo,
          f.p,
        );
        assert.equal(
          f.current().session.activityState!.entries[0].activities[1].status,
          "Awaiting Push/keep decision",
        );
        f.command("forest", { rollId, confirmed: true });
        assert.equal(f.current().session.characters[1].sheet?.willpower, "2");
        assert.equal(
          f
            .current()
            .session.characters[1].sheet?.gear?.find(
              (g) => g.item === "Vegetables",
            )?.quantity,
          "1",
        );
        assert.equal(
          f.current().session.dice!.find((d) => d.id === rollId)!.original
            .successes,
          0,
        );
        assert.equal(
          f.current().session.activityState!.entries[0].activities[1].stage,
          "resolved",
        );
      },
    );
    await t.test(
      "verified encounter read-aloud remains distinct from private GM explanation",
      () => {
        for (let n = 1; n <= 43; n++) {
          const scene = readAloud(repo, source.id, n);
          assert.ok(scene, "Missing verified read-aloud for encounter " + n);
          assert.equal(
            createHash("sha256")
              .update(scene.toLowerCase().replace(/[^a-z0-9]/g, ""))
              .digest("hex"),
            (expectedReadAloudHashes as Record<string, string>)[String(n)],
            "Italic read-aloud fidelity mismatch for encounter " + n,
          );
          assert.ok(
            !/STRENGTH \d|SKILLS:|TERRAIN TYPES:/.test(scene),
            "Private body crossed read-aloud boundary " + n,
          );
        }
        const intro = readAloud(repo, source.id, 2);
        assert.ok(intro);
        assert.match(intro, /You hear the sounds of battle/);
        assert.doesNotMatch(
          intro,
          /The elf Heldemin|The adventurers|STRENGTH|SKILLS:/,
        );
      },
    );
    await t.test(
      "hosted owner can authorize only their own WP intervention; party continuation retains its separate authority",
      () => {
        const f = fixture();
        f.start(false);
        const card = f.roll(1, "Survival", false);
        f.command("continue");
        const ownerId = f.current().session.characters[1].id,
          owner = {
            playerId: "edrus-owner",
            grants: [{ campaignId: f.id, characterIds: [ownerId] }],
          };
        const result = executeQuarterResolution(
          repo,
          {
            campaignId: f.id,
            entryId: f.entryId,
            actorId: ownerId,
            requestId: randomUUID(),
            revision: f.current().revision,
            operation: "forest",
            rollId: card,
            confirmed: true,
          },
          owner,
        );
        assert.equal(result.flow?.status, "Ready to resolve");
        assert.equal(f.current().session.characters[1].sheet?.willpower, "2");
        assert.equal(f.current().session.campaign.hex, "V07");
        f.command("continue");
        assert.equal(f.current().session.campaign.hex, "V09");
        assert.equal(f.current().session.campaign.quarter, "Day");
      },
    );
    await t.test(
      "actual positive encounter preserves Watch Push/keep choice and resolves close detection only after keeping the saved failure",
      () => {
        const f = fixture();
        f.roll(1);
        f.command(
          "start",
          {
            confirmed: true,
            options: {
              autoComplete: true,
              encounterHandling: "AI GM Assisted",
              mode: "On foot",
            },
          },
          () => 6,
        );
        assert.equal(checks(repo, f.id)[0].status, "scene");
        assert.equal(f.current().session.campaign.quarter, "Day");
        const watch = f.roll(3, "Scouting", false);
        const paused = f.command("continue");
        assert.equal(paused.flow?.status, "Awaiting player decision");
        assert.match(paused.flow!.prompt, /Keep Watch failed/);
        assert.equal(checks(repo, f.id)[0].detection, "unresolved");
        assert.ok(
          !f
            .current()
            .session.messages.some((m) => m.id.startsWith("quarter-scene:")),
        );
        const kept = f.command("keep", { rollId: watch });
        assert.equal(kept.flow?.status, "Encounter interruption");
        assert.equal(checks(repo, f.id)[0].detection, "close");
        assert.equal(
          f.current().session.dice?.find((d) => d.id === watch)?.status,
          "Submitted",
        );
        assert.equal(f.current().session.campaign.quarter, "Day");
        assert.equal(checks(repo, f.id).length, 1);
      },
    );
    await t.test(
      "manual Success without provenance cannot overwrite a raw zero-success navigation result",
      () => {
        const f = fixture(true, true);
        f.start(false);
        f.roll(1, "Survival", false);
        const state = f.command("continue");
        assert.equal(state.flow?.status, "Awaiting Table GM ruling");
        assert.match(state.flow!.prompt, /disagrees/);
        assert.equal(f.current().session.campaign.hex, "V07");
        assert.equal(f.current().session.characters[1].sheet?.willpower, "3");
        assert.equal(checks(repo, f.id).length, 0);
      },
    );
    await t.test(
      "positive encounter persists across reopen; testing skip preserves faces and scene, resumes actual journey",
      () => {
        const f = fixture();
        f.roll(1);
        f.start(false, "Table GM Review"); // default die 1 gave no encounter; replace only in an isolated fixture before continuation below
        // Separate fixture for a positive first check.
        const g = fixture();
        g.roll(1);
        g.command(
          "start",
          {
            confirmed: true,
            options: {
              autoComplete: true,
              encounterHandling: "Table GM Review",
              mode: "On foot",
            },
          },
          () => 6,
        );
        const before = checks(repo, g.id)[0];
        assert.equal(before.status, "review");
        assert.deepEqual(before.faces, [6, 6]);
        assert.ok(before.entryNumber);
        const reopened = new SqliteCampaignRepository(file);
        try {
          assert.deepEqual(checks(reopened, g.id)[0], before);
        } finally {
          reopened.close();
        }
        assert.throws(
          () =>
            g.command("waive", {
              confirmed: true,
              reason: "Testing this rolled check",
            }),
          /Only this pending/,
        );
        const player = { playerId: "player", grants: g.p.grants };
        assert.throws(
          () =>
            executeQuarterResolution(
              repo,
              {
                campaignId: g.id,
                entryId: g.entryId,
                actorId: g.actor,
                revision: g.current().revision,
                requestId: randomUUID(),
                operation: "skip",
                confirmed: true,
                reason: "For testing",
              },
              player,
            ),
          /assigned Table GM/,
        );
        assert.match(
          quarterConversation(
            repo,
            g.id,
            g.actor,
            randomUUID(),
            "For testing purposes, skip this encounter and continue the story and quarter-day.",
            g.p,
          )!,
          /completed/i,
        );
        const after = checks(repo, g.id)[0];
        assert.equal(after.status, "skipped");
        assert.deepEqual(after.faces, before.faces);
        assert.equal(after.entryNumber, before.entryNumber);
        assert.equal(g.current().session.campaign.hex, "V09");
        assert.equal(g.current().session.campaign.quarter, "Evening");
        assert.equal(
          transitions(repo, g.id)[0].encounterProcedure,
          "skipped_for_testing",
        );
        assert.equal(checks(repo, g.id).length, 1);
      },
    );
    await t.test(
      "real SDK structured provider response dispatches bounded coordinator action; retry cannot advance twice",
      async () => {
        const f = fixture();
        f.start(true);
        f.roll(1);
        let calls = 0;
        const output = {
          narration: "The saved quarter is ready for its verified procedure.",
          memoryProposals: [],
          actions: [
            {
              type: "coordinate_quarter",
              entryId: f.entryId,
              text: "Continue the saved authorized quarter.",
              resolution: null,
            },
          ],
          selectedImageId: null,
        };
        const client = new OpenAI({
            apiKey: "TEST_FIXTURE_ONLY",
            maxRetries: 0,
            fetch: async (_url, options) => {
              calls++;
              const body = JSON.parse(String(options?.body));
              assert.equal(body.text.format.type, "json_schema");
              const events = [
                {
                  type: "response.output_text.delta",
                  delta: JSON.stringify(output),
                },
                {
                  type: "response.completed",
                  response: {
                    id: "resp_fixture",
                    status: "completed",
                    model: "test-sdk",
                    usage: { input_tokens: 20, output_tokens: 10 },
                  },
                },
              ];
              return new Response(
                events
                  .map((e) => "data: " + JSON.stringify(e) + "\n\n")
                  .join(""),
                { headers: { "Content-Type": "text/event-stream" } },
              );
            },
          }),
          previous = process.env.RAVENLAND_AI_MODE;
        process.env.RAVENLAND_AI_MODE = "openai";
        try {
          const service = new AIService(
              repo,
              new OpenAIProvider(client),
              f.p,
              () => 1,
            ),
            request = {
              campaignId: f.id,
              requestId: randomUUID(),
              kind: "quarter",
              entryId: f.entryId,
            };
          const reply = await service.run(request);
          assert.equal(calls, 1);
          assert.equal(reply.actions[0]?.type, "coordinate_quarter");
          assert.equal(f.current().session.campaign.quarter, "Day");
          service.confirmAction(f.id, request.requestId, 0);
          assert.equal(f.current().session.campaign.quarter, "Evening");
          assert.equal(checks(repo, f.id).length, 1);
          service.confirmAction(f.id, request.requestId, 0);
          assert.equal(transitions(repo, f.id).length, 1);
        } finally {
          if (previous === undefined) delete process.env.RAVENLAND_AI_MODE;
          else process.env.RAVENLAND_AI_MODE = previous;
        }
      },
    );
    await t.test(
      "unrolled daily check can be waived, without fabricated dice or reroll on next stationary quarter",
      () => {
        const f = fixture(false);
        const result = f.start(false, "Manual");
        assert.equal(result.flow?.status, "Awaiting Table GM ruling");
        assert.equal(checks(repo, f.id)[0].faces, null);
        f.command("waive", {
          confirmed: true,
          reason: "Testing only this stationary daily check",
        });
        assert.equal(checks(repo, f.id)[0].status, "waived");
        assert.equal(checks(repo, f.id)[0].faces, null);
        assert.equal(f.current().session.campaign.quarter, "Day");
        const done = f.command("complete");
        assert.equal(
          f.current().session.campaign.quarter,
          "Evening",
          done.flow?.prompt,
        );
        assert.equal(
          transitions(repo, f.id)[0].encounterProcedure,
          "waived_for_testing",
        );
      },
    );
  } finally {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
