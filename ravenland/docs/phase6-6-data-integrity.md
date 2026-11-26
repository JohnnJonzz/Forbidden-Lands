# Phase 6.6 — Campaign and character data integrity

This phase adds independent campaign creation, confirmed transactional reset, verified starting villages, recoverable character saves, versioned character JSON and opt-in shared library references. Development and automated verification use isolated databases. No live Edrus campaign, historical encounter or source visibility was edited.

## 1. Character save root causes

The embedded sheet advanced its optimistic baseline **before** the character PATCH succeeded. After a rejected request, the next edit compared against a value that had never reached SQLite. The server correctly rejected that false baseline as a concurrent change, leaving the user unable to save subsequent edits. This was reproduced in an isolated browser against commit `737a335`: reject the first name save, permit the next, observe a false concurrent-change error and the original name remaining in SQLite.

There were two related problems: comparison by serialized JSON could mistake different object-key order for changed table data, and regular-attribute input did not trigger the immediate input save listener. The sheet only got the regular-attribute change on a later change/blur event. Command-save failures also did not consistently update the outer save indicator.

The new `SheetSaveQueue` separates acknowledged state from the latest draft, serializes writes, acknowledges server-normalized values and merges edits made while a request is running. A failed request preserves its original baseline and local draft. Retry uses that baseline; it does not overwrite the server from a failed optimistic snapshot. Drafts and their original acknowledged baselines are stored locally under the campaign and character IDs and restored on reopening. Refresh never rebases an older draft onto newer server data silently; a same-field conflict stays held for review. Structural comparison replaces JSON key-order comparison at the server boundary. Same-field conflicts fail; disjoint changes still merge.

The UI reports Saving, Saved, or Not saved, displays server errors, offers retry/export and guards unsaved navigation. Versioned export reads saved server data; the error-panel export can preserve the unsaved draft. Invalid local values remain explicitly unsaved. A recovery-only JSON download preserves invalid drafts without presenting them as a valid portable import. The normal AI/rules pipeline continues reading saved SQLite data, never the unconfirmed draft. Local drafts contain character sheet data, not server credentials; shared-device users should discard/export drafts deliberately.

## 2. Reset and old-location root causes

The old reset was a public-session reducer. It intentionally retained discoveries, exploration, day records and chat-journey state. It did not reset separate SQL tables containing encounters, setup proposals, AI conversation, memories, world receipts, consequences or rulings. Replacing the public snapshot could therefore leave the old authoritative scene active.

The replacement snapshot itself came from `initialSession`, whose sample scene is **The Hollow Watch at H14**. That location appearing after reset was partly a sample-default design choice, not by itself proof of a stale model response. On the configured workbook, H14 is not a valid source hex. New production creation no longer uses that sample location, objective or conversation. The old reducer reset is retired and explicitly rejects use; reset goes through the transactional service.

## 3. Storage and library ownership

Campaign public snapshots remain in `campaigns.public_state`. Characters remain campaign-owned sheet data. Encounters, private AI memory/context, consequences and rulings keep their existing stores. No competing campaign or combat engine is introduced.

Previously source PDFs, chunks and FTS indexes were owned by `source_documents.campaign_id`; a new campaign had no access to another campaign's books. This reproduced an **availability limitation**, not deleted files. Images already used content-addressed `image_assets` with campaign-specific `campaign_images` assignments.

Migration 019 adds explicit sourcebook sharing availability and `campaign_sourcebooks` references. The `accessible_source_documents` read view lets retrieval, combat evidence and citation revalidation use attached original documents and chunks. IDs, physical files and indexes are not copied. Campaign-specific curated house rules remain separate. No existing resource is automatically made shared, including private books or house-rule PDFs.

The local controller selects authorized shared resources during creation/import. Changing sourcebook sharing retains the existing library administrator-token requirement; reads and retrieval still filter Public Rules versus GM Only. Attached campaigns cannot reclassify, reindex or delete an owner's sourcebook. Deleting a source still used by another campaign is blocked. Disabling sharing availability prevents new selections but does not revoke existing references or break their citations.

Images opt in separately through `shared_images`. A new campaign receives selected assignments to the same existing asset. Reset retains those assignments and portrait associations. Unselected campaigns receive no asset access. Sharing does not globally publish an image or bypass its campaign assignment check.

