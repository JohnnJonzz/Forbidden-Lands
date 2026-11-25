# Phase 7.0B — persistent roll queue and universal dice

Branch: `feature/phase-7-narrative-gm`. Base: completed 7.0A at `9980662ef73b8f5e0658a054a083a1fe04579360`. The implementation SHA is the commit containing this report; the delivery message supplies its exact SHA and verified GitHub link.

This milestone implements dice collection and deterministic follow-ups. **Quarter-Day completion is not enabled until 7.0C.** Mechanically determined activity consequences remain separate from permanent character/campsite/inventory application. No travel or encounter scenes are implemented here.

## Preservation and upgrade

`ravenland-ai-gm-prototype` and `archive/phase-6-baseline` remain at `41a274aeb15e66aeb86c7eff3f4a8322084fa15d`. Only the Phase 7 branch receives this implementation. There is no merge into Phase 6, force push, default-branch change or live campaign adoption.

The existing workspace profile `/workspace/phase7-development` was backed up while stopped to `/workspace/phase7-development-backup-before-7b`, then explicitly upgraded. It had one synthetic campaign, zero saved activities and zero indexed sourcebooks. Its manifest, campaign, asset paths and files were preserved. This is **not** a backup or modification of Ravenland Mysteries. All automated/destructive scenarios use disposable profiles.

The new explicit migration is `src/server/gameplay/migrations/002_roll_queue.sql`:

| Table | Authority |
| --- | --- |
| `phase7_roll_requests` | Typed request, dependencies, verified expression/modifiers, sources, original/final result, decisions, revisions and audit. A unique index prevents competing active procedures for the same assignment. |
| `phase7_roll_bindings` | Exactly-once saved-roll use. Superseding a link retains its historical use; that roll cannot be recycled into another procedure. |
| `phase7_roll_commands` | Idempotent operation receipts, committed atomically with dice, decisions, follow-ups and costs. These are not Quarter-Day transition receipts. |

`phase7:upgrade` validates the existing manifest/database identity through a read-only connection before opening any writable repository, applies migration 002 once, and initializes requests for existing complete plans. It does not rerun setup, rewrite activity plans, create new characters, copy books, relocate assets or change the calendar. Repeating the upgrade is safe. The original 28 application migrations and Phase 6 histories are retained.

The 7.0A activity JSON remains the preserved planning record. Its reserved empty dice fields are not a second queue. The new typed child records are the authoritative request relation for that same activity ID, and the controller's read model combines them into one queue, obligation projection and resolution packet. There is no new campaign clock.

## Changed files

The new implementation is in `src/lib/gameplay-rolls.ts`, `src/server/gameplay/{roll-engine,roll-rules,roll-store,upgrade}.ts`, migration 002, `/api/gameplay/rolls`, `GameplayRolls`, `Phase7CharacterWindow` and `scripts/phase7-upgrade.ts`. Existing planning views, character routing, sheet bridge/embed, dice schema/Push availability and API mutation boundaries are connected to this engine. The generated sheet-version hash changes with its bridge. Tests, their isolated PDF/dice fixtures, npm scripts and this report accompany it. No old migration, licensed PDF or live database is changed.

## Request lifecycle

`src/lib/gameplay-rolls.ts` defines strict request, expression and command schemas. Requests identify campaign, current activity, character, procedure, generation and dependency; include a verified pool or die expression, source citations, modifiers, Push eligibility, supported talents, saved-roll ID/revision, raw result, final result, intervention ledger and audit metadata.

Statuses distinguish awaiting roll, Push decision, talent decision, follow-up roll, mechanical review, resolved and superseded. A complete plan automatically creates the supported requests. Partial declarations still use the same 7.0A activity ID and do not create a competing workflow. Refreshing a view does not reset a request.

The accepted declaration is:

> Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.

It creates Survival for Edrus, Survival for Grogahx and prepared Scouting for Rose; Elyanna's Rest creates no activity skill roll. Sleep remains a different assignment.

**Watch qualification:** the Handbook uses a Scouting check to detect a threat, rather than requiring an unconditional roll every quarter. This milestone honors the requested three-roll preparation workflow, labels Watch as prepared, and establishes no threat, opposed result, encounter absence or detection outcome. Actual use in a scene belongs to later encounter integration.

