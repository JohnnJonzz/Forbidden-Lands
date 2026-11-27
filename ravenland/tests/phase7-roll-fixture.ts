import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createSyntheticProfile } from "../scripts/phase7-setup";
import { SqliteCampaignRepository } from "../src/server/sqlite";
import { SourcebookLibrary } from "../src/server/sourcebooks/library";
import { FileSourcebookStorage } from "../src/server/sourcebooks/storage";
import { upgradeRollQueue } from "../src/server/gameplay/upgrade";
import { profileFile } from "../src/server/gameplay/profile";
import { executeGameplay } from "../src/server/gameplay/service";
import { executeRoll } from "../src/server/gameplay/roll-engine";
import { requests } from "../src/server/gameplay/roll-store";
import type { CharacterPrincipal } from "../src/server/character-access";
let shared:
  | Promise<{
      asset: { key: string; bytes: Buffer };
      documents: Record<string, unknown>[];
      chunks: Record<string, unknown>[];
    }>
  | undefined;
function original() {
  return (shared ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), "raven-original-rolls-")),
      p = createSyntheticProfile(join(dir, "profile")),
      repo = new SqliteCampaignRepository(p.database);
    try {
      const file = join(
          process.env.RAVENLAND_REAL_SOURCEBOOK_DIR ??
            "/tmp/ravenland-private-sourcebooks",
          "Forbidden_Lands_Players_Handbook_5th_printing.pdf",
        ),
        bytes = readFileSync(file),
        library = new SourcebookLibrary(
          repo,
          new FileSourcebookStorage(p.sourcebooks),
        );
      const upload = await library.upload(
        p.campaignId,
        {
          title: "Forbidden Lands Players Handbook",
          category: "Rules",
          visibility: "GM Only",
        },
        "Forbidden_Lands_Players_Handbook_5th_printing.pdf",
        new ReadableStream({
          start(c) {
            c.enqueue(bytes);
            c.close();
          },
        }),
      );
      await library.index(p.campaignId, upload.document.id);
      return {
        asset: {
          key: String(
            repo.db.prepare("SELECT storage_key FROM source_documents").get()!
              .storage_key,
          ),
          bytes,
        },
        documents: repo.db
          .prepare("SELECT * FROM source_documents")
          .all() as Record<string, unknown>[],
        chunks: repo.db.prepare("SELECT * FROM source_chunks").all() as Record<
          string,
          unknown
        >[],
      };
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  })());
}
export async function rollFixture(directory?: string) {
  const root = directory ?? mkdtempSync(join(tmpdir(), "raven-7b-")),
    p = createSyntheticProfile(join(root, "profile")),
    file = profileFile(p.root),
    repo = new SqliteCampaignRepository(p.database),
    id = p.campaignId;
  const book = await original();
  writeFileSync(join(p.sourcebooks, book.asset.key), book.asset.bytes, {
    mode: 0o600,
  });
  for (const [table, rows] of [
    ["source_documents", book.documents],
    ["source_chunks", book.chunks],
  ] as const)
    for (const row of rows) {
      const copy = { ...row };
      if ("campaign_id" in copy) copy.campaign_id = id;
      const names = Object.keys(copy);
      repo.db
        .prepare(
          "INSERT INTO " +
            table +
            " (" +
            names.join(",") +
            ") VALUES (" +
            names.map(() => "?").join(",") +
            ")",
        )
        .run(...(Object.values(copy) as any[]));
    }
  upgradeRollQueue(repo, file);
  const principal: CharacterPrincipal = {
      playerId: "trusted-local",
      mode: "trusted-local",
      grants: [
        {
          campaignId: id,
          characterIds: repo.get(id)!.session.characters.map((c) => c.id),
        },
      ],
    },
    actor = "ilva";
  const plan = () =>
    executeGameplay(
      repo,
      {
        type: "declare",
        text: "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.",
        campaignId: id,
        actorId: actor,
        operationId: randomUUID(),
        campaignRevision: repo.get(id)!.revision,
        activityRevision: null,
      },
      principal,
      file,
    );
  const command = (
    r: ReturnType<typeof requests>[number] | null,
    operation: string,
    extra: object = {},
  ) => ({
    campaignId: id,
    activityId: repo.db
      .prepare(
        "SELECT current_activity_id FROM phase7_campaigns WHERE campaign_id=?",
      )
      .get(id)!.current_activity_id,
    actorId: r?.characterId ?? actor,
    operationId: randomUUID(),
    requestId: r?.id ?? null,
    revision: r?.revision ?? null,
    operation,
    ...extra,
  });
  const run = (
    r: ReturnType<typeof requests>[number] | null,
    operation: string,
    value = 6,
    extra: object = {},
  ) =>
    executeRoll(
      repo,
      command(r, operation, extra),
      principal,
      file,
      () => value,
    );
  return {
    root,
    p,
    file,
    repo,
    id,
    principal,
    actor,
    plan,
    command,
    run,
    all: () => requests(repo, id),
    find: (procedure: string) =>
      requests(repo, id).find(
        (r) => r.procedure === procedure && r.status !== "superseded",
      )!,
    close() {
      repo.close();
      if (!directory) rmSync(root, { recursive: true, force: true });
    },
  };
}
