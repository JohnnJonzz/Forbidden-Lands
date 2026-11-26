# Player's Handbook PDF retrieval investigation

## What was and was not available

The checkout was clean at commit `a32a987`. No persisted application SQLite database or sourcebook PDFs were present in the workspace. Loading the app's normal environment configuration reported `databaseAvailable: false`, `customDatabaseConfigured: false`; no credentials were printed. The earlier handbook attachment could not be resolved by the file service. Therefore **the real handbook registration, file accessibility, extraction, indexing, permission metadata, source/chunk IDs and printed-25 physical mapping could not be inspected**. These remain unverified, not assumed broken or absent from the live application.

The evidence below comes from actual SQLite/FTS queries and real generated-PDF upload/extraction/persistence, **not mocked searches or a model-generated answer**. The generated PDF is explicitly a synthetic integration fixture, not the official fifth-printing handbook. No official handbook content or new curated summary was added to production.

## Reproduced code defects and exact loss stages

Before edits, an isolated persisted SQLite library held an authorized source titled `Player's Handbook`, with a page-number heading and a standalone `HUNTER` entry in its body. All five requested raw search queries returned the target chunk. Two pipeline probes then showed:

| Probe | Before fix | After fix |
| --- | --- | --- |
| Exact “Using … find … Identify …” reproduction | `general_conversation`; no searches; zero selected passages | `rules_reference`, character profile, PDF-only; target passage selected |
| “What are the Hunter profession skills?” | Raw FTS finds the chunk, then candidate is rejected as `unrelated`; zero selected passages | Body entry recognized; target passage selected |

The first defect was an intent gate: the explanation patterns did not recognize reference commands such as `find` and `identify`. The second was a coverage/ranking gate: a profession candidate required the requested entry in title/heading/primary topic. PDF extraction sets a chunk heading from its first short text line, which can be a running page number. A correctly extracted standalone `HUNTER` body heading was consequently insufficient, and the profession-specific rejection removed it **before** deduplication, context budgeting or the model call.

The existing pipeline did search PDFs without requiring a curated summary once retrieval was enabled. No physical-page filter existed in this path. Thus no evidence supported a wrong hardcoded pagination offset, paid-model failure or missing curated summary as the cause of these reproduced defects. Whether these defects explain the deployed instance's reported response still requires its actual stored source/diagnostic report.

## Raw FTS results

The baseline persisted record returned one relevant hit for each query both before and after the fix:

- `Hunter`
- `Hunter profession`
- `Stealth Move Marksmanship Scouting Survival`
- `Key Attribute Agility`
- `Player's Handbook Hunter`

The raw index did not need repair in this reproduction. The fix changes routing/selection, not those stored postings. The stronger regression uploads a generated PDF through `SourcebookLibrary.upload`, extracts it using the real PDF worker, writes actual chunks/FTS rows, closes/reopens SQLite, reruns all five searches and verifies the final selected chunk. Source/document and chunk IDs are read from the actual fixture records and checked stable through retrieval; they are temporary test IDs, **not** IDs from the unavailable live library.

## Small corrections

- Reference commands are recognized in reference-command positions, without converting “We find the hunter at camp” into a rules question. Named skill entries can use the same character-reference path; generic phrases such as “their skill rolls” are not treated as named skills.
- PDF evidence can recognize a standalone requested entry inside the chunk body despite a numeric/running header. Its content window is conservatively bounded before another all-caps entry and still must satisfy substantive-content and requirement checks. A prose mention or another profession's skill list alone cannot qualify.
- Explicit original/official-PDF-only reference requests exclude curated candidates. Named PDF sources resolve only among **Indexed, Public Rules** documents in the existing Rules/Bestiary/House Rules categories, using title/filename normalization. Missing or private sources do not fall back silently to another named book. Negative PDF instructions are not treated as positive requests.
- Source restrictions are reference-mode preferences, not permission to ignore campaign house rules during gameplay adjudication. Existing house-rule authority, source visibility, retry limits, metadata/grouping and context budgets remain intact.
- Authorized diagnostics add bounded PDF search traces: generated query, initial/targeted stage, player scope, bound source IDs when applicable and raw hit document/chunk IDs/physical pages. These are administrator audit data and remain stripped from public saved snapshots. No prompts, source bodies, credentials or GM-only titles are logged.
- No database migration, automatic reindex, source reclassification, curated content edit, campaign update or general AI GM instruction/personality change was made.

## Printed and physical pages

Stored `start_page`/`end_page` values and ordinary source citations remain **1-based physical PDF pages**. A request such as “printed page 25” now has a separate structured plan reference. It is not converted into `physical_page = 25`, and no unverified offset is applied. The retrieval notice explicitly says that printed correspondence is unverified; it does not invent a printed citation.

The read-only audit re-extracts the registered file to inspect PDF page-label metadata and numeric footer labels observed in the bottom 12% of page coordinates. It reports these separately from physical page numbers. Footer observations are evidence for manual verification, not a universal pagination rule: multiple numeric footer items, unusual layouts, rotations or absent labels can be ambiguous. There is no automatic printed-page mapping backfill.