Wits and skill dice come from the existing character sheet. Foraging uses the authoritative calendar season and verified terrain row. The initial requests assume no selected Gear bonus. Unverified additional equipment bonuses require specific Table GM review; miscellaneous pools may contain Gear and Artifact Dice but cannot bypass a queued pool's validation.

Forage displays an explicit default of food, which the owning player can change to water **before** rolling. The final packet retains that choice and the source-backed potential yield. It does not award food or water in B.

## Sheet controls and universal tray

The existing character-sheet URL opens a Phase 7 sheet wrapper for upgraded enrolled campaigns. It retains the actual sheet, field-saving service, character data and dice history. A compact **Pending Rolls** section and **Universal Dice Tray** are part of that sheet page.

- Linked buttons roll the selected verified skill pool or procedural die and attach the saved result automatically.
- Existing sheet skill/pool controls send a pool specification to the Phase 7 service. In Phase 7 mode the sheet does not draw tentative local faces: the server generates the result once, persists it, and the sheet renders that saved result. Retries retain the original operation and roll identity.
- When precisely one current compatible request matches an existing sheet pool, it binds automatically. Several matches require explicit selection. A mismatched pool remains miscellaneous and cannot silently resolve the requested procedure.
- The tray supports D6, D8, D10, D12, D20, D66 and bounded custom expressions such as `2D6+D8-2`. Existing Forbidden Lands pools support positive/negative Skill Dice, Gear Dice and D8/D10/D12 Artifact Dice.
- D66 and its `1D66` alias always draw **two D6 digits**. `2D66` and composite D66 expressions are rejected rather than interpreted as 66-sided dice. Ordinary custom dice allow 2–1000 sides, up to 100 dice and a bounded expression length; arbitrary code/formulas are not evaluated.
- Miscellaneous rolls stay unlinked. The explicit saved-roll link selector revalidates the destination, owner, expression/pool, modifiers, timing, revision and prior use.

Phase 7 sheets do not poll the Phase 6 combat controller. Legacy attack preparation, resource-consumption buttons, group submission and Quarter-Day attachment are not connected to B; they cannot launch old workflows. Resource fields remain editable, and miscellaneous dice never spend a Resource Die. The original Phase 6 UI/services retain their existing behavior for unenrolled campaigns. These limits are displayed in the Phase 7 sheet.

## Push, talents and final outcomes

The new service reuses `generatePool`, `countSuccesses`, `applyDiceCommand` and `canPush` from the existing dice engine. It persists original/result dice in the existing `Session.dice`, with scoped Phase 7 metadata and roll revisions. There are no parallel character attributes or Willpower totals.

A failed eligible pool waits for the player's Push decision. Push preserves original dice and uses the established reroll, Bane, damage and WP rules. The same request and saved roll are updated. The Push window closes when kept/declined; later sheet Push controls cannot reopen it. Utility dice cannot be pushed. Successful-roll pushes for additional effects need their separate GM approval procedure and are not automatically offered by B.

**Path of the Forest rank 1 effect** is implemented for an actual Druid's Foraging failure, including cumulative higher ranks. It is verified against the original Handbook, checks the current talent, profession, timing and WP, and requires explicit authorization to spend exactly 1 WP. Raw failure stays a raw failure; the intervention establishes final success and prevents the failed-Foraging mishap. Repeated activation cannot charge again. General Pathfinder is not this ability.

Quartermaster's verified rank 1 camp modifier and optional rank 3 D8 are supported. Gatherer's verified Foraging modifier and rank 3 vegetable-yield multiplier are supported as determined, unapplied effects. A camp-dependent Quartermaster rank 2 Watch modifier requires review of actual camp establishment, which B does not transact; it is not granted from a mere plan. Unsupported procedures/abilities remain at a specific mechanical-review obligation with a Table GM review action, rather than receiving invented success.

The structured intervention ledger and saved dice distinguish raw roll, Push/authorized talent adjustment, final outcome, committed costs and pending consequences. The packet also retains committed Push and talent costs from superseded bindings. No text field or manually claimed Success can replace a saved failure.

## Original-PDF evidence

Original fifth-printing Player's Handbook pages were uploaded/indexed through the existing library **only in disposable test fixtures**. Existing uploaded files and visibility/classification are not moved or changed by upgrade. Runtime verification uses applicable original indexed evidence, not curated substitutes or hard-coded success prose. Free-text campaign house rules and applicable scoped mechanical overrides require review.

