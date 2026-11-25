# Phase 7.0A — branch and architecture foundation

This commit implements **7.0A only** on `feature/phase-7-narrative-gm`. It is a stationary **planning** foundation, not a playable replacement for all Phase 6 mechanics. The implementation SHA is the commit containing this report; the delivery message supplies the exact SHA and verified GitHub link.

## Preservation and isolation

| Reference | Preserved baseline |
| --- | --- |
| Original `ravenland-ai-gm-prototype` | `41a274aeb15e66aeb86c7eff3f4a8322084fa15d` |
| Archive `archive/phase-6-baseline` | Same exact commit |
| Phase 7 branch base | Same exact commit |

The original baseline contains completed Phase 6.8f.1. Both new references were pushed and verified before application edits. The original worktree was clean. No reset, rebase, force push, merge into Phase 6, default-branch change, or live campaign adoption is part of this milestone. Only the Phase 7 feature branch receives implementation commits.

The normal storage strategy is SQLite at `RAVENLAND_DB_PATH` (default `data/ravenland.sqlite`), with private image/sourcebook directories selected by `RAVENLAND_IMAGE_DIR` and `RAVENLAND_SOURCEBOOK_DIR`, otherwise beside the database. Map/workbook/source fixtures are in `data/` and can have separate configured paths. They are not Git-backed campaign backups.

**No live campaign database was present in this workspace. No live Ravenland Mysteries backup, migration, V09 repair, or weather activation is claimed.** The existing map, workbook, PDFs and static source assets were retained. Test databases, screenshots and backups stay outside Git.

The explicit development profile has its own database, image directory, sourcebook directory and manifest. Database and profile UUIDs must match. Startup rejects missing profiles, mismatched paths, symlink redirection and the default campaign database. A request to the Phase 7 API without its runtime profile rejects before opening the default database. Synthetic profile creation refuses an existing directory. There is no existing-campaign adoption command in 7.0A.

A fresh, unused synthetic profile is available in this workspace:

- Directory: `/workspace/phase7-development`.
- Database: `/workspace/phase7-development/campaign.sqlite`.
- Campaign: `231b619c-afa5-4c77-b4fe-53dc90cb12e2`.
- Starting scene: synthetic V09, 13th Springrise 1165, Evening, no campsite.
- Characters: Grogahx, Edrus, Elyanna, Rose Underbough. Names/scene are test fixtures, not a copy of Ravenland Mysteries.
- Stopped synthetic backup: `/workspace/phase7-development-backup-7a`, including profile, images, sourcebooks, map, workbook and static source directory. This is not a live campaign backup.

## Architecture inventory and replacement boundary

| Service / data | 7.0A treatment |
| --- | --- |
| `src/server/sqlite.ts`, existing campaign/session schema | Reused persistence and public character roster; campaign clock remains authoritative. Enrolled campaigns reject legacy workflow, saved-dice, clock, weather, campsite and exploration mutation through generic session updates. Character sheet fields remain editable. Party roster changes require future plan review. |
| `character-access.ts`, `local-play.ts`, `narrative/authority.ts`, `mutation-authority.ts` | Reused real authentication, grants and Table GM identity. Narrative text cannot grant authority. Collective planning requires a trusted local controller or actual grants for every party member. |
| `src/lib/calendar.ts`, `src/lib/campsites.ts` | Reused actual date formatting and occupied-campsite lookup for the view. No clock or campsite mutation. |
| Character sheet, equipment/resources, images, portability | Retained existing services and data; no sheet redesign or migration. Sheet-field persistence remains independent. Full sheet-roll integration is 7.0B, not enabled here. |
| `src/lib/dice`, `src/server/dice`, combat engine, Push/WP | Preserved unchanged as reusable primitives/history. Not invoked by 7.0A planning. Legacy dice/combat orchestration is blocked for enrolled campaigns until its Phase 7 operations exist. |
| Calendar/time/injury, `activities/rules.ts`, weather/continuity services | Preserved rules and histories. No reinterpretation of seasons, healing, resources or weather. Phase 7 mechanical invocation awaits later milestones. |
| Map/geography, journal, sourcebook library/retrieval, compendium and `ai/memory.ts` | Preserved, not replaced. No private source content is returned by the new planning API. No sourcebook lookup or memory mutation is required for declaring a plan. |
| `journey/service.ts`, `activities/service.ts`, `quarter-resolution/service.ts`, old `AIService.run` | Bypassed, not wrapped or deleted. Explicit service guards reject enrolled campaigns before those handlers create plans, receipts or AI requests. Shared legacy request guard also blocks dice/combat/consequence/logistics progression. |
| Old combat/consequence GET synchronization and reset | Explicit enrollment guards prevent old read-side reconciliation and reset of a Phase 7 campaign. |
| Old CampaignApp / quarter-day forms | Never mounted for an enrolled campaign entry route. The isolated profile root redirects to its Phase 7 screen. The dedicated screen does not request a Phase 6 form or coordinator. |