In the controlled generated-PDF fixture, **physical page 3 contains the explicitly drawn footer `25` and Hunter entry**. The audit observes that footer and the stored/extracted expected terms, while retrieval selects physical page 3 for the printed-page-25 request. This deliberately avoids any dependence on a real-book offset. **The actual fifth-printing handbook's physical page for printed 25 remains unknown here.**

## Run the audit against the actual persisted library

Use the machine/storage where the real application data resides. In `ravenland/`, the simplest command is `npm run sourcebooks:diagnose`. It reads the configured existing database, selects the active campaign without modifying it, and locates a single public handbook by title/filename (even if processing is incomplete). If several copies exist or paths differ, provide explicit identifiers/paths:

```bash
npm run sourcebooks:diagnose -- \
  --database /path/to/existing/ravenland.sqlite \
  --campaign CAMPAIGN_UUID \
  --source HANDBOOK_SOURCE_UUID \
  --sourcebook-dir /path/to/private/sourcebooks
```

The database defaults to the existing `RAVENLAND_DB_PATH` or normal app path; storage defaults to `RAVENLAND_SOURCEBOOK_DIR` or the database's sibling `sourcebooks` directory. Explicit paths are preferable when diagnosing a remote/local mismatch. Do not share API keys or `.env` files.

The audit opens SQLite with `readOnly: true` and `query_only`, skips initialization/migrations, never creates a missing database and never calls `current()` or changes the active campaign. It requires the current schema (through 014); audit an older database with its compatible checkout or explicitly upgrade a backup using the normal process first. Storage reads no longer create missing directories. PDF extraction runs in the existing bounded child process; it does not reindex or write the file. No OpenAI call is made.

Output includes:

1. Authorized source ID/title, status, processed/page counts, file accessibility and extraction outcome;
2. chunk count versus actual FTS posting count;
3. relevant physical pages, PDF labels and observed footer labels, with expected-term presence in both file and stored text;
4. all five raw query results with document/chunk IDs and physical pages;
5. exact-question intent/profile/source constraints, searches, candidate exclusions, coverage, token budgeting and final selected IDs/pages.

Private or ineligible sources yield `not_found_or_not_authorized` without disclosing their metadata. Confirm classification/visibility through the existing GM-unlocked Sourcebook Library if necessary; the audit never weakens them. Missing files, incomplete processing, absent chunks/postings and file-vs-index term mismatches remain visible conditions for investigation. If an actual indexing defect is demonstrated, use the existing explicit authorized reindex action after checking storage; no speculative repair is performed by this command.

## Files changed

- `src/lib/rules/source-request.ts`, `planner.ts`: source/page preferences, reference commands, named-reference routing.
- `src/server/sourcebooks/planner-evidence.ts`: conservative PDF body-heading evidence.
- `library.ts`, `retrieval.ts`, sourcebook types: authorized named-source binding and bounded search traces.
- `scripts/extract-sourcebook.mjs`, `extract.ts`: optional page-label/footer evidence for read-only inspection; indexed source content remains the same.
- `src/server/sqlite.ts`, sourcebook `storage.ts`: explicit read-only repository mode and non-creating storage reads.
- `src/server/sourcebooks/diagnose.ts`, `scripts/diagnose-handbook.ts`: local audit command.
- `tests/handbook-pdf.test.ts`, `handbook-pdf-browser.cjs`, PDF fixture helper and package scripts: real PDF/FTS/browser regressions.

The existing Rules Library metadata, normalization, grouping, citations, player authorization and GM instructions are preserved.

## Checks and remaining limits

```bash
npm test
npm run typecheck
npm run build
npm run test:handbook-pdf
npm run test:sourcebooks
npm run test:retrieval-planner
npm run test:procedure-retrieval
npm run test:rules-metadata
npm run test:ai
npm run test:ai-diagnostics
npm run test:persistence
```

The five new integration tests exercise real generated-PDF upload/extraction and persisted FTS/restart, all requested raw searches and the exact Hunter question, separate printed/physical evidence through the read-only CLI, source/citation stability, PDF-only fallback for Hunter/Fighter/Stealth/combat, curated compatibility, GM-only exclusion and unchanged campaign mechanics, plus rejection of illustration-only/body-mention false matches. The browser test uploads/indexes the generated PDF through real endpoints and checks raw lookup, GM-authorized trace, exact chat input and selected PDF passage reaching the official SDK. Its provider transport is fake; it verifies request context, not live answer accuracy.

Remaining limits: actual live source IDs, upload/extraction/index state, physical/printed pagination and the deployed instance's root cause remain unverified until its database/file or audit report is available. Standalone-heading and named-source heuristics can miss OCR artifacts, odd layouts or abbreviated metadata. The audit does not perform OCR, guess offsets, create a canonical skill registry or certify complete mechanical correctness. Footer labels are diagnostic evidence only; original book citations remain physical pages. No successful mocked narration is used as proof that the real handbook was repaired.