## 4. Character JSON

The portable schema is strict and versioned:

```json
{"format":"ravenland-character","version":1,"character":{"id":"portable-identity","name":"...","kin":"...","profession":"...","initials":"...","color":"#aabbcc","strength":3,"agility":3,"wits":3,"empathy":3,"sheet":{}}}
```

The real `sheet` contains supported details, creation selections, attributes, skills, talents/ranks/types, weapons/condition, gear, armor, resources, conditions and spells. Unsupported keys and unknown versions are rejected. Portrait assignments are excluded, as are campaign encounters, consequence IDs, roll receipts, GM memory and credentials. Recorded character injury/condition text is portable; the originating campaign's lethal clock/procedure is not silently recreated.

Import shows the character and warnings before confirmation, requires a nonconflicting chosen name, assigns a new UUID, persists immediately and uses an idempotent import receipt. Duplicate portable IDs cannot replace an existing character. Names compare case-insensitively. Replaying the same request does not create another character. Character import/export is independent of campaign reset.

Campaign JSON import remains a separate explicit operation. It validates current coordinates against this map, previews the backup, requires a verified starting-village selection, and creates a new record. Selected shared resources are attached by reference. Portrait assignments absent from the selected authorized image set are cleared. A public campaign JSON backup does not restore private encounter/AI database tables; it is not a full server-database backup.

## 5–6. Sheet layout, weapon fields and dice

The weapons block spans the available sheet width. It now separates:

- `bonus`: additional Skill Dice modifier, requiring an applicable supported rule in deterministic combat.
- `gearBonus`: original catalog rating, retained through damage and repair.
- `current`: the condition used for Gear Dice.
- `repairLimit` / `destroyed`: permanent repair outcomes where applicable.

Legacy `bonus` meant current gear condition. Normalization preserves that exact value as `current`, sets the additional modifier to zero, and uses the controlled catalog for an original rating only when it can do so consistently. It never assumes a worn weapon is undamaged. A custom or contradictory original rating remains unestablished and needs review. Existing stored rows are not rewritten merely by migration or read; subsequent explicit saves/exports use the normalized portable structure.

Mechanical character projection, attack preparation, weapon verification, push wear and defensive pools use current gear condition. Pushing lowers `current` once; it does not consume the original rating or apply damage again. A weapon at zero with a known positive original rating is broken and cannot attack until repaired. This corrects an older real-source regression expectation that allowed attacking with broken gear.

The supported rank-one passives for Axe Fighter, Knife Fighter, Hammer Fighter, Spear Fighter, Sword Fighter and Sharpshooter are checked against original source evidence and the matching weapon family. A recorded additional Bonus matching that passive does not add it twice. Sword Fighter's supported Parry bonus is also source checked. Attack damage, attributes and base skill ratings stay separate. Unsupported modifiers or higher-rank effects remain review requirements rather than guessed bonuses.

A local downtime repair procedure consumes an actual unused saved Crafting roll. The controller must review applicable tools/item talent prerequisites and explicitly adjudicate actual hours; the book's “few hours” is not converted to an invented universal duration. Repair is blocked during active combat or unresolved consequential deadlines. On success, current rating rises one per saved success up to the repair limit. On failure, the limit permanently falls to current; failure at zero destroys the item. Source evidence, typed protected ruling, shared time receipt, sheet update and consumed-roll receipt commit atomically. Retry cannot repair twice. The original catalog rating remains visible. Direct sheet edits remain recorded player/controller input, not fabricated proof of a Crafting roll.

## 7. Talent Type

The dropdown precedes Talent Name and has exactly K — Kin, P — Professional, G — General. Structured values are schema validated. A missing legacy type shows Review type without choosing a category automatically. Talent names and ranks are retained.

There was no complete structured talent-type catalog in the existing registry. A small reviewed catalog classifies exact known names only when their original source evidence is available during save/import: Adaptive, Path of Healing, the five supported Fighter talents, Bowyer and Sharpshooter. Other names/custom talents remain untyped until reviewed. No first-letter inference is used, and classification alone does not grant a mechanical modifier.

## 8–9. Verified villages and selector

The source of truth is the configured `geography_hexes` imported through the reviewed public workbook mapping. For the installed map:

- Source: `Ravenland_Campaign_Master.xlsx`.
- SHA-256: `0ee5d3952dd00eaecb6287a04dc44ae208708cfa472cc1fc9d7ce498952a1454`.
- Mapping: `config/ravenland-master.json`, worksheet `Map Details A01-Ao50`, `Site/Feature` column.
- Coordinate convention: Excel-column/doubled-row; column letters convert to a zero-based column, the source row obeys parity, and source IDs such as `C04` remain unchanged.

Only explicit `Village` or `Village - name` / `Village: name` classifications qualify automatically. For example, the actual reviewed workbook marks **Village - Belderand at C04**. An unnamed Village marker remains “Village” plus its actual hex; the application does not invent a canonical name. Castles, ruins, dungeons and arbitrary wilderness do not enter the random pool.

Stable settlement IDs are bound to the map checksum, source feature and hex. For a custom source lacking classifications, the trusted controller can confirm a village name, existing canonical hex and supporting reference. Those reviewed records are bound to the current map checksum. Replacing the map invalidates old selections; there is no fallback hex.

Creation displays village and hex, offers a random choice restricted to eligible registry entries, and requires explicit character selection or character-file preview. If there is no valid village/map, creation stops with guidance. An empty application now offers setup instead of silently creating the sample campaign.

The starting village is saved in campaign state; current hex/location, initial exploration and the first journey origin use the same coordinate. There is no sample scene, objective, Journal, encounter, consequence, pending world intention or AI conversation. Later movement may use any actual map hex permitted by the journey engine, including wilderness. Repository updates reject changed coordinates absent from the configured map. Legacy invalid locations remain untouched until deliberately corrected; loading old campaigns never relocates Edrus automatically.

## 10. Confirmed reset behavior

The confirmation preview lists deletion versus retention before a separate confirmation checkbox/button. Retaining the original starting village is offered only if it still matches the verified registry; otherwise a replacement is required. The starting village means the saved origin, not the party's current wilderness position.

Reset retains the campaign ID, current character sheets and IDs, library resources/links, curated rules, image assignments/portraits, player access, AI configuration and bounded-GM policy. It clears messages, Journal, discoveries/exploration, journey and dice history, encounters, setup proposals, world receipts, consequences, rulings, private campaign memory/secrets, AI requests/usage/recaps and selected scene images. It starts at the confirmed village with a new AI session identity. The successful reset reopens the campaign page and notifies other windows for that campaign so old composer/attachment/response state cannot remain active. Other campaigns remain unchanged.

The transaction rejects stale previews and active GM requests and rolls back all deletions on failure. Exact reset replay is idempotent. Payload-free request tombstones prevent old AI/world/combat/consequence/journey/dice retries from executing in the reset story. No removed prompt or private memory is retained in those tombstones. Character drafts/selected sheet edits should be saved or exported before confirming deletion of campaign history.

## 11. Files and migrations

Migration: `src/server/migrations/019_data_integrity.sql` (source sharing/references/view, image sharing, verified village records, lifecycle receipts, retired-request IDs). Existing snapshots, PDFs, chunks, images and source visibility are not rewritten by the migration.

Main changes:

| Area | Files |
| --- | --- |
| Lifecycle and coordinates | `src/server/campaign-lifecycle.ts`, repository/validation/types, `src/app/api/campaign-lifecycle/route.ts`, campaigns route, map replacement boundary |
| Sharing/read boundaries | sourcebook library/retrieval/audit/diagnostics, compendium passage lookup, combat source selection |
| Character persistence/portability | `character-data.ts`, `character-portable.ts`, `sheet-save-queue.ts`, character schema/service, `character-talents.ts`, characters portable route, campaign hook |
| UI | `campaign-setup.tsx`, campaign manager/app/settings, `shared-library-settings.tsx`, `character-portability.tsx`, `weapon-repair.tsx`, sheet embed, root `index.html`, sheet bridge and generated asset version |
| Mechanics | mechanical-character projection, action preparation, dice wear, combat equipment/attack/defensive pools, typed repair ruling, `weapon-repair.ts`, shared time adapter |
| Reset retry boundary | `request-epoch.ts`, AI claim and existing mutation services |
| Tests | data-integrity defect/unit/browser suites, original-PDF character integrity extension, updated migration/legacy-field/reset/valid-map and broken-weapon expectations |