A profile-wide API boundary also disables legacy administrative/gameplay mutations in the explicit synthetic launcher, while allowing the new planning endpoint, player access and existing character/image editing. Unenrolled Phase 6 campaigns running normally retain their old workflows. Historical code, the 28 original migrations, tables and receipts remain intact.

## Changed files

- New engine/schema: `src/lib/gameplay.ts`, `src/server/gameplay/{service,intent,profile,runtime,boundary}.ts`, and its explicit `migrations/001_foundation.sql`.
- New entry points: `src/app/api/gameplay/route.ts`, `src/app/campaigns/[campaignId]/play/page.tsx`, `src/components/gameplay-app.tsx` and its CSS module. Existing root/campaign pages redirect enrolled profiles.
- Development/backup tooling: `scripts/{phase7-setup,phase7-backup,dev-phase7}.ts` and npm scripts in `package.json`.
- Legacy guards: repository, request epoch, mutation authority, activity/quarter-resolution/AI/consequence services, campaign reset and combat GET.
- Acceptance evidence: `tests/gameplay.test.ts`, `tests/gameplay-browser.cjs`, and this report. No old migrations, private PDFs or campaign data are changed.

## One authoritative planning state

`src/lib/gameplay.ts` defines strict typed commands, state and saved answers. `src/server/gameplay/service.ts` owns both conversation and planner inputs. `intent.ts` is a bounded stationary declaration parser for this milestone, not a general AI GM or a repair to the Phase 6 router.

There is one current activity pointer per enrolled campaign. Its record contains the actual party assignments, immutable clock/location reference, material clarification obligations, status and revision. The reference binds the plan to the existing authoritative campaign clock; it is not a second mutable calendar.

A partial declaration creates one draft. Follow-up assignments finish that same activity ID. A complete equivalent declaration through the other input returns the same activity. Rest and Sleep remain distinct. Unknown or ambiguous choices require clarification. Questions, historical statements, travel, combat and time-advancement commands cannot manufacture a completed activity.

Writes use an immediate SQLite transaction, optimistic campaign/activity revisions and persisted operation IDs. Exact retries survive process restart. A changed payload cannot reuse an operation ID. Stale commands cannot create a competing plan. Failed receipt storage rolls back activity, pointer and event together. An unexpected external clock change makes the existing plan stale; it does not repair, replay or overwrite history.

There is one obligation list on that activity. In 7.0A it contains a material plan choice or the explicit milestone capability blocker. No hidden Phase 6 form, day-tracker workflow or second outcome list is created.

### Migration

`src/server/gameplay/migrations/001_foundation.sql` creates five tables:

- `phase7_schema_migrations` — explicit profile schema version.
- `phase7_campaigns` — enrollment and current activity pointer.
- `phase7_activities` — one canonical activity JSON record, with a unique quarter identity index.
- `phase7_commands` — idempotent command receipts, **not quarter completion receipts**.
- `phase7_events` — planning conversation/audit events.

This SQL is outside the legacy auto-migration directory. Only explicit synthetic profile creation applies it, after constructing a new private database using the existing 28 migrations. Installing the branch or opening a Phase 6 campaign does not enroll it or apply Phase 7 SQL.

### Dice, AI and completion truth

**Dice binding is not implemented in 7.0A.** Procedures, roll requests, saved roll IDs, effects, encounters and outcomes are strictly empty in schema version 1. The schema refuses fabricated roll IDs or effects. There is no enabled completion operation, no transition receipt and no elapsed-quarter change.

The accepted example uses **0 AI calls**. It runs the bounded declaration parser and deterministic planning service. There was **no live OpenAI test** and no claim of general natural-language GM reasoning. The view explicitly labels its planning-only capability. Sourcebook and historical AI regression tests use their existing controlled providers; they are separate from this call-count claim.

No new official mechanical rules are asserted by A. Original fifth-printing Handbook and Gamemaster's Guide fixtures validate retained rules/retrieval in the existing PDF regression suite. No PDFs, full extracted text, private campaign snapshots or source-body logs are committed.

## Validation

Results: 20 focused foundation tests passed; the broader regression run passed 594 tests (including the first 17 foundation tests). The original-PDF/retrieval check passed its 592-test regression snapshot and all 289 original-PDF tests, with no skips or failures. The final focused checks additionally cover missing runtime profiles and redirected backup destinations, and legacy consequence read synchronization. The additional legacy GM charter/consequence suite passed 11 tests after the final read-side guard. Production build and typecheck passed. Real desktop/mobile Chromium acceptance passed; the final delivery message confirms remote SHA verification. Commands:

```sh
npm run test:gameplay
npm test
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
npm run test:gameplay:browser
npm run typecheck
npm run build
```

The new focused suite checks profile opt-in, preservation of legacy startup, conversation/planner equivalence in both directions, same-ID clarification, restart/retry, two-connection stale rejection, transactional failure, ambiguous/unsupported intent, actual grants, schema limits, legacy-handler protection, stale clocks and stopped backup restoration with asset hashes.

Real Chromium acceptance uses a temporary profile through the actual trusted local launcher at 1440×1000 and 390×844. It checks route redirection, partial-to-complete planning, planner equivalence, changed-plan rejection, disabled completion, reload, server restart, no mobile overflow, no Phase 6 gameplay API calls from the screen (an explicit legacy-write probe was denied with HTTP 409), no old workflow records and an unchanged campaign record. Desktop/mobile screenshots were inspected outside Git. No scene transition or encounter success is implied by these planning checks.

## Try the isolated milestone

In this prepared workspace:

```sh
cd /workspace/Forbidden-Lands/ravenland
npm run dev:phase7 -- --directory /workspace/phase7-development --port 3000
```

Open `http://127.0.0.1:3000/campaigns/231b619c-afa5-4c77-b4fe-53dc90cb12e2/play` **on the same computer running the server**. This is a loopback development address, not a public deployment or a GitHub-hosted app. The root address redirects to this synthetic campaign. A remote cloud browser requires a supported shared desktop; this trusted-local launcher does not authorize public/forwarded connections.

Declare:

> Grogahx makes camp, Edrus forages, Elyanna keeps watch, and Rose rests.

Open **Optional activity planner** and save those same choices. The activity ID stays the same; Evening does not become Night. Reloading preserves the plan. A different plan needs a future reviewed change operation and is deliberately rejected here.

On another checkout/computer, install the existing project dependencies, then create a **new** private directory:

```sh
npm run phase7:setup -- --directory /absolute/private/new-phase7-directory
npm run dev:phase7 -- --directory /absolute/private/new-phase7-directory --port 3000
```

Use the campaign ID printed by setup. Do not point this command at a live database or an existing directory. Creation failure leaves a refused/incomplete directory for inspection rather than deleting files. Restart with `dev:phase7`, not setup; setup never overwrites an established profile.

For browser automation, install Playwright in the test environment (or provide it via `NODE_PATH`) and make Chromium available through `PLAYWRIGHT_EXECUTABLE_PATH`. This does not add a production dependency. Managed-workspace acceptance used `/usr/bin/chromium` and the already installed runtime Playwright.

## Backup, restoration and future adoption

Before any future live adoption, stop **all application writers**, identify actual configured storage paths, and make a private backup. This command requires explicit paths and a new output directory; it refuses asset-tree symlinks. Include all configured campaign assets, profile metadata where applicable, map/workbook and any other upload/source directories in `--assets-json`:

```sh
npm run phase7:backup -- \
  --database /actual/private/campaign.sqlite \
  --output /private/new-backup-directory \
  --assets-json '{"images":"/actual/images","sourcebooks":"/actual/sourcebooks","map":"/actual/map.png","workbook":"/actual/workbook.xlsx"}' \
  --quiesced
```

`--quiesced` is the operator's assertion that writers are stopped; the script cannot stop an unknown live service. It uses SQLite's backup API, copies files and writes SHA-256 hashes and original source paths to `backup-manifest.json`. A failed backup is incomplete and must not be used as a verified restore point. The synthetic backup/restore test verifies the campaign record and asset bytes, and SQLite integrity.

To roll back data, keep writers stopped, verify manifest hashes, restore the database **and matching assets together** to their original/configured paths, and use the compatible baseline application. For a Phase 7 profile, restore its matching manifest too. A manifest names its original absolute paths; moving a profile requires an explicit reviewed relocation, not merely copying the manifest. Keep backups private. Branch checkout alone cannot undo migrations or state changes.

For now, returning to the archived Phase 6 code with its separate original database is the rollback boundary; the live database was never opened here. There is no authorization or implementation for automatic live adoption, date correction, pending-V09 reconciliation, weather activation, historical replay or injury repair in A.

## Remaining milestones

7.0B must implement persistent procedure/roll requests, actual saved sheet-roll binding, universal dice and legal Push/interventions. 7.0C adds mechanical stationary completion and audited injury correction. 7.0D adds encounter checkpoints; 7.0E handles travel. Plan changes, a hosted player UI and general AI GM interpretation also need explicit supported operations. No later milestone is reported complete or started by this commit.
