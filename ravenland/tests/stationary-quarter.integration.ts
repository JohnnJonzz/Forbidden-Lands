import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { initialSession } from "../src/lib/mock";
import { SourcebookLibrary } from "../src/server/sourcebooks/library";
import { FileSourcebookStorage } from "../src/server/sourcebooks/storage";
import { SqliteMapStore } from "../src/server/map/store";
import { readGeography } from "../src/server/map/importer";
import { stationaryFixture } from "./stationary-quarter-fixture";
import {
  quarterConversation,
  completionIntent,
} from "../src/server/quarter-resolution/conversation";
import { executeQuarterResolution } from "../src/server/quarter-resolution/service";
import {
  inspectQuarterRecovery,
  sprainedAnkleRule,
} from "../src/server/quarter-resolution/recovery";
import { checkFor, checks } from "../src/server/quarter-resolution/director";
import { transitions } from "../src/server/transitions/service";
import { guardQuarterNarration } from "../src/server/quarter-resolution/narration";
import { AIService } from "../src/server/ai/service";
import type { GMProvider } from "../src/server/ai/provider";
test("6.8f.1 original-PDF stationary handoff and reviewed correction", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "raven-68f1-")),
    repo = new SqliteCampaignRepository(join(dir, "db.sqlite"));
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
    await t.test(
      "stationary completion aliases reach the saved quarter and explain actual blockers",
      () => {
        const f = stationaryFixture(repo, source.id);
        for (const text of [
          "Complete the Quarter Day",
          "Finish Evening",
          "Advance to Night",
          "Close the current quarter",
          "Return to camp and complete the Evening quarter-day.",
        ]) {
          const reply = quarterConversation(
            repo,
            f.id,
            f.actor,
            randomUUID(),
            text,
            f.principal,
          )!;
          assert.doesNotMatch(
            reply,
            /no active conversational journey|has begun|Night begins/i,
          );
          assert.match(reply, /encounter|party.s response|Scouting/i);
          assert.equal(f.current().session.campaign.quarter, "Evening");
        }
        assert.equal(checks(repo, f.id).length, 1);
        assert.equal(
          completionIntent("Can we finish Evening?", "Evening"),
          null,
        );
        assert.ok(completionIntent("Advance to Morning", "Evening")?.error);
      },
    );
    await t.test(
      "actual source 3 is a fixed nonlethal critical; Move does not erase it; reviewed correction, legal decline and one transition",
      async () => {
        const f = stationaryFixture(repo, source.id),
          before = f.current(),
          push = structuredClone(
            before.session.dice!.find((d) => d.id === f.moveId),
          ),
          camp = structuredClone(before.session.campsites);
        assert.equal(checks(repo, f.id)[0].entryNumber, 3);
        assert.equal(checks(repo, f.id)[0].detection, "safe_distance");
        assert.equal(sprainedAnkleRule(repo, f.id).healing, "D6 days");
        assert.equal(f.start.flow?.status, "Encounter interruption");
        const inspection = inspectQuarterRecovery(repo, f.id, f.entryId);
        assert.equal(inspection.foraging[0].mishap, 3);
        assert.equal(inspection.foraging[0].moves[0].pushed, true);
        assert.equal(inspection.foraging[0].correctionRequired, true);
        assert.equal(
          inspection.foraging[0].currentState.attributes.agility.current,
          2,
        );
        assert.equal(inspection.foraging[0].currentState.willpower, "4");
        const noClose = quarterConversation(
          repo,
          f.id,
          f.actor,
          randomUUID(),
          "Avoid",
          f.principal,
        )!;
        assert.match(noClose, /let it pass|let them pass|Remain/i);
        assert.equal(checks(repo, f.id)[0].status, "scene");
        assert.match(
          quarterConversation(
            repo,
            f.id,
            f.actor,
            randomUUID(),
            "Let them pass without contact",
            f.principal,
          )!,
          /recorded|sprained|Foraging/i,
        );
        assert.equal(checks(repo, f.id)[0].resolutionKind, "declined_contact");
        const preview = inspectQuarterRecovery(repo, f.id, f.entryId),
          command = {
            campaignId: f.id,
            entryId: f.entryId,
            actorId: f.actor,
            requestId: randomUUID(),
            revision: f.current().revision,
            operation: "review-mishap",
            assignmentId: f.activities()[0].assignmentId,
            previewHash: preview.previewHash,
            confirmed: true,
            reason:
              "Reviewed original Foraging D6=3 and fixed blunt 25–26. Snake/Move narration was incorrect. Preserve the pushed roll and its existing consequences.",
          };
        const inspectedHash=preview.previewHash;const note=f.current();note.session.messages.push({id:randomUUID(),role:'player',author:'Grogahx',text:'I am reviewing the saved evidence.'});repo.update(f.id,note.revision,note.session);assert.equal(inspectQuarterRecovery(repo,f.id,f.entryId).previewHash,inspectedHash);command.revision=f.current().revision;
      const player = { playerId: "ordinary", grants: f.principal.grants };
        assert.throws(
          () => executeQuarterResolution(repo, command, player),
          /assigned Table GM/,
        );
        assert.throws(
          () =>
            executeQuarterResolution(
              repo,
              { ...command, previewHash: "stale" },
              f.principal,
            ),
          /stale/,
        );
        executeQuarterResolution(repo, command, f.principal);
        assert.equal(
          f.activities()[0].request?.context.step,
          "forage-injury-duration",
        );
        assert.equal(
          f.current().session.characters[0].sheet?.injuries?.length,
          1,
        );
        f.roll(0, false, 4);
        assert.equal(f.activities()[0].status, "Resolved");
        assert.equal(
          f.current().session.characters[0].sheet?.injuries?.[0].duration,
          "4",
        );
        const service = new AIService(repo, undefined, f.principal, () => 1),
          request = {
            campaignId: f.id,
            requestId: randomUUID(),
            kind: "chat",
            characterId: f.actor,
            action: "Return to camp and complete the Evening quarter-day.",
          };
        const reply = await service.run(request);
        assert.match(reply.narration, /Night/);
        assert.equal(f.current().session.campaign.quarter, "Night");
        assert.equal(f.current().session.campaign.hex, "V09");
        assert.equal(
          f.current().session.campaign.weather,
          before.session.campaign.weather,
        );
        assert.deepEqual(f.current().session.campsites, camp);
        assert.deepEqual(
          f.current().session.dice!.find((d) => d.id === f.moveId),
          push,
        );
        assert.equal(
          f.current().session.characters[0].sheet?.["attr-agility"],
          before.session.characters[0].sheet?.["attr-agility"],
        );
        assert.equal(checks(repo, f.id).length, 1);
        assert.equal(transitions(repo, f.id).length, 1);
        assert.equal(
          f
            .current()
            .session.messages.filter((m) => m.id.startsWith("transition:"))
            .length,
          1,
        );
        assert.equal(
          f.current().session.chatJourney?.forms.at(-1)?.quarter,
          "Night",
        );
        assert.equal((await service.run(request)).replayed, true);
        assert.equal(transitions(repo, f.id).length, 1);
      },
    );
    await t.test(
      "controlled provider cannot stream or save false Night, avoidance, or snake-defense success",
      async () => {
        const f = stationaryFixture(repo, source.id),
          bad =
            "The snake was avoided. The orcs were avoided. Evening has ended. Night has begun.",
          provider: GMProvider = {
            async generate() {
              return {
                provider: "openai",
                model: "controlled",
                inputTokens: 1,
                outputTokens: 1,
                output: {
                  narration: bad,
                  actions: [],
                  memoryProposals: [],
                  selectedImageId: null,
                },
              };
            },
            async test() {
              return { model: "controlled", inputTokens: 0, outputTokens: 0 };
            },
          };
        const previous = process.env.RAVENLAND_AI_MODE;
        process.env.RAVENLAND_AI_MODE = "openai";
        try {
          const events: any[] = [],
            reply = await new AIService(repo, provider, f.principal).run(
              {
                campaignId: f.id,
                requestId: randomUUID(),
                kind: "chat",
                characterId: f.actor,
                action: "Describe the camp scene.",
              },
              (e) => events.push(e),
            );
          assert.doesNotMatch(
            reply.narration,
            /Night has begun|Evening has ended|orcs were avoided|snake was avoided/,
          );
          assert.ok(
            events
              .filter((e) => e.type === "text")
              .every((e) => !e.text.includes("Night has begun")),
          );
          assert.equal(f.current().session.campaign.quarter, "Evening");
          assert.equal(checks(repo, f.id)[0].status, "scene");
          assert.match(
            guardQuarterNarration(repo, f.id, bad),
            /authoritative clock remains Evening/,
          );
        } finally {
          if (previous === undefined) delete process.env.RAVENLAND_AI_MODE;
          else process.env.RAVENLAND_AI_MODE = previous;
        }
      },
    );
  } finally {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
