# Forbidden Lands — The Ravenland Chronicles

The existing Next.js + TypeScript interface now stores campaigns in **server-side SQLite**. All story content is original mock narrative. The standalone root character sheet is preserved independently.

## Run locally

Use **Node.js 24+** and npm (SQLite uses Node's built-in `node:sqlite`).

```sh
cd ravenland
npm ci
npm run db:migrate
npm run dev
```

Open **http://localhost:3000**. Migrations also run automatically when the server first opens the database. Production: `npm run build`, then `npm start`. Use `npm run dev -- --port 3001` if 3000 is occupied.

The default database is `ravenland/data/ravenland.sqlite`, resolved from the application working directory. Keep this directory between restarts. To choose a different database, export an absolute path before running migration and server commands:

```sh
export RAVENLAND_DB_PATH=/absolute/path/to/campaigns.sqlite
npm run db:migrate
npm run dev
```

Database files and WAL/SHM sidecars are ignored by Git. Back up using the app's JSON export. Do not copy only a live SQLite main file while WAL writes may be pending; stop the server before filesystem-level backups.

## Use and verify persistence

1. Open Campaign Settings. Under Campaign library, create a named campaign or select and load an existing one. A new campaign has the sample party with empty chat and journal; the first-ever launch seeds the original sample adventure once.
2. Edit name, description, in-game date, quarter day, hex, location, terrain, weather, objective, tone, and house rules. Click **Apply changes**. Wait for **Saved to SQLite** in the main view.
3. Submit player actions and receive mock GM replies. Add Journal entries. These save automatically. Party profiles and all public campaign settings are included in snapshots and backups.
4. Close the browser. Stop and restart the development server using the same database path. Reopen the app: the last selected campaign, chat, journal, party, and settings are restored.
5. Create another campaign, then load the first to confirm both remain separate.
6. Export JSON backup in Campaign Settings, then import it. Import always creates a **new** record; it never replaces the original. It accepts version 1 `ravenland-campaign` backups only, up to 5 MB. Fields, types, lengths, unique IDs, and unknown properties are validated on the server.
7. **Reset current campaign** asks for confirmation before replacing that campaign with the sample adventure. Other records remain intact. Cancel leaves it unchanged.

Changes are saved immediately through a serialized queue. Save failures are shown with Retry and Export unsaved backup controls, and leaving with unsaved changes triggers the browser's unload warning. Stale updates from another tab return a conflict instead of overwriting newer data. Export the unsaved version before using **Reload saved copy** to discard it and resolve a conflict. The campaign library blocks switching while unsaved writes remain.

The current campaign selection is server-wide for this local prototype. There is **no authentication, multiplayer synchronization, paid AI API, or OpenAI credential requirement**. Run it on a trusted development machine, not as an exposed public service. The default voice workflow remains separate Discord use. Settings are public campaign information: never enter API keys or GM-only secrets in prose fields or backups.

## Architecture

- `src/lib/types.ts`: public typed campaign/session/player models.
- `src/lib/session.ts`: UI-independent session rules and dice calculations.
- `src/lib/validation.ts`: strict public-state and backup schemas. No credential or GM-secret fields are accepted.
- `src/server/repository.ts`: repository contract supporting synchronous SQLite and future asynchronous PostgreSQL implementations.
- `src/server/sqlite.ts`: transactions, optimistic revision checks, prepared queries, migration ledger, and local database adapter. Public state is stored as a validated JSON snapshot per campaign; IDs isolate campaigns and party members have stable IDs.
- `src/server/migrations`: ordered SQL migrations, applied transactionally once per database. Add migrations here for future schema changes; do not delete existing databases as an upgrade strategy.
- `src/server/campaign-service.ts`: public campaign access and mock GM functions. A future AI adapter can call these functions without holding a database handle.
- `src/app/api`: server-side HTTP boundary. Responses and JSON exports contain public state only. A separate `campaign_secrets` table is reserved for future GM-only state and is never read by public routes or exports.
- `src/hooks/use-campaign.ts`: initial load, serialized saves, save status, conflict handling, and campaign operations.
- `src/components`: the existing layout plus a campaign library inside Settings. No browser storage is used as the source of truth.

The GM remains a deterministic keyword-based mock. Accounts, secret administration, schema upgrades for future backup formats, and actual shared-player sessions remain future work.

## Automated checks

```sh
npm test
npm run typecheck
npm run build
npm run test:persistence
```

Fifteen unit/storage tests exercise reducer behavior, dice rules, strict validation, migrations, complete public snapshots, stale-write conflicts, multiple campaigns, imports, secret separation, and closing/reopening SQLite.

`test:persistence` requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is elsewhere. It launches a production server on an available local port with a **temporary database**, modifies settings/chat/journal in a real browser, closes the browser, stops/restarts the server, and asserts exact restoration. It also tests tools, mobile layout, create/load, backup export/import, invalid imports, stale writes, and confirmed/cancelled resets. It removes only its own temporary database. Run `npm run build` first. `node tests/browser.cjs` is an alias for this isolated browser check.

## Connected character sheets and dice pool

Open **Characters**, then click a character card to open the complete latest sheet. Back to characters returns to the four cards. Sheet fields, equipment, armor/helmet/shield, consumable dice, spells, current attribute damage, and Willpower save with that campaign character. Regular attributes and names also update the cards and party list. Existing campaigns without sheets initialize from their saved character profiles on first use. Campaign JSON exports/imports include the sheets.

The main **Dice Roller** uses the exact same visual pool and rules as the sheet: base/skill/gear selectors, negative skill dice, artifacts, D66, clearing, rolling and pushing. Select **Rolling as** to attach changes to a character. Custom rolls have no attribute association; use the skill/weapon stage buttons inside the full sheet for automatic attribute damage. Pools/results are temporary and reset when a panel closes; character state is persistent.

`scripts/generate-sheet.mjs` builds an embedded HTML asset from the repository's maintained root `index.html`, with a narrow same-origin message bridge. Both panel modes share that asset, preventing the dice implementations from drifting. `predev`, `prebuild`, and `pretest` generate it automatically; the generated public file is ignored by Git. The standalone source remains usable independently. Embedded sheets do not use or replace its browser roster: campaign and character IDs control ownership, messages are checked against the iframe source and origin, and sheet updates are validated on the client and server.

To move an existing standalone character, use **Export JSON** on the old sheet and **Import JSON** inside the desired campaign character's sheet. Import edits that selected character rather than creating another party member. Existing standalone browser data is never automatically read or overwritten.

## Phase 3: authoritative hex map

The uploaded `data/Forbidden_Lands_Map.png` (3625 × 2620) and `data/Ravenland_Campaign_Master.xlsx` are integrated. The reviewed `config/ravenland-master.json` imports **1,022 hexes**, **5,872 directed source adjacency links**, and **17 named waterway/route references**. `npm run dev` and `npm start` prepare an empty geographic database automatically. You can also run `npm run map:prepare` explicitly. Existing campaigns and user calibration are preserved.

The matching-source calibration is in `config/ravenland-calibration.json`. It was visually checked against printed hex outlines at B03, An03, B49, Ah41, and M22, spread across the northwest, northeast, southwest, southeast, and center. It is applied automatically only when the PNG and original workbook checksums match the reviewed versions. Different sources require explicit import and calibration; no fallback geography is invented.

### Import the workbook

The uploaded sources are in `ravenland/data/`. For replacement sources you may use `data/source/` (ignored by Git), or set absolute `RAVENLAND_MAP_PATH`, `RAVENLAND_WORKBOOK_PATH`, and `RAVENLAND_MAP_MAPPING` paths. The image loader checks an explicit override, then `data/source/Forbidden_Lands_Map.png`, then the uploaded `data/Forbidden_Lands_Map.png`. Use the same `RAVENLAND_DB_PATH` for import and server commands.

```sh
cd ravenland
npm ci
npm run db:migrate
npm run map:import -- data/Ravenland_Campaign_Master.xlsx --inspect
```

Inspection prints worksheet names, row counts, and headers, **not row contents**. Copy `config/map-mapping.example.json` to a local mapping file and fill in actual sheet/header names. The template is intentionally incomplete and unreviewed; it is not an assumed workbook schema. Every mapped field must be reviewed for player visibility. Only after review, set `publicColumnsReviewed` to `true`.

The uploaded workbook has `Hex`, not separate column/row fields. Its Adjacency Guide explicitly defines same-column steps of two row numbers and diagonal steps of one column/one row. The reviewed profile selects `excel-column-doubled-row`: letter columns A…Z, Aa…Ao become indices 0…40; the logical row is floor(printed number / 2), with odd columns staggered by half a row. Parity is validated. The printed coordinate string and capitalization are retained. This conversion is used for drawing only; travel uses the actual six neighbor columns N/NE/SE/S/SW/NW, without computing new adjacency.

For other workbooks the default `coordinateSystem: "explicit"` requires mappings for `coordinate`, `column`, and `row`. Column/row are logical indices, not image pixels. Do not apply the doubled-row convention to another coordinate system without reviewing its source documentation. Optional public mappings: `terrain`, `region`, `printedFeatures`, `waterways`, `routes`. Omitted fields remain null/empty and display “Not provided by source.” List fields use the configured separator. Mapped headers naming GM secrets, spoilers, encounters, treasure, adventure details, or undiscovered content are rejected. Unmapped columns are never persisted or exposed.

If authoritative adjacency is supplied as edge rows, add:

```json
"adjacency": {
  "sheet": "ACTUAL_ADJACENCY_WORKSHEET",
  "from": "ACTUAL_FROM_HEADER",
  "to": "ACTUAL_TO_HEADER",
  "bidirectional": false
}
```

Set `bidirectional: true` only when the workbook defines those edges as undirected. Without imported edges, travel stays disabled. Unknown endpoints, self-edges, duplicate coordinates, duplicate logical positions, missing headers, and invalid grid indices fail import. The importer supports edge rows and per-hex named neighbor columns. The reviewed master uses all six source neighbor columns with no synthesized reverse edges. The waterway adapter associates only explicitly enumerated coordinates; ambiguous ranges such as the Anger Bay area are retained as source extent text, never expanded into invented hex membership or travel edges. Old Dwarven Roads has no explicit hex sequence and is not assigned one.

```sh
npm run map:import -- data/Ravenland_Campaign_Master.xlsx config/ravenland-master.json
npm run dev
```

Import is transactional and rejects replacing existing geography. `--replace` explicitly authorizes replacement; it invalidates calibration but never moves existing parties or replaces campaign records. Keep the original workbook as the source of truth. Geographic records live in separate SQLite tables; public campaign discoveries live in `session.discoveries` and are included in campaign JSON backups. Only Hex, Terrain, Site/Feature, and Region are mapped from the main sheet. Kin and Notes are omitted. Region Reference, Campaign State, and its GM-Only Notes are not imported into public geography; its two existing known places have no assigned hex, so they are not silently positioned. The waterways adapter reads only Feature, Type, and Ordered / Known Hexes—not its narrative/notes columns. Valid namespaced OOXML tags and absolute package relationships are normalized in memory for ExcelJS compatibility; source bytes and source hashes are unchanged. No adventure/GM columns are imported. Player endpoints return only reviewed public geography and that campaign's already-known discoveries; they do not query GM-secret storage.

### Calibrate against the printed image

1. Open **Map → Developer calibration**. The image retains its original proportions. Use drag/wheel or touch pan/pinch; zoom buttons work too.
2. Set orientation (pointy or flat), stagger parity, origin X/Y, horizontal spacing, and vertical spacing. The origin is the image-pixel center of logical grid `(0,0)`, which may be outside the image. Pointy grids stagger alternate rows; flat grids stagger alternate columns. Logical indices come from the reviewed import mapping.
3. Choose a known printed coordinate, enable landmark marking, and click its **printed hex center** on the image. Repeat for at least three non-collinear coordinates across the map, spanning at least half the imported column range and half the row range. Pick independently identifiable, widely separated corners/edges rather than neighboring hexes.
4. Compare preview outlines with printed hexes and adjust origin/spacing/orientation. Blue dots are independently clicked landmarks; listed error is the distance between each clicked point and its computed center. Remove/re-mark a mistaken landmark. Save a draft at any time.
5. **Verify calibration and enable overlay** is enabled only when the landmarks span the required range and each error is at most 15% of the smaller grid spacing. The server checks these constraints again. Visually inspect additional widely separated coordinates: passing a mathematical tolerance alone does not establish the real printed map's correctness.

Before verification, only calibration landmarks/outlines are shown; the complete interactive overlay, party marker, and travel are gated off. Editing calibration invalidates verification. Calibration persists in SQLite and is tied to the PNG checksum; replacing the image invalidates it. Reimporting geography also clears it. Grid lines and coordinate labels can be toggled independently. Large overlays render only hexes in the current viewport.

### Explore and travel

Click or keyboard-select a hex, or choose it using Inspect hex. Inspection highlights it and shows terrain, region, reviewed printed features, waterways/routes, and campaign-known discoveries. It never moves the party or spends time. **Plan journey to…** opens the Quarter-Day Activities modal with that destination selected. Verified calibration and an explicit imported edge are required. Planning alone does not move anyone. Player 1 selects manual outcomes and submits once, with an explicit travel ruling, to complete the quarter-day. Source facts, party revision, and adjacency are rechecked by the server. No narration, encounters, or travel mishaps are generated. The former direct-travel endpoint returns HTTP 410 so it cannot bypass journey accounting.

The old sample hex **H14 does not exist** in this authoritative workbook (H has odd-numbered rows). It is not silently relocated. If your campaign still uses H14, open Campaign Settings and explicitly choose a valid starting hex such as M22. If any existing starting hex is absent from imported data, no position is guessed. Set the intended starting coordinate explicitly in Campaign Settings, then use validated travel. Named printed features are used as destination names; otherwise the exact source coordinate is shown. Missing terrain remains empty rather than invented.

### Map tests

```sh
npm test
npm run typecheck
npm run build
npm run test:map
npm run test:map:real
npm run test:persistence
```

Fifteen unit/storage tests now include workbook import, lookup, missing-field handling, source privacy, calibration verification, explicit directed adjacency, travel rejection, and saved positions. `test:map` launches an isolated temporary database/server with **synthetic** source files. It exercises selection without movement, cancelled and confirmed travel, nonadjacent rejection, zoom/pan/touch pinch, privacy filtering, and restoration after a server restart. Fixture tests make no claims about real map content. `test:map:real` separately imports the actual uploaded workbook/image into a temporary database, checks the counts and reviewed calibration, verifies the unmapped H14 warning, explicitly places a test party at M22, and confirms source-adjacent travel to N21 plus restoration after restart. Both browser suites leave live campaigns untouched. `RAVENLAND_SKIP_MAP_BOOTSTRAP=1` disables startup preparation for isolated custom tests. The regular persistence/character-sheet suite continues to run independently and checks the missing-map state when real sources are absent.


## Quarter-day activities and Journey Settings

Click the compact **Quarter-Day Activities** status strip above chat. Keep the Traveling toggle and adjacent destination selection; assign each character once. Traveling requires one Lead the Way and one Keep Watch. Select **Success** or **Fail** manually for both. Other activities offer an Outcome required checkbox for controller adjudication; Rest and Sleep need no result. Required outcomes start unselected. Dice never determine or overwrite these choices.

**Save draft** persists assignments, selected outcomes, notes and pending travel ruling without changing location or time. Only **Player 1** (the first party member, selected using ACTING AS) can **Submit Quarter-Day Results**. This local role check is not authentication; future accounts must bind the actor to an authenticated player. A confirmed submission saves the complete record and advances exactly one quarter-day, including Night-to-Morning date rollover. No dice event, readiness count, or roll matching is required.

For travel, select an explicit arrival or stay ruling and explain terrain, progress and compatibility. Pending rulings block completion while leaving the draft intact. A failed Lead the Way never implies successful travel. Authoritative adjacency and verified calibration are rechecked, and no uniform terrain travel rate, mishap, supply use or healing is invented. Save the draft while awaiting adjudication. Selecting a map hex alone never moves the party or advances time.

The **Recent Dice Rolls** collapsible panel above chat shows the twelve latest saved character-sheet rolls, including successes and push updates from connected character windows. It is informational. Ordinary dice cards retain Push Roll and Submit Result. Push damage, gear wear and Willpower remain deterministic and applied once.

The Journal's **Day Tracker** groups completed quarter-days chronologically by campaign date. Expand an entry for weather, start/destination/end hexes, direction, named character assignments and manual results, travel ruling, submission timestamp and optional public notes. Mechanical records cannot be changed or erased through campaign updates. Player 1 can **Log correction** to append a timestamped annotation while preserving the original. Resetting the sample adventure preserves this permanent tracker and its correction log.

State uses optional, validated fields in the existing SQLite campaign snapshot (`dayTracker`, `dayCorrections`), so old databases and JSON backups need no destructive SQL migration. Existing dice, journal, old activity plans and group batches remain stored. Old completed plans are available under Saved activity history; missing historical weather is not invented to backfill Day Tracker entries. Existing Ready cards can be released to ordinary Pending rolls; push consequences remain saved. Old group mechanics are retained solely for saved-data/API compatibility and have no controls in the new activity workflow.

`getQuarterDaySummary()` supplies one public server-side narration packet after completion, with manual results and logged corrections, excluding raw dice and private campaign secrets. Notes entered here are player-visible; GM-only notes belong in the separate secret store. No OpenAI requests are made for activities or dice.

Verify with `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:quarter`. The browser test covers manual outcomes, draft/restart persistence, Player 1 gating, independent dice and pushing, immutable tracker corrections, idempotent submission and mobile layout.

## Connected character windows and pending dice

Open **Characters**, select a character, then use **Open in New Window**. The dedicated route is `/campaigns/{campaignId}/characters/{characterId}` and always loads that existing character from that campaign. The embedded sheet remains available. You can open several characters simultaneously; no campaign or character is copied. A browser may open the window as a tab depending on its popup preferences.

Character changes are stored in the same campaign SQLite database. A transport boundary in `use-campaign.ts` polls the pinned campaign every 1.2 seconds and on focus/reconnection; BroadcastChannel accelerates refreshes within the same browser. Broadcast messages never carry authoritative character data. Polling also works when windows have no opener or browser messages are missed. Character windows retain their pinned campaign when the main window loads another campaign. Their Open campaign chat link uses `/campaigns/{campaignId}` to open the matching campaign, and failed roll deliveries remain tied to their original campaign when retried. The local app still has no authentication; both `/api/characters` and `/api/dice` identify the server boundaries where future authenticated campaign membership and character ownership checks must be applied before multiplayer hosting.

Character saves send field deltas against the last displayed sheet. Changes to different fields or characters merge without replacing unrelated campaign data. Conflicting edits to the same field (or equipment list) are rejected, with an unsaved-sheet export and reload control. Incoming updates wait while a field is being edited and preserve the local staged dice pool. Failed campaign snapshots still use the existing conflict/export workflow.

### Independent staged dice

Character-sheet and connected-window rolls immediately create one persistent Pending card in chat. Push once if permitted; the existing server engine locks faces and applies damage and Willpower exactly once. **Submit Result** publishes an ordinary roll independently of all activities. The Recent Dice Rolls panel reads those same records and reflects pushes without creating duplicates. Utility rolls retain resource depletion and D66 behavior. Quarter-day outcomes are always manually selected in the activity panel.


## Character portraits and Image Library

Click the portrait frame in any connected character sheet, including separate character windows. Choose **Upload Image** or **Choose from Image Library**, review the preview, then **Confirm Portrait**. Cancelling a preview does not upload or assign anything. Existing portraits open a complete, uncropped preview with a **View full image** link, replacement controls and **Remove Portrait**. The sheet frame uses a centered cover crop without stretching; full-image viewing retains the image proportions.

Uploads support still PNG, JPEG and WebP files up to 8 MB, 20 megapixels and 8000 pixels per side. The shared image service decodes and validates the actual format, corrects EXIF orientation, strips metadata and stores a full-resolution WebP plus a square 256-pixel WebP thumbnail. Portrait uploads are categorized **Player Character**. The **Image Library** navigation panel browses the current campaign’s shared images; portraits can be assigned repeatedly without copying files. Identical uploaded file bytes are deduplicated by SHA-256, including across campaign libraries. Removing a portrait clears the character reference but keeps the reusable library image.

Each character stores only `portraitId`, alongside their existing stable ID; binaries are never embedded in character records. The same reference supplies the sheet portrait, **THE PARTY** square thumbnails, character cards, header avatars, player chat and dice cards. Characters without portraits retain their initials. Existing server polling and browser notifications synchronize replacements/removals across the main window and connected sheets without a manual refresh. Portrait assignments update only that character reference, preserving sheet data, dice results, chat and journey state.

Migration `006_image_library.sql` adds image metadata and campaign-library membership tables without rewriting existing campaign records. Files live in an `images` directory beside the campaign SQLite database by default (`ravenland/data/images` for the default database). Set **RAVENLAND_IMAGE_DIR** to an absolute persistent directory to override this. Keep both the database and image directory across restarts and include both in filesystem backups. Campaign JSON exports include portrait references, not image binaries: importing on the same server reuses available stored images; moving a backup to a different server also requires transferring its image storage and library metadata/database backup. The original independent root HTML sheet remains offline; shared library functionality is provided by the connected Ravenland sheets.

Image uploads, listings, reads and portrait assignments pass through server-side campaign checks; files are not exposed as unrestricted static public assets. Future authenticated campaign membership and character ownership policies belong at these existing image-service boundaries. This local prototype still has no authentication, and portraits do not require an OpenAI API.

Run `npm run test:portraits` after `npm run build` for upload previews/cancellation, library selection, full-image viewing, replacement/removal, shared-window/sidebar synchronization, invalid uploads, deduplication, refresh and server restart. Unit tests cover PNG/JPEG/WebP decoding, thumbnails, upload limits, stale portrait conflicts, campaign scoping, unchanged character data and backup/import references.


## Image Library categories and storage folders

The application includes these tracked development placeholders, each with `.gitkeep`:

```text
ravenland/public/images/
  terrain/
  characters/
  npcs/
  creatures/
  locations/
  scenes/
```

Open **Image Library** in the main navigation to upload art directly in the app. Choose an image file, review the preview, set its name and category, then **Confirm Upload**. **Cancel Upload** leaves both files and metadata unchanged. Categories are **Terrain**, **Player Character**, **NPC**, **Creature**, **Location**, and **Scene**; use **Filter category** to browse them. The same file uploaded again reuses its stored asset and original campaign metadata rather than creating a duplicate. Uploading through a character portrait still defaults to Player Character. Portrait selection, replacement/removal, and automatic THE PARTY thumbnails with initials fallback remain available.

The public folders are scaffolding for development assets. **Runtime uploads are stored in private persistent storage, not in these public folders or in Git.** The development default is `ravenland/data/images`, beside the existing SQLite database, and survives application refreshes, builds and server restarts when that directory is retained. Both runtime data and image contents under the public placeholders are ignored by Git; only the `.gitkeep` files are tracked. No upload operation runs Git or uploads anything to GitHub.

For hosting, mount durable storage and set `RAVENLAND_IMAGE_DIR` to its absolute path; keep `RAVENLAND_DB_PATH` on durable storage too. A serverless/temporary filesystem is not suitable. Back up both SQLite metadata and the image directory. Campaign JSON contains image references rather than binaries, so moving to another machine requires restoring the stored assets and metadata as described above.

`ImageStorage` in `src/server/images/storage.ts` separates image processing/metadata from file storage. The existing `FileImageStorage` adapter publishes complete, content-addressed objects atomically. A future S3-compatible or other cloud object-storage adapter can implement `putIfAbsent` and `read`, while retaining the same IDs, image API, portrait references and database records. No cloud provider or credentials are required for local development. Existing portrait files keep their original object keys; this change does not move or duplicate them.

Migration `008_image_categories.sql` expands the existing campaign image metadata table without changing image IDs, portrait references or other campaign records. Upload validation and thumbnail generation remain shared by the portrait picker and library panel. Tests include upgrading existing Player Character records, all six categories, a cloud-style storage adapter, deduplication, and persistent portrait reuse.

```sh
npm test
npm run typecheck
npm run build
npm run test:library
npm run test:portraits
```