| Implemented rule | Original evidence |
| --- | --- |
| Push and Skill Dice restrictions | Physical PDF pp. 48–49 (printed pp. 44–45). Existing Push engine also covered by the original-PDF regression suite. |
| Forage Survival and seasons | Physical p. 155 (printed p. 151). Spring −1, Summer 0, Autumn +1, Winter −2. |
| Terrain modifiers | Physical p. 149 (printed p. 145); the actual signed row is verified. Dark Forest Forage −1. |
| Make Camp | Physical p. 159 (printed p. 155); one camp maker rolls Survival. |
| Watch | Actual threat-detection paragraph, physical p. 154 (printed p. 150), not a contents heading. Used as preparation only in B. |
| Foraging Mishap 3 | Physical p. 154 (printed p. 150): Sprained Ankle refers to blunt 25–26. |
| Blunt 25–26 | Physical p. 201 (printed p. 197): RUN becomes a slow action; healing D6. The specific bounded row is verified, so a D6 elsewhere in the table cannot substitute. |
| Healing units | Physical p. 113 (printed p. 109): critical healing time is measured in days. |
| Druid talent | Path of the Forest rank 1, printed p. 66: authorized WP success may be chosen after failure. Source citations are saved with activation. |

Request/packet provenance contains document IDs, chunk IDs, physical pages and titles. No full PDF text, private book, campaign snapshot or source-body log is committed.

### Foraging Mishap 3 acceptance

Controlled initial Foraging failure waits for legal Push/talent decisions. Keeping the final failure queues a saved D6 mishap. D6=3 queues a second saved D6 for healing. Duration D6=4 in Chromium yields:

- Original failed Survival roll, saved mishap roll and saved duration roll linked to their exact requests.
- Sprained Ankle, equivalent to blunt critical 25–26; RUN becomes a slow action for four days.
- An unapplied injury consequence in one structured packet.
- No snake encounter, Move defense, permanent injury write or calendar advance.

The unit/integration fixture independently uses a five-day duration and verifies the same chain against the actual PDF. Different fixture values are intentional; both bind the actual saved duration.

## Recovery and correction

Commands use `BEGIN IMMEDIATE`, request revisions, scoped operation IDs, source/pool revalidation and persisted receipts. Two independent processes cannot consume the same request with stale revisions. A forced receipt-write failure rolls back dice, Push costs, request changes and follow-ups together. Original/result faces, Push state and bindings survive reopening the database and browser/server restart.

An actual Table GM can open **Inspect roll binding and source references**, review the affected request IDs and current correction hash, enter a reason, and confirm that historical costs are retained. **Supersede reviewed binding** then supersedes that request and its dependent procedures and creates a fresh replacement requiring new dice. A stale preview rejects. It never deletes saved dice, refunds Push/WP costs or reuses an old roll. Permanent injury correction/application remains outside B.

**Record mechanical review** stores an authorized review note and leaves the procedure blocked. It is not an unverified numeric override or a secret success button.

## Validation and AI cost

- Focused dice suite: **21 passed** — four tests requiring no private PDF plus 17 original-PDF integration cases. Includes success/failure chains, all standard dice, custom expressions, D66, actual pool binding, wrong owner/expression/revision, duplicate operation, Push, WP eligibility/timing, correction, source loss, altered critical evidence, upgrade preservation and competing processes.
- Full regression: **601 passed**; original-PDF suite: **289 passed**, no skips/failures.
- Real Chromium: desktop 1440×1000 and mobile 390×844. The scenario uses linked sheet controls plus the actual embedded Scouting control, five saved rolls, Mishap 3, duration 4, unchanged characters/clock, no mobile overflow, refresh, second window and application restart. The sheet test disables local `Math.random` to ensure the Phase 7 skill path uses server dice.
- Model requests: **0** for planning, skill rolls, mishap, duration, follow-ups and packet creation. This is measured with fresh-campaign `ai_requests`/`ai_usage` counters and a test transport that rejects/counts unexpected OpenAI requests. There is no live OpenAI narration test or claim; narration is reserved for 7.0C.
- Quarter completion receipts: **0**. The campaign remains in Evening.
- Typecheck and production build passed; final delivery confirms the committed and pushed SHA.

Commands:

```sh
npm test
npm run test:gameplay-rolls
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
npm run test:gameplay-rolls:browser
npm run typecheck
npm run build
```

`test:gameplay-rolls` intentionally requires the original private Handbook fixture for its integration cases. Ordinary `npm test` does not require a private PDF. Browser automation needs Playwright/Chromium in the test environment; managed acceptance uses the installed runtime Playwright and `/usr/bin/chromium`. Test-only dice control is a separate preload fixture, never a production API/seed option.

## Update an existing Windows Phase 7 profile

Use the **same existing profile directory**. Do not run `phase7:setup` again, remove its database, or copy a fresh demo database over it.

1. Stop the development server with Ctrl+C and stop every application writer using that profile.
2. In the repository, switch to `feature/phase-7-narrative-gm` and pull normally with `git pull --ff-only origin feature/phase-7-narrative-gm`. Preserve any local edits rather than resetting them.
3. Open PowerShell in the `ravenland` directory. Use Node 24+ and `npm ci`.
4. Back up the entire stopped profile, including the database, any WAL/SHM files, manifest, images and sourcebooks, to a **new private backup directory**. For example, replace these paths with yours:

```powershell
$phase7Directory = 'C:\Ravenland\phase7-development'
$phase7BackupDirectory = 'C:\Ravenland\backups\before-7b'
if (Test-Path -LiteralPath $phase7BackupDirectory) { throw 'Choose a new backup directory.' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $phase7BackupDirectory) | Out-Null
Copy-Item -LiteralPath $phase7Directory -Destination $phase7BackupDirectory -Recurse
```

Verify that the backup contains the copied profile folder contents and compare important file hashes with `Get-FileHash`. Also preserve any separately configured/customized map, workbook or other external campaign assets. A backup is a private restore point, not another live library or campaign.

5. Apply the additive migration to that **existing** directory:

```powershell
npm run phase7:upgrade -- --directory "$phase7Directory"
```

The first run reports `{"version":"7.0B","applied":true}`; a repeat reports `applied:false`. Existing plans retain their IDs and assignments. The manifest is not relocated or rewritten.

6. Restart using the same profile:

```powershell
npm run dev:phase7 -- --directory "$phase7Directory" --port 3000
```

Open `http://127.0.0.1:3000` on that computer. The launcher prints the actual campaign path. This loopback address is not a public GitHub deployment.

7. The queue needs the original Handbook already indexed and applicable in this profile. If it is present, reuse it; do not re-upload/move books just for the upgrade. If it is missing or interrupted, open **Existing Rules Library administration** with the application's separately configured GM administration token and restore/index the original reference using the existing library workflow. Keep the existing visibility. The queue stays at explicit source review until evidence is available; then use **Recheck sheet and sources**. For a new empty development library, adding the original reference is an explicit library action, not an automatic migration copy.
8. Use an existing saved plan, or declare the example above if the quarter has no plan. Open each requested sheet. Roll, keep/Push/authorize a supported talent, and follow the D6 requests. Inspect **Consolidated mechanical result**. Do not expect Night or permanent injury application in B.

For the prepared cloud workspace, use `/workspace/phase7-development` instead of a Windows path. Its campaign remains `231b619c-afa5-4c77-b4fe-53dc90cb12e2`; its empty library needs the explicit source step above. The fully source-backed automated demo uses a separate disposable profile and does not seed or overwrite this profile.

## Limits, compatibility and rollback

Remaining manual procedures are failed-camp mishaps; Foraging mishaps other than result 3; additional gear/unsupported talent effects; camp-dependent Watch modifiers; and specific procedures for Hunt/Cook/Other. They remain explicit mechanical reviews and prevent a false fully-resolved packet. Rest/Sleep have no default activity skill request; their recovery/needs effects belong to C. Miscellaneous pools do not have an authoritative Push window until linked to an eligible request.

7.0C must transact the pending injury and other activity consequences, provide the permanent correction interface, integrate consolidated AI narration and enable exactly-once Quarter-Day completion. Encounter scenes and travel are later milestones. No live campaign adoption or historical repair is authorized here.

For rollback, stop writers and restore the matching pre-upgrade database, manifest and assets with the compatible 7.0A/baseline code. The backup at `/workspace/phase7-development-backup-before-7b` is the prepared workspace's restore point. Switching Git branches alone does not undo schema or dice changes. Never restore a disposable test database over a real campaign.
