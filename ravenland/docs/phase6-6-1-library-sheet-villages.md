# Phase 6.6.1 — Persistent libraries, weapon layout and settlement identity

Implemented on `ravenland-ai-gm-prototype`, from base `802453a`. Tests use isolated databases and controlled AI responses. No live campaign database was available or changed. The private fifth-printing books were used locally for validation and are not included in Git.

## 1. Why libraries did not carry over

Phase 6.6 used an explicit opt-in registry (`shared_sourcebooks`, `shared_images`) followed by per-resource selection at campaign creation. Merely uploading a PDF or saving an image did not register it for sharing. Custom Rules Library documents had no equivalent cross-campaign reference. Before this repair, targeted tests reproduced missing PDFs, missing images, and rejection of a proper name for an unnamed starting village (three failing tests).

## 2. Default inheritance

The trusted local campaign API now automatically references existing sourcebooks, custom rule documents, and all saved image assets, including generated images. Normal creation requires no upload, sharing toggle, administrator token or individual library selection. Advanced restricted creation remains available.

Migration 020 adds reference tables, applicability views and a campaign library policy. Original PDF/image blobs, chunks, curated sections, index rows and citation IDs remain in place. Byte-identical legacy PDF uploads are grouped by checksum, visibility and category when adding references; original owner records and their existing citations remain intact. Byte-identical official source copies count as one edition for combat; different source checksums remain ambiguous.

The default is authorized by a server-verified trusted local request. Client JSON cannot assert local trust. Hosted creation does not gain installation-wide access. GM-only source visibility and existing mutation/ownership checks remain enforced. Inherited source documents remain owned by their original campaign.

## 3. Custom and house rules

Custom entries appear immediately in Rules Library. Official summaries remain usable as references. Inherited house-rule entries and House Rules PDFs are available but inactive by default. They cannot silently change another campaign’s mechanical evidence, combat overrides or AI context. Library cards and readers display inactive status.

Campaign Settings provides an advanced, explicit applicability review using the existing library administrator token. Activation affects only that campaign. Original owner applicability, existing explicit source links, conflict handling and citation requirements are preserved. There was no prior machine-readable installation-wide applicability setting to migrate; prose is not treated as permission to impose a house rule globally.

## 4. Existing campaigns and reset

Use **Campaign Settings → Sync Libraries** to add missing references. It is additive and idempotent, preserves current image associations/portraits, and does not change party position, characters, messages or journal. Counts report the references added. Source ownership is retained; inherited documents cannot be edited or deleted through another campaign.

Reset retains the library references and explicit applicability choices. In unrestricted local campaigns it also attaches resources saved since the last synchronization. Restricted campaigns keep their selected library policy. Existing reset confirmation, revision, request-replay and retired-request protections remain in place.

## 5. What reproduced in the actual weapon sheet

The running embedded sheet was inspected before and after the repair using a character already persisted in a temporary database with a legacy weapon row (`bonus: 1`, no separate original/current properties). This exercises normalization of an existing raw record, rather than only a new normalized character.

On base `802453a`, all desktop bonus columns were already present and the legacy Longbow correctly displayed Bonus 0, Gear Bonus 2, Current 1. Therefore wholly missing desktop columns and broken legacy condition **did not reproduce** in this workspace. The user’s live character database and deployed browser were unavailable, so their precise missing-column cause is unverified.

Two actual rendering defects did reproduce: the inner sheet `.container` retained a 1100px maximum, leaving unused desktop width, and the mobile weapon table was 655px wide with its right edge at 678px inside a 348px frame. Layout corrections now remove that inner cap and use labelled weapon cards on narrow screens. The Damage heading is explicit and other weapon functionality is retained.

The generator previously served a mutable `character-sheet.html` alias, making stale asset delivery possible, but a stale user response was not directly observed. The iframe now loads a content-hashed filename with the matching version query. Build, development and start generate the asset. A browser test deliberately serves stale HTML at the legacy alias and confirms the current sheet still loads. No browser storage clearing is required.

## 6. Rendered evidence

Browser measurements after repair: desktop frame **1398px**, weapons section **1378px**, table **1346px**, no clipped headers. Mobile frame **348px**, table **302px**, right edge **325px**, no clipping.

- [Desktop weapon screenshot](phase6-6-1-weapons-desktop.png)
- [Mobile weapon screenshot](phase6-6-1-weapons-mobile.png)
- Browser reproduction and assertions: `tests/library-corrections-browser.cjs`.

The screenshots show isolated test data. They contain no private book pages or live character information.

## 7. Weapon data and dice