## 12. Verification

Three focused contract checks failed before repair: creation accepted omission of a verified village/character choice, the snapshot reset remained callable, and the sheet rejected independent gear condition/Talent Type fields. The prior-commit browser reproduction confirmed the failed-save baseline defect. New-campaign library unavailability was confirmed as ownership design; no shared file deletion was reproduced.

Verification includes saved edits, failed-save draft recovery, refresh/navigation/restart, stale conflicts, server normalization during concurrent edits, JSON previews and schema rejection, duplicate identities/names, clean AI context, valid/invalid map locations, reset rollback/replay/tombstones, shared source index identity, shared image assets/portraits and actual fifth-printing mechanics. Automated calls use mock/capture providers and controlled dice. Private PDFs, extracted text and databases remain outside Git.

Final unit/regression verification passed **465 tests, zero failures**. The real fifth-printing suite passed **160 tests, zero failures or skips**; this includes the new shared-index, talent, current-gear, successful/failed repair and defensive-pool checks. The focused data-integrity suite passed **17 tests** (also included in the full regression count). The new browser suite and previous GM-ruling browser suite passed. Production build, TypeScript and whitespace validation passed; final completion links identify the saved checkpoint. Previous Phase 6.5.3 browser coverage is retained to check routine NPC speech, protected rulings, shared deadlines, Healing resolution, restart/replay and hosted privilege denial.

## 13–14. Compatibility and remaining limits

Existing campaigns keep their IDs, historical records and original map state unless the controller deliberately resets or corrects them. The low-level repository fixture constructor remains available to tests/internal explicit-copy workflows; production New Campaign uses validated lifecycle creation. Legacy sample data remains only as an explicit character template and existing fixture, not a starting-location fallback.

Shared resources require explicit opt-in and selection; this phase does not publish private materials or automatically spread campaign house rules. It does not add a hosted GM role. Lifecycle administration and protected repair use trusted local authority, and sourcebook administration retains its review token. Character exports/imports do not move external portrait files or recreate encounter-specific lethal deadlines. Public campaign backup import cannot substitute for backing up the entire private database/storage.

Talent automation is deliberately bounded to verified rank-one effects and the small evidenced category catalog. Higher ranks, custom talents, advanced repairs' item/tool prerequisites and unsupported modifiers require explicit review. No automatic item crafting, arbitrary equipment stat boost, new dice result or unverified time conversion is introduced.

The optional live-model smoke procedure has not been run against Edrus. Passing isolated tests is not a claim that live campaign data was repaired or advanced.

## 15. Manual verification

1. Export the existing campaign/character before deliberately testing destructive reset. Keep any existing live Edrus campaign selected only for read-only inspection.
2. In Campaign Settings, opt in reusable books (library administrator token) and chosen images for sharing. Create a separate campaign, choose a listed verified village/hex and characters or a previewed character file, then explicitly select shared resources.
3. Confirm the new location on the map and in campaign settings. Ask the GM for the opening at that location only when ready to make a real model call. Verify no old Hollow Watch narrative/context is present.
4. Open a character sheet, edit attributes, skills, descriptive fields, talent type/rank, equipment, inventory and Current gear condition. Wait for Saved, navigate, refresh and restart. Use two windows to verify stale same-field edits produce an error instead of overwriting.
5. Export Character JSON. Import it under a different name, review the preview and verify a new ID and preserved supported state. Malformed/version-mismatched input must fail without mutation.
6. Inspect a worn weapon's original rating, Current and separate additional Bonus. Prepare a supported attack and verify Gear Dice use Current. Review unsupported bonuses instead of forcing a pool. For a deliberate downtime repair, save the actual Crafting roll, verify prerequisites and hours, then inspect its ruling/time/condition receipts.
7. On the isolated campaign, open Reset Current Campaign, review the deletion/retention preview, retain a still-valid original village or select another, and explicitly confirm. Verify clean story/encounter state and retained characters, shared books, images and portraits. Reload/restart; a retry of an old action must require a fresh action.
8. Travel normally into an adjacent valid wilderness hex through the existing journey procedure. An invalid coordinate must fail without changing saved position.