Bonus, Gear Bonus and Current remain separate persisted values. Browser tests save 1/2/1, refresh, confirm all three, stage a weapon roll, and verify Gear Dice 1 plus modifier 1. Setting Current to 0 and refreshing leaves Gear Bonus 2 and Bonus 1 intact. The real-PDF character integrity tests verify published equipment/talent evidence and existing damage/repair behavior after automatic inheritance, without manually sharing/selecting the books. Legacy condition tests retain the damaged rating and avoid inventing an unknown original rating. This change does not replace the deterministic dice engine or add a second talent application.

## 8. Unnamed village workflow

Starting Village options distinguish **Unnamed village** from canonical names. The user enters a proper settlement name during creation; a bare `Village`/`Unnamed village` is rejected as a proper name. The verified hex and stable source-village ID are unchanged. State records source ID, source label, map checksum, established name and `nameOrigin: user` or `canonical`. Canonical names cannot be replaced.

The saved name projects consistently into current location, known locations, the public map, journey arrival and AI context. A controlled provider test verifies subsequent GM turns receive the persisted name. Context instructs the GM to treat generic Village as a classification, use established names and keep an unaccepted proposal non-authoritative.

Existing verified unnamed starts can use **Campaign Settings → Name the starting settlement**, preserving characters, messages and journal. That operation refuses changes once encounter history exists, to avoid rewriting scene identity. User entry is the implemented naming path; this phase does not add a paid AI naming workflow. Canonical names remain protected in both UI and server validation.

## 9. Changed files

- Database and local inheritance: `src/server/migrations/020_library_inheritance.sql`, `installation-libraries.ts`, `campaign-lifecycle.ts`, campaign/lifecycle API routes, create/reset validation and campaign types.
- Availability/applicability: compendium store/search/schema, sourcebook library/retrieval/diagnostics/schema, combat sources, consequences rules, ruling policy/service/store, AI context.
- Name projections: map store, journey service; campaign setup/manager and settlement-name settings.
- Library UI: shared-library settings, Rules Library, Sourcebook Library.
- Sheet delivery/layout: root `index.html`, sheet generator, hashed version, SheetEmbed, development/start scripts and generated-file ignore rules.
- Tests: new focused and browser library-corrections suites, real-book character integrity, migration-count assertions in persistence/AI tests, npm scripts. Screenshots and this report.

## 10. Validation

- `npm run test:retrieval-check` with `RAVENLAND_REAL_SOURCEBOOK_DIR`: 478 unit/regression tests and 160 actual-PDF tests, all passing; no skipped tests.
- `npm run test:library-corrections`: 13 focused tests passing (included in the 478).
- `npm run test:library-corrections:browser`: passing, actual Chromium UI with persisted legacy weapon data, desktop/mobile measurements, stale-alias interception, independent saves/refresh, Gear Dice, default inheritance, inactive house rules, actual image load, village naming, additive Sync and process restart.
- `npm run test:real-sourcebooks:required`: 160 tests passing independently, including automatic inheritance of the real books without manual sharing or source selection.
- `npm run build`, `npm run typecheck`, `git diff --check`: passing.

The pre-repair focused run failed all three original reproduction tests; the pre-repair browser inspection confirmed desktop width restriction and mobile clipping. All AI providers in automated checks are controlled; no paid model calls were made. Temporary databases and image fixtures are cleaned up.

## 11. Remaining limitations

- The user’s actual live database and previously deployed browser were not available. Desktop missing-column failure is not claimed reproduced or diagnosed conclusively. The persisted legacy-character reproduction covers the existing schema shape, and actual responsive defects were measured.
- Inheritance is installation-local. Hosted users retain their previous authorization boundary.
- Availability does not activate campaign-specific house rules. Explicit advanced activation requires the existing administrator capability.
- Cross-campaign entries retain original ownership; edit them in the owning campaign. Deliberate source-owner deletion remains protected where references exist.
- Existing encounter-history settlement identities require a reviewed scene procedure rather than the simple naming control.
- Source validation uses actual private PDFs locally, but no live deployment has been updated by these source changes alone.

## 12. Short manual check

1. Start the updated application normally. Create a campaign, choose a verified unnamed village, enter its proper name and accept the creation confirmation. Leave Advanced library restrictions off.
2. Open Rules Library and Image Library. Existing PDFs, custom entries and saved images should appear. Inherited house rules should say inactive.
3. Open an existing/imported character. On desktop, inspect the full-width weapon columns; on mobile, inspect labelled weapon cards.
4. Set Bonus/Gear Bonus/Current to distinct supported values, save, refresh and reopen. Stage a weapon roll and confirm Current supplies Gear Dice. Changing Current must not change Gear Bonus.
5. Check the settlement name in Campaign Settings, map and future GM context. Canonical names must remain protected.
6. For an older campaign, press Sync Libraries. Confirm references are added without moving the party or changing its story. Optionally test Reset only on an isolated campaign, using its explicit confirmation; libraries should remain available.
