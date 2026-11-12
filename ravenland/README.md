# Forbidden Lands — The Ravenland Chronicles

The existing Next.js + TypeScript interface now stores campaigns in **server-side SQLite**. Chat supports server-side OpenAI Responses streaming and a clearly labeled offline mock mode. Campaign memory is stored separately from the public snapshot. The standalone root character sheet is preserved independently.

## Run locally

Use **Node.js 24+** and npm (SQLite uses Node's built-in `node:sqlite`).

```sh
cd ravenland
npm ci
npm run db:migrate
npm run dev
```

`npm run dev` starts trusted local play on loopback only: choose **ACTING AS**, with no separate player token. See [read-only character awareness and access limits](docs/read-only-character-awareness.md). `npm run dev:hosted` preserves network development with scoped player access.

Open **http://localhost:3000**. Migrations also run automatically when the server first opens the database. Production: `npm run build`, then `npm start`. Use `npm run dev -- --port 3001` if 3000 is occupied.

The default database is `ravenland/data/ravenland.sqlite`, resolved from the application working directory. Keep this directory between restarts. To choose a different database, export an absolute path before running migration and server commands:

```sh
export RAVENLAND_DB_PATH=/absolute/path/to/campaigns.sqlite
npm run db:migrate
npm run dev
```

Database files and WAL/SHM sidecars are ignored by Git. Public campaign snapshots can be backed up using the app's JSON export. AI memory, private review history, usage, configuration and recap records are separate server tables: back up the entire SQLite database to preserve them (see Phase 6A). Do not copy only a live SQLite main file while WAL writes may be pending; stop the server before filesystem-level backups.

## Use and verify persistence

1. Open Campaign Settings. Under Campaign library, create a named campaign or select and load an existing one. A new campaign has the sample party with empty chat and journal; the first-ever launch seeds the original sample adventure once.
2. Edit name, description, in-game date, quarter day, hex, location, terrain, weather, objective, tone, and house rules. Click **Apply changes**. Wait for **Saved to SQLite** in the main view.
3. Submit player actions and receive GM replies (OpenAI when configured, otherwise labeled mock narration). Add Journal entries. These save automatically. Party profiles and all public campaign settings are included in snapshots and backups.
4. Close the browser. Stop and restart the development server using the same database path. Reopen the app: the last selected campaign, chat, journal, party, and settings are restored.
5. Create another campaign, then load the first to confirm both remain separate.
6. Export JSON backup in Campaign Settings, then import it. Import always creates a **new** record; it never replaces the original. It accepts version 1 `ravenland-campaign` backups only, up to 5 MB. Fields, types, lengths, unique IDs, and unknown properties are validated on the server.
7. **Reset current campaign** asks for confirmation before replacing that campaign with the sample adventure. Other records remain intact. Cancel leaves it unchanged.

Changes are saved immediately through a serialized queue. Save failures are shown with Retry and Export unsaved backup controls, and leaving with unsaved changes triggers the browser's unload warning. Stale updates from another tab return a conflict instead of overwriting newer data. Export the unsaved version before using **Reload saved copy** to discard it and resolve a conflict. The campaign library blocks switching while unsaved writes remain.

The current campaign selection is server-wide for this local prototype. There is **no multiplayer authentication or shared-player synchronization**. OpenAI is optional and requires a server API key; offline mock mode remains available. Run it on a trusted development machine, not as an exposed public service. The default voice workflow remains separate Discord use. Settings are public campaign information: never enter API keys or GM-only secrets in prose fields or backups.

## Architecture

- `src/lib/types.ts`: public typed campaign/session/player models.
- `src/lib/session.ts`: UI-independent session rules and dice calculations.
- `src/lib/validation.ts`: strict public-state and backup schemas. No credential or GM-secret fields are accepted.
- `src/server/repository.ts`: repository contract supporting synchronous SQLite and future asynchronous PostgreSQL implementations.
- `src/server/sqlite.ts`: transactions, optimistic revision checks, prepared queries, migration ledger, and local database adapter. Public state is stored as a validated JSON snapshot per campaign; IDs isolate campaigns and party members have stable IDs.
- `src/server/migrations`: ordered SQL migrations, applied transactionally once per database. Add migrations here for future schema changes; do not delete existing databases as an upgrade strategy.
- `src/server/campaign-service.ts`: legacy public campaign access and mock GM helpers. `src/server/ai` now assembles bounded context, calls the official Responses SDK, persists exchanges and proposals, and exposes memory/review services.
- `src/app/api`: server-side HTTP boundary. Responses and JSON exports contain public state only. A separate `campaign_secrets` table is reserved for future GM-only state and is never read by public routes or exports.
- `src/hooks/use-campaign.ts`: initial load, serialized saves, save status, conflict handling, and campaign operations.
- `src/components`: the existing layout plus a campaign library inside Settings. No browser storage is used as the source of truth.

Phase 6A adds the AI adapter and memory/review workflow described below. The deterministic keyword-based mock remains available offline. Authenticated accounts, private character chat, production authorization, schema upgrades for future backup formats, and actual shared-player sessions remain future work.

## Automated checks

```sh
npm test
npm run typecheck
npm run build
npm run test:persistence
```

Unit/storage tests exercise reducer behavior, dice rules, strict validation, migrations, complete public snapshots, stale-write conflicts, multiple campaigns, imports, secret separation, and closing/reopening SQLite.

`test:persistence` requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is elsewhere. It launches a production server on an available local port with a **temporary database**, modifies settings/chat/journal in a real browser, closes the browser, stops/restarts the server, and asserts exact restoration. It also tests tools, mobile layout, create/load, backup export/import, invalid imports, stale writes, and confirmed/cancelled resets. It removes only its own temporary database. Run `npm run build` first. `node tests/browser.cjs` is an alias for this isolated browser check.

## Connected character sheets and dice pool

Click a character in **THE PARTY** in the left sidebar to open their complete latest sheet directly. The horizontal toolbar no longer has a Characters link. On mobile, open the campaign sidebar first. Back to characters returns to the four cards. Sheet fields, equipment, armor/helmet/shield, consumable dice, spells, current attribute damage, and Willpower save with that campaign character. Regular attributes and names also update the cards and party list. Existing campaigns without sheets initialize from their saved character profiles on first use. Campaign JSON exports/imports include the sheets.

The dice roller is integrated into the character sheet near the top, with the pool and results together. The separate Dice Roller toolbar button has been removed. Open a character from THE PARTY to roll base/skill/gear dice, negative skill dice, artifacts, or D66. Results continue appearing in Recent Dice Rolls on the main screen. Custom rolls have no attribute association; use the skill/weapon stage buttons inside the full sheet for automatic attribute damage. Staged pools are local to the panel. Rolls and final results are persistent; reopening a sheet restores its latest saved roll. Use the dice icons beside attributes or skills to stage their current values.

`scripts/generate-sheet.mjs` builds an embedded HTML asset from the repository's maintained root `index.html`, with a same-origin message bridge. The embedded frame fits its content; the sheet and roller share the containing dialog’s single vertical scroll surface (or the browser page in a standalone character window). Generated asset URLs include a content version to replace stale cached sheet code. Both panel modes share that asset, preventing the dice implementations from drifting. `predev`, `prebuild`, and `pretest` generate it automatically; the generated public file is ignored by Git. The standalone source remains usable independently. Embedded sheets do not use or replace its browser roster: campaign and character IDs control ownership, messages are checked against the iframe source and origin, and sheet updates are validated on the client and server.

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

Click or keyboard-select a hex, or choose it using Inspect hex. Inspection highlights it and shows terrain, region, reviewed printed features, waterways/routes, and campaign-known discoveries. It never moves the party or spends time. **Plan journey to…** focuses the current Quarter-Day Activities form in chat with that destination selected. Verified calibration and an explicit imported edge are required. Planning alone does not move anyone. Any current player can submit manual outcomes during development. Submission does not move the party; completion requires an explicit validated resolution. Source facts, party revision, and adjacency are rechecked by the server. No narration, encounters, or travel mishaps are generated. The former direct-travel endpoint returns HTTP 410 so it cannot bypass journey accounting.

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


## Chat-driven quarter-days and Journey Settings

The main chat contains an application-rendered **Quarter-Day Activities** card using the campaign date, location, weather and current roster. The compact status strip focuses the active card. Map **Plan journey to…** focuses the same card and preselects the adjacent destination; selecting a hex never moves the party.

Choose Traveling Yes/No, an authoritative adjacent destination when traveling, and each character's activity. Travel requires one Lead the Way and one Keep Watch. Enter manual **Success / Failure** for required activities. Other activity requirements remain explicit controller rulings; Rest/Sleep need no result. **Save draft** persists the current choices. Dice and pushes stay entirely independent, and Recent Dice Rolls remains available for reference.

Any current party member can **Submit to Game Master** during development. Submission validates outcomes, saves immutable facts to the Journal Day Tracker and marks the entry **Awaiting GM Resolution**. It does **not** move anyone or advance time. Missing consequences, failed navigation, terrain progress, supplies and healing are never silently inferred. Restore authenticated submission permissions before public multiplayer deployment.

With no paid AI connected, expand **Resolve quarter-day · development GM controls** in the submitted card. Record the actual ending hex (start or intended adjacent destination), explicit adjudication, weather for the next quarter, and optional narrative. **Complete quarter-day** validates the ruling against current geography and the submitted clock, then atomically commits location, advances exactly one quarter-day, updates weather/map/sidebar and marks the Journal view **Completed**. Night rolls into the next day. Replayed actions cannot apply effects again. Pending information requests must receive a response before completion. A new activity card becomes available automatically.

**Journey Settings is configuration only**: weather mode, default leader/watcher, and default Hike outcome requirement. Manual weather can be retained or edited when completing. Phase 6A can propose next-quarter weather, which must be reviewed or entered explicitly before completion; no substitute rules modifiers are invented. Legacy journey/roll-matching management is disabled once the chat workflow is initialized. Existing saves, old activity/dice records and journal notes are retained.

`quarterDayGM()` in `src/server/journey/gm-contract.ts` is the future server integration contract: request a form, read a submitted packet, request information, publish narration and propose a resolution. A proposal has no mechanical effect. The application validates and explicitly commits completion through `/api/journey`. Submitted packets omit raw dice histories and private campaign secrets; React renders all narrative text, never arbitrary AI HTML. No OpenAI calls occur in this workflow.

Persistence uses backward-compatible optional fields in the existing SQLite campaign snapshot (`chatJourney`, existing `dayTracker`). Submitted facts, GM updates and completion receipts are append-only. The Day Tracker joins original submissions with subsequent resolution/narrative records, so adding narration never overwrites manual outcomes. Old tracker entries continue displaying as Completed. JSON backups include both layers; no destructive SQL migration is needed. Campaign clock/location edits are blocked while a submitted quarter-day remains unresolved. Unsubmitted forms can be superseded after an explicit clock correction.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:quarter`, `npm run test:map:real`, and `npm run test:dice-repair`. Checks cover chat rendering, actual adjacent options, failed manual results, any-player submission with no dice, pending/complete Journal views, requests/replies/proposals/narration, atomic completion/replay, rollover, weather/map updates and refresh/restart. Character sheets and dice remain independent.

## Connected character windows and pending dice

Open **Characters**, select a character, then use **Open in New Window**. The dedicated route is `/campaigns/{campaignId}/characters/{characterId}` and always loads that existing character from that campaign. The embedded sheet remains available. You can open several characters simultaneously; no campaign or character is copied. A browser may open the window as a tab depending on its popup preferences.

Character changes are stored in the same campaign SQLite database. A transport boundary in `use-campaign.ts` polls the pinned campaign every 1.2 seconds and on focus/reconnection; BroadcastChannel accelerates refreshes within the same browser. Broadcast messages never carry authoritative character data. Polling also works when windows have no opener or browser messages are missed. Character windows retain their pinned campaign when the main window loads another campaign. Their Open campaign chat link uses `/campaigns/{campaignId}` to open the matching campaign, and failed roll deliveries remain tied to their original campaign when retried. The local app still has no authentication; both `/api/characters` and `/api/dice` identify the server boundaries where future authenticated campaign membership and character ownership checks must be applied before multiplayer hosting.

Character saves send field deltas against the last displayed sheet. Changes to different fields or characters merge without replacing unrelated campaign data. Conflicting edits to the same field (or equipment list) are rejected, with an unsaved-sheet export and reload control. Incoming updates wait while a field is being edited and preserve the local staged dice pool. Failed campaign snapshots still use the existing conflict/export workflow.

### Independent staged dice

Character-sheet and connected-window rolls immediately create one persistent Pending card in chat. The sheet displays the initial dice and keeps **Push Roll** visible, enabling it once its save is acknowledged directly. A status explains saving, an already-pushed result, armor/utility restrictions, or a pool with no eligible dice. A failed roll save offers **Retry saving roll** inside the sheet using the same ID; it does not require another roll or a trip to chat. Push once if permitted; the existing server engine locks faces and applies damage and Willpower exactly once. **Submit Result** publishes an ordinary roll independently of all activities. The Recent Dice Rolls panel reads those same records and reflects pushes without creating duplicates. Expand an entry to inspect original and final dice, successes, attribute/skill/gear ones and their total, push state, damage, Willpower actually gained (including the cap), and the timestamp. Skill ones are reference values, not damaging banes. Bound attribute and weapon consequences are applied once by the existing server engine; unbound attribute or gear damage is reported for manual application, without modifying an arbitrary attribute or item. Sheet frames create and push rolls through the same serialized server transport, with a direct acknowledgement; no page-level custom event listener is required. They use the existing server engine, never a second local push. Sheet refreshes preserve push visibility and status alongside the dice. Final dice remain visible when staging another pool, until a new roll or explicit clear; refresh/reopening restores the latest saved roll. Utility rolls retain resource depletion and D66 behavior. Quarter-day outcomes are always manually selected in the chat activity form.


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

Open **Image Library** in the main navigation to upload art directly in the app. Choose an image file, review the preview, set its name and category, then **Confirm Upload**. **Cancel Upload** leaves both files and metadata unchanged. Categories are **Terrain**, **Player Character**, **NPC**, **Creature**, **Location**, and **Scene**; use **Filter category** to browse them. Uploading the same file again reuses its stored asset and **updates that campaign’s name/category to the selection you confirmed**. For example, Terrain → NPC → NPC leaves one NPC entry and one full/thumbnail file pair. Existing cards also have a Category dropdown so an incorrect category can be repaired without uploading again; stale edits from another window are rejected. Other campaigns’ metadata and assigned portrait references are unaffected. Uploading through a character portrait still defaults to Player Character. Portrait selection, replacement/removal, and automatic THE PARTY thumbnails with initials fallback remain available.

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

### Dice repair checks and handbook verification

Run `npm run test:dice-repair` after `npm run build`. It checks direct character access from THE PARTY on desktop/mobile, native attribute and weapon staging, mixed dice and artifacts, visible pushes in the integrated sheet roller, failed-save retry, preservation after sheet edits, one scroll surface, locked faces, original/final records, damage/Willpower and gear changes, duplicate clicks and receipt replay, standalone-window restoration, live Recent Dice Rolls synchronization, and a non-first-party-member quarter-day submission with no dice dependency. `npm test` also covers zero/multiple successes, skill ones without damage, a fully locked pool, armor/resource/D66 restrictions, negative dice, one-push limits and restart persistence.

Verified against the user-supplied **Forbidden Lands Player’s Handbook, fifth printing**, printed pages **44–46** (pushes, damage and WP), **47** (negative dice), **50** (gear wear and artifact scoring), and **105** (armor cannot push). Standard pushes lock successes and base/gear ones; skill and negative-skill ones reroll. Artifact scoring is D8/D10/D12 with extra successes at 8, 10 and 12, and artifact dice cause no gear wear. Artifact ones follow the general non-skill one-lock rule. Both the server and standalone sheet preserve them. No successful roll can be pushed through the application without confirming the GM-approved benefit of additional successes (the fifth-printing clarification on page 44). Every eligible die is rerolled; standard pushes are limited to once. Willpower gained is from base ones only, capped at 10. An empty or completely locked pool offers no reroll.

Special mechanics remain outside this targeted repair: **True Grit** (page 62) permits a dwarf to spend WP on further pushes; this talent requires manual adjudication and is not automatically executed by the standard one-push engine. **Pride** (pages 50–51) is likewise handled manually, including its prohibition on pushing after activation; the artifact D12 selector is not Pride activation. Extra-success benefit remains a GM ruling, not a rule the app infers from a skill name. These limits are documented rather than silently approximated. No handbook PDF or copyrighted sourcebook passages are committed to Git.

## Phase 4.7 — Hex Fog of War

Open **Map**. Fog defaults **On**, with **90% darkness**. **Fog of War** changes presentation only; turning it off does not mark any hex explored. **Darkness opacity** changes the darkness level without exposing concealed location details. Preferences and explored canonical hex IDs are stored per campaign in the existing SQLite campaign snapshot and included in JSON backups.

The party's current valid hex is always explored and visible. A completed, validated movement resolution adds only the actual entered hex, retaining previously explored hexes. Selecting a hex, saving a journey draft, submitting activities, proposing arrival, or resolving travel as “stay” never reveals the intended destination or adjacent hexes. Explicit starting-location corrections also make the current hex visible. Current visibility derives from the persisted party position; normal saves retain both former and new valid positions. Existing campaign saves need no destructive migration. Imported exploration is preserved when geography is not yet installed and validated against canonical IDs when the source is available.

Enable **GM Reveal Mode** to inspect the full imported public map. Select a hex and use **Reveal Hex / Hide Hex**, or set **GM click action** to paint reveals/hides across successive hexes without dialogs. These actions never move the party. The current party hex cannot be hidden. **Reset exploration** requires confirmation and keeps only the current hex explored. GM Reveal Mode itself is a local view state and starts off when reopening the map; it does not mark anything explored.

The fog and visible-image clip use the existing `hexPolygon()` geometry inside the same SVG transform as the image, grid, labels and party marker. The overlay is a continuous charcoal fill with explored-hex cutouts, so hidden cells have no seams and zoom/pan do not move the overlay relative to the grid. No separate map artwork or replacement image file is generated. The image endpoint applies a response-only mask to the original source pixels in player view: concealed printed labels are not delivered, even at 0% darkness. Rendering is cached by source checksum, calibration and explored IDs; opacity changes do not require new raster rendering. Unverified calibration must be reviewed in GM view before revealing correctly aligned source details.

Player `/api/map?campaignId=…` responses redact unexplored terrain, regions, printed features, discoveries, routes and waterways. Route catalogs omit hidden extents; the inspector/search/coordinate overlays expose no undiscovered names. Full public-map data and imagery are available through `view=gm` during local development, or by explicitly switching fog off. GM-only workbook notes/encounters are still excluded from imported public geography. The original unscoped `/api/map/image` URL now requires a campaign ID.

`getExplorationState()` in `src/server/map/exploration.ts` exposes current, explored and unexplored hexes plus known/undiscovered public locations for a future trusted GM adapter. The player map response omits undiscovered-location names entirely. No OpenAI integration is used. `requireMapAccess()` is the single server authorization boundary: before multiplayer hosting, bind it to authenticated campaign membership and GM role checks for full-map views and exploration edits. Development deliberately does not require Player 1. Exploration edits use `/api/map/exploration` with atomic, idempotent action receipts; ordinary campaign snapshots cannot bypass that service.

After `npm run build`, run `npm run test:fog`. It exercises the actual Ravenland map: current visibility, darkness controls, GM inspection/reveal/hide/paint, reset confirmation, overlay geometry under zoom/pan, hidden information, plan-versus-arrival semantics, restart persistence and mobile layout. `npm test` adds pixel-level checks against a synthetic map to prove that concealed source imagery is absent, as well as canonical validation, separate campaign state, backups and validated travel. Existing journey, sheet, dice and journal checks remain available.

### Discovered Locations map layer

Use **Journal → Add Discovery** to record a player-known location, or select a canonical hex on **Map** and choose **Add Location**. Choose Village, Castle, Dungeon, Ruins, or Other and Rumored, Discovered, or Visited. Saving explicitly confirms the record and creates a linked Journal entry using the current campaign date and quarter-day. It never changes party position, time, or explored hexes. Ordinary Journal text is never parsed or rewritten.

The Journal's compact Discovered Locations registry supports renaming, reclassification, corrected hexes, status changes, and notes. The original discovery date and original linked Journal entry remain unchanged when editing. Map markers open player-visible details, editing, and a link that focuses the original Journal entry. Campaign reset preserves these records and their linked history; create a new campaign for a fresh registry.

On the map, **Discovered Locations**, **Show Location Names**, and **Show Location Icons** are independent display controls. **Rumored Locations** is off initially: recording a rumor requires a canonical approximate hex and enabling this control displays its dashed marker even in unexplored territory without revealing terrain. Discovered/Visited annotations appear only in visible hexes with Fog of War enabled. Disabling fog or entering development GM inspection shows recorded sites without changing their status. No registry is populated automatically from hidden geography, source catalogs, secrets, or free-text notes. Labels use the existing calibrated SVG transform; short labels keep a readable screen size, avoid collisions where possible, and truncate long names (the info panel retains the full name).

Storage uses the existing SQLite campaign snapshot and backup format (`session.locations`, optional for older saves), so existing campaigns and legacy `discoveries` remain valid without a destructive migration. Records carry stable UUIDs, canonical hex IDs, first-discovery date/quarter, optional canonical source location ID, notes, and Journal reference. Edits validate against authoritative geography, preserve linked history, reject stale updates, and prevent duplicates by normalized name+hex or shared canonical ID. Commands are transactional and have idempotency receipts; retrying a saved command cannot duplicate its entry. Names/notes are player-visible fields; do not put GM secrets there. Map responses filter concealed annotations before delivery.

The future server-side AI adapter can call `proposeLocation(campaignId, candidate, repository)` in `src/server/map/locations.ts`. It validates a structured name/type/hex/status/notes/optional Journal narrative and returns `requiresConfirmation: true` without writing anything. Present that proposal to a player/GM for review, then use the application's confirmed recording action (`POST /api/map/locations`, unique `actionId`, `confirmed: true`). AI adapters must never invoke the confirmed write on their own. Local development intentionally allows any player; enforce authenticated campaign membership/GM permissions at the existing `requireMapAccess` boundary when multiplayer identity is introduced. No OpenAI API is called.

Verification: `npm test`, `npm run typecheck`, `npm run build`, then `npm run test:locations`. The browser test uses an isolated SQLite database and actual map, creates discoveries from both interfaces, checks duplicate prevention, history preservation, names/icons/layer controls, SVG placement while panning/zooming, fog and rumors, Journal links, restart persistence, and mobile width. `npm run test:fog` and `npm run test:quarter` cover the existing exploration and journey workflows.

## Phase 6A: AI Game Master and persistent campaign memory

The existing chat now uses the official `openai` Node SDK and **Responses API**. One bounded, schema-constrained request streams public narration and returns memory/action proposals together; it does not make a separate extraction call after every reply. The application persists both sides of each exchange. No AI calls occur when staging, pushing, displaying, or submitting dice. Quarter-day submission stays deterministic and does not call AI automatically; the explicit **Ask AI GM to review results** button sends the saved manual outcomes once per submission/information-response round; repeated clicks replay the saved reply. Answering an AI information request allows a fresh explicit review. Ordinary chat also includes the current pending quarter-day packet when present.

### First live test

1. Use Node 24+, run `npm ci`, and copy `.env.example` to **`.env.local` inside `ravenland/`**. Set `OPENAI_API_KEY` to your own API key and choose `OPENAI_MODEL` (default `gpt-4.1-mini`, which must support Responses streaming and Structured Outputs). Set `RAVENLAND_AI_MODE=openai`. Never put keys in browser settings, chat, Journal entries, campaign records, screenshots, Git, or public backups.
2. Generate a separate development review secret, for example with `openssl rand -hex 32`, and set it as `RAVENLAND_GM_REVIEW_TOKEN`. It must be at least 24 characters; leaving it blank disables privileged review. This is **not** the OpenAI API key. The token is entered only in the clearly labeled privileged development review controls and is held in component memory, not campaign data or localStorage.
3. Restart `npm run dev` (or build/start for production). In **Campaign Settings → AI Game Master**, click **Test Connection**. This sends a small Responses request and shows a sanitized success/failure. The selected model, recent error codes, narration style, autonomy, request attempts, token totals, and optional cost estimates appear here. Prices are not hardcoded: optionally configure per-million input/output USD rates for your selected model in the server environment. Unknown token counts/prices remain unknown, not falsely reported as free.
4. Choose **Start test conversation in a separate campaign**, confirm, and use the resulting `/campaigns/<id>` page. This explicitly creates an isolated copy of public campaign state and approved/corrected party-known memory. Private memories and API usage are not copied. **Reset test conversation (new copy)** creates another fresh copy from the original source; old test campaigns remain available and the source campaign is preserved. Real API requests in test campaigns are billable.
5. Speak to the GM in the existing chat, for example establish a promise with a new NPC. Narration streams in the current styling; quoted NPC speech stays within the narrative. Significant facts with validated supporting evidence appear as **Proposed**, not approved history, under **Journal → GM Memory**. If no proposal is warranted, a privileged GM can add one manually and select its source message or Journal entry.
6. Expand **GM Memory**, enter the development review token, and unlock the **PRIVILEGED DEVELOPMENT GM VIEW**. Review the proposed summary, correct it if needed, and approve it. Search/filter by category, status, and visibility; inspect source references and correction history; archive/reject obsolete proposals or lock canonical facts. Corrections preserve the original Journal and audited memory versions. Locked facts cannot be automatically rewritten by AI proposals; deliberate GM corrections remain available and audited.
7. Restart the application with the same database, then ask the GM about that NPC or promise. The context assembler retrieves approved/corrected relevant facts from SQLite; memory does not depend on an OpenAI conversation ID or a browser tab staying open.
8. At the end of a session, use **Journal → Session Recaps → End Session**. Review/edit the draft, review its proposed memories in GM Memory, then **Save recap to Adventure Journal**. This appends one entry, preserves the transcript, and starts the next session boundary. Previously saved recaps can be reopened. Repeating a save or retrying generation does not overwrite previous entries or duplicate a recap for the same session.

Without credentials and without an explicit OpenAI override, the app uses clearly labeled **mock narration** so existing offline workflows still run. `RAVENLAND_AI_MODE=mock` forces it. Mock recap text is explicitly a placeholder, and mock mode never proposes facts pretending to come from an AI. With `RAVENLAND_AI_MODE=openai`, a missing key is an explicit recoverable error. Missing/rejected credentials, quota/rate limits, network failures, interrupted streams, and incomplete/invalid structured responses produce safe messages without returning provider error payloads or key values.

For a cloud workspace, the environment network policy must also allow **`api.openai.com` over HTTPS**. A running workspace alone does not establish that outbound access is allowed. This implementation's verification uses an injected SDK transport and does not require or consume a real API key.

### Authority, privacy and review

`src/server/ai/instructions-v1.ts` contains the protected application policy; Phase 6A.2 adds separately editable behavior (see below). Guided and Autonomous Narrative modes differ in fictional initiative, **not** mechanical authority. The model has no SQL, filesystem, shell, image-generation or arbitrary tool access. Character attributes, damage, Willpower, inventory, experience, dice, position, clock, fog and discoveries remain under existing application services. The only proposed application actions are requesting the existing quarter-day form, asking for additional information, publishing a quarter-day narrative, and proposing a resolution. Applying one is explicit and idempotent; a resolution proposal still waits for the existing **Complete quarter-day** control. The application validates the intended adjacent destination again. Unverified rules and failed-roll consequences still require a GM ruling; neither AI mode automates combat, healing, encounters or travel mishaps.

Campaign memory has categories, summaries, character/NPC/hex associations, faction/quest context, active/resolved/historical story state, first/current campaign date/quarter, sources, importance, visibility, revisions, timestamps and proposed/approved/corrected/archived status. Proposals deduplicate by entity and normalized fact content; approved updates keep stable canonical IDs and audited corrections. Semantic deduplication is not claimed. Rejected/archived/proposed records are excluded from authoritative retrieval, and historical narration linked to explicitly rejected public proposals is omitted from new AI context.

**Party Known**, **Character Specific**, and **GM Only** are stored separately from the public Session JSON in `campaign_memories`. Public memory routes return only party-known records. Private views/history/writes require the separate server-validated development token; invalid credentials are rejected. Character selection in the chat is not identity authentication, so **private and character-specific memory is deliberately withheld from all public AI requests**, even in Test Mode. Authenticated private channels and GM-only reasoning can be added later. Never rely on a prompt alone to keep private context out of a public model response. Reclassification does not retract information already published in public chat or Journal text.

The existing image library is player-visible. AI receives only metadata explicitly shared through the **Privileged development scene image sharing** controls in AI Settings. Images default to unshared, and a returned image ID is checked again against the campaign's shared library before display. No image files or paid image generation are sent to OpenAI; only the allowlisted metadata is offered for scene selection. Do not store secret GM art in the current player-visible library; private image authorization is future multiplayer work.

### Context, reliability and storage

`assembleContext` always includes current campaign/party state and selects a bounded set of approved/corrected memories using importance, current hex, active quests/threats, mentioned names/factions and keywords. It includes only a small recent chat window and selected public Journal excerpts, not the entire campaign database. Context size is bounded; session recaps retain at most 60 recent non-form messages, 15 new Journal entries and 12 day records and explicitly count omissions. The underlying transcript is preserved; long sessions can be reviewed in the Journal. Responses input is explicit application JSON with versioned instructions, `store:false`, and no global/shared OpenAI conversation. The memory repository interface leaves room for PostgreSQL and semantic retrieval later.

Settings can preview public context and inspect the saved context for a request. Ordinary views redact memory records that have since been reclassified private; the privileged development gate is required to inspect those historical records. Usage records include failed attempts with unknown usage where the provider supplied no counts. Response limits and timeouts are server-configured; SDK automatic retries are disabled to avoid hidden extra calls. Errors expose fixed, sanitized messages, never raw SDK bodies. Tokens/costs are estimates when available; configured flat input/output rates do not include taxes, discounts or other provider billing details.

A stable request UUID owns the player message, assistant reply, memory proposals and receipts. Retrying a failed turn uses that UUID; completed turns replay their saved reply. Concurrent duplicate turns are rejected, and campaign-wide single-flight checks prevent overlapping AI turns. Expired attempts cannot overwrite a newer completed reply. If the server stops mid-request, allow the 150-second lease to expire, then use **Retry GM response** or Settings → Request recovery; a provider may have billed an interrupted attempt even if the response was not saved. Local requests continue persisting after a browser disconnect when the server remains running. Production deployments will need durable background execution for stronger completion guarantees.

Migration **009** adds AI configuration, memory, audited history, request/usage receipts, recaps and image sharing tables without replacing existing campaign data. JSON campaign export remains a **public snapshot**: it does not include these separate AI/private tables, credential values or usage. For complete backups, stop the application and back up the SQLite database (or use SQLite's supported online backup tooling), plus the existing persistent image directory. Do not copy only the live main database file while WAL writes may be pending.

The current development token is a temporary privileged local gate, not multiplayer authentication. Before hosting, add authenticated campaign membership/GM roles, character ownership/private channels, per-user rate/budget limits, durable request workers, and shared persistent database/object storage. Do not expose the unauthenticated local prototype directly to the public internet.

### Phase 6A verification

```sh
npm test
npm run typecheck
npm run build
npm run test:ai
npm run test:persistence
npm run test:quarter
npm run test:dice-repair
npm run test:fog
npm run test:locations
```

Tests isolate their databases and use controlled responses through the **official SDK**. They cover streaming, connection checks, missing/invalid credentials, rate limits, usage, duplicate requests, restart recall, memory approvals/rejections/corrections/locks, private-data filtering, recap saving, test campaign isolation, migration safety, and existing game features. `tests/fixtures/ai-provider-preload.mjs` is installed only by the isolated browser test via `NODE_OPTIONS`; production has no test endpoint or alternate-provider configuration. No real OpenAI requests are made by automated checks. The first live connection must be performed locally with your own key and allowed outbound network access.

## Phase 6A.1: campaign canon and evidence reliability

This is a focused memory reliability update. It adds no mechanical actions, no database columns/tables, no migrations, and no new configuration or environment variables. Existing approved memories, including the existing Orvik record, are not rewritten, reapproved, reseeded, or backfilled. Older records retain their approval and source links; the review UI identifies missing detailed provenance as legacy metadata rather than inventing it.

The versioned GM instructions (`ravenland-gm-v1.1`) and context now state an explicit hierarchy: approved/corrected GM memories and explicit decisions establish story canon; application state remains authoritative for mechanics. Reviewed/saved session recaps and established character/location records support that canon. Player/NPC statements establish what was said, not necessarily its truth. Rumors, unapproved proposals and AI improvisation are unconfirmed. Rejected proposals and unsupported AI recollections are not history. The same hierarchy applies to End Session; current canon takes precedence over older summaries.

Explicit historical-recall requests are read-only for automatic memory creation. If the application cannot find relevant established evidence, it saves an application-labeled uncertainty answer without an OpenAI call or a memory proposal. If relevant evidence exists, the model receives approved facts first and instructions to avoid embellishment. Active gameplay still permits new descriptions, NPC dialogue and developments. The recall classifier is lightweight, not a general natural-language intent engine.

Every automatic proposal now needs an exact supporting excerpt and a real, campaign-scoped source ID offered in the request's bounded evidence index. Sources can be existing chat, Journal/reviewed recap, approved memory, or established campaign records. Server-derived provenance records the source type/ID, relevant session, excerpt, origin (GM-established, player-established, AI-generated or application-maintained), and whether it supports an event, statement or later development. The model cannot assign its own authority. Current replies and unsaved recaps cannot cite themselves. Earlier AI-generated new events need a later, affirmative player acceptance; questions, denials and historical guesses do not count as acceptance. Repeated AI narration is not independent corroboration. Unsupported/forged citations, obvious NPC substitutions, unrelated promise objectives, unsupported recovery claims and attempts to convert reported NPC assertions directly into fact are discarded before a proposal is written. A privileged GM can still create or correct a manual proposal explicitly.

Potential conflicts are checked against relevant approved records before saving a proposal. The initial rules flag likely changes to identities, promises/quest goals, ownership, locations, relationships, status and negated events. The proposal carries the conflicting memory ID/title and a short review explanation; it cannot overwrite approved canon. An evidenced later recovery or other explicit change is marked **Possible later development**, not an irreconcilable contradiction. Approval remains a deliberate GM action, with existing locks, revisions and correction history. For explicit updates to an existing record, retain its `targetMemoryId`; existing target-version and lock checks still apply.

**Journal → GM Memory** shows supporting evidence and these warnings alongside the existing approve/reject/correct controls. Legacy records remain readable. Private memories and private provenance/conflict references are excluded from ordinary player views and context previews; the existing privileged development token is unchanged. Rejected proposals' linked chat and Journal sources (including their generating AI narration) are excluded from new contexts and recaps, without deleting the underlying transcript or Journal entries. Stored request previews also redact evidence references that are now private or invalid.

There are no extra model calls for evidence validation or conflict detection. The evidence index and historical source inspection are bounded and use existing records. These checks are intentionally conservative: they can reject valid paraphrases, and the conflict heuristics can miss semantic contradictions or flag legitimate changes. They are review aids, not a complete entailment or truth engine. A model may still make a narration mistake despite its instructions; GM review, corrections and canon locks remain necessary. Legacy messages do not provide authenticated human identity or perfect session provenance. No live-model quality guarantee is inferred from deterministic SDK fixtures.

### Exact manual regression using the existing Orvik memory

1. Pull the updated branch and restart the app **using the same campaign database and existing `.env.local`**. Do not reset, reseed or recreate the original campaign. Open **Journal → GM Memory**, unlock the existing development GM token, and search for Orvik. Verify the existing approved ID and text: traveling dwarf; silver ring lost near an abandoned stone bridge; party promised help recovering it. Do not edit or reapprove this control record.
2. In that original campaign's chat, ask exactly: **“What did the party promise Orvik?”** Expected: recover the silver ring, with the bridge/dwarf details if relevant; no invented misty-woods/safe-passage promise. Confirm no new automatic memory proposal was created by this recall question. In Settings → Request recovery → **Inspect sent context**, verify that approved Orvik canon is included as canonical and earlier unsupported AI recollections are absent or explicitly unconfirmed.
3. Restart the development server with the same database and ask **“Do you remember what we promised Orvik?”** again. Verify the same canonical facts and unchanged approved memory ID/status/text.
4. Ask **“What did we promise Tervan?”**, using a name with no established campaign evidence. Expected: an explicit uncertainty answer labeled **CAMPAIGN CANON**, no invented relationship, no new memory proposal, and no additional API usage for this guarded reply.
5. For destructive/altering review experiments, use **Settings → Start test conversation in a separate campaign**. Perform the remaining steps only in that isolated copy. This preserves the original approved Orvik memory.
6. In the copy, use **GM Memory → Add memory proposal** with title **“Orvik alternate promise”**, NPC ID `orvik` if applicable, and summary **“The party instead promised Orvik information about safe passage through misty woods.”** Leave it proposed. Expected: **Possible contradiction** referencing the copied approved ring memory. Inspect the supporting manual provenance, then reject it. The approved ring record should stay unchanged. For an automatic proposal, supply a genuine recorded gameplay statement and inspect the source/excerpt; if the model supplies insufficient evidence, no proposal is saved rather than minting history.
7. In the copy only, propose a supported later event such as **“Orvik's ring was lost near the abandoned stone bridge; later the party recovered and returned his silver ring.”** Expected: **Possible later development**, not a claim that the original loss never happened. For an automatic update, first record the actual player recovery action; the model must cite it with `claimType=development` and may target the copied original memory. Approve a legitimate update only in this copy, then inspect correction history to verify the original loss is preserved.
8. Generate **End Session** in the copy. Review the recap against approved canon; rejected safe-passage information must not be treated as fact. Use the existing privileged view to inspect private records; ordinary memory/context views must not contain their contents or private evidence.

Automated verification: `npm test` includes the isolated Orvik A–F scenarios in `tests/ai-canon.test.ts`, with byte-for-byte preservation checks on the fixture's approved record through recall/restart. `npm run test:ai` exercises the SDK transport, evidence display, contradiction warning/rejection, uncertainty answers, and the existing review/recap workflow. Run `npm run typecheck` and `npm run build` as usual. No lint script is currently configured. Tests use temporary databases and synthetic Orvik records; they do not operate on the live campaign or make paid API calls.

Files: `src/lib/ai/canon.ts` and `schema.ts` define policy, evidence DTOs and warning types; `src/server/ai/evidence.ts`, `context.ts`, `memory.ts`, `service.ts` and `instructions-v1.ts` enforce/assemble them. The GM Memory component and saved-context endpoint display/redact metadata. Supporting message/provider types recognize the application-generated uncertainty answer. Existing SDK/browser fixtures were updated for the evidence schema; the map, journey rules, dice engine and character sheets were not redesigned or mechanically changed.

## Phase 6A.2: configurable AI Game Master instructions

Open **Campaign Settings → AI Game Master → AI Game Master Instructions**. Enter the existing development GM review token to unlock the editor. The server must have `RAVENLAND_GM_REVIEW_TOKEN` set to at least 24 characters; no new environment variables or dependencies are required. Never enter an OpenAI key in the browser. Without this token, neither the default nor saved private instruction text is returned by the endpoint.

The editor includes **Save Instructions**, **Restore Defaults** (confirmation required), **Revert Unsaved Changes**, **Reload Saved Instructions**, a dirty indicator, last-saved time in America/Chicago, and a lock button. It accepts up to 80,000 characters, preserves whitespace, and rejects blank instructions. Revert affects only the unsaved draft; Restore Defaults changes the saved campaign configuration. Revision checks reject stale saves/resets from another tab without discarding your draft. Reload lets you explicitly discard that draft and retrieve the newer version. The token and editor contents are held in component memory only, not localStorage; closing Settings locks the editor. Save before closing it.

Migration **010_ai_gm_instructions.sql** adds three columns to `ai_campaign_config`: nullable `gm_instructions`, nullable `instructions_updated_at`, and `instructions_revision` (initially zero). A NULL instruction value uses the maintained defaults. The migration runs through the existing migrator on startup (`npm run db:migrate` also works). It never reseeds campaigns, memories, Orvik, recaps, secrets, or other application state. Each campaign has its own instructions. Isolated AI test campaigns copy the source instructions at creation, then can change independently. The private configuration stays outside player-facing campaign JSON exports; retain the SQLite database for a complete private backup.

The supplied default text is maintained in **`src/server/ai/default-instructions.ts`**. It directs an autonomous narrative GM, treats the administrator as an ordinary player during play, preserves agency and adventure secrecy, distinguishes historical recall from new improvisation, and permits uncertainty. Editable text is distinct from:

1. **Protected application policy**, version `ravenland-gm-v1.2`, in `src/server/ai/instructions-v1.ts`, sent through the Responses API's root `instructions` field. It retains canon/evidence, private-information, structured-output, tool and mechanical boundaries.
2. **Campaign-specific editable behavior**, loaded from SQLite immediately before each new model request and sent as a developer message, with existing style/autonomy preferences.
3. **Campaign knowledge and player actions**, assembled through the existing party-known context/evidence service and sent as a user data message. Editable instructions are not inserted into saved public context previews, public AI status or campaign records.

Normal chat, narrative, supported historical recall, memory proposals and End Session recaps share this request pipeline. Saves apply to the next new request with no server restart and no extra AI calls. An in-flight or already completed/replayed request is not regenerated. The existing unknown-history guard can answer without calling the model; the small Test Connection health check does not send campaign instructions. Mock mode does not simulate arbitrary custom behavior. All actual API calls remain server-side, streamed, schema-validated, and metered as before. Longer instructions consume additional input tokens on normal requests.

`GET/POST /api/ai/instructions` enforce the existing `x-ravenland-gm-token` authorization **before** reading or changing instructions. Responses are private/no-store. Save and confirmed restore use optimistic revision checks; existing same-origin JSON validation applies. This is the current development authorization boundary, not full multiplayer identity. Server-side mechanical validation and memory review remain mandatory even if editable text requests otherwise. Private campaign memories are still withheld from public context, and the editable editor does not grant gameplay access to adventure secrets. Prompts are not a substitute for future authenticated private channels.

Implementation files: `src/components/gm-instructions-editor.tsx`, its mount in `ai-settings.tsx` and styles; public DTO/limit in `src/lib/ai/instructions.ts`; private defaults, storage/validation service and protected policy under `src/server/ai/`; privileged route under `src/app/api/ai/instructions/`; request/provider and test-copy integration in `service.ts`, `provider.ts`, `store.ts`, plus the bounded-body helper. A small recall subject fix prevents a known character's kin (e.g. Halfling) from being mistaken for evidence about a different named NPC (Titus). No existing character, map, dice, journey or Journal UI was replaced.

Verification commands (Node 24+, installed dependencies):

```bash
npm test
npm run typecheck
npm run build
npm run test:ai-instructions
npm run test:ai
npm run test:persistence
```

The focused unit tests cover defaults, persistence, reset, input validation, conflicts, campaign isolation, safe upgrade from migration 009 with approved canon, immediate settings on chat/recall/recap, unknown Titus, new NPC introduction, unchanged Orvik, and request role separation. The focused browser suite verifies the real editor, unauthorized read/write/reset, refresh and production-server restart, save/revert/reset confirmation, stale-save recovery, private-context exclusion, and an immediate narrative preference through the official SDK with a test-only fake transport. Existing AI browser tests cover memory review, recap, journey proposals and character-sheet push controls. These use temporary databases and synthetic canon; no paid API calls or live-memory edits are needed. No lint script is configured.

For manual verification, launch `npm run dev`, unlock the editor, append a harmless preference such as “Use shorter NPC dialogue,” and save. Refresh, unlock again, and confirm it remains. Send a new action and inspect the next reply with your configured model; this is a normal metered API request. Restart the server and verify the saved text. Ask “Who is Titus the Halfling?” in a campaign without Titus evidence; then separately request a new Titus introduction. Recall the approved Orvik ring/bridge/promise facts. Finally test Revert and confirmed Restore Defaults, and verify the editor cannot be read or changed without the token.

This phase does not add rules/adventure ingestion, retrieval, autonomous mechanical execution, production authentication, or multiplayer hosting. Existing manual canon review remains in place. Deterministic tests establish wiring and guards, not a guarantee of live-model narrative quality or perfect natural-language recall classification. Phase 6B remains unimplemented.

## Phase 6B.1: local Sourcebook Knowledge Library

Open **Campaign Settings → Sourcebook Library**, enter the existing development GM review token, and choose **Unlock Sourcebook Library**. Select a text-based PDF, give it a title/category, choose visibility, then **Upload and Index**. Upload progress is shown as a percentage; indexing status and processed/total physical PDF pages appear on the document card. Files default to **GM Only**. Failed documents remain listed with a safe error and **Retry indexing**; textless PDFs explicitly require external OCR. Password-protected documents are not supported.

Each campaign has its own library. Documents show their original filename, title, size, upload time in America/Chicago, PDF page count, status, category, and visibility. Expand **Classification and document actions** to change title/category/visibility, reindex, or confirm deletion. Identical PDF bytes uploaded again in the same campaign reuse the existing document and preserve its current classification; use Save classification to change it. Concurrent indexing and stale classification/deletion requests are rejected. If a server is interrupted during indexing, after four minutes the abandoned status becomes Failed and can be retried. Existing Indexed documents remain searchable through refresh/restart. AI test campaign copies do not automatically grant access to the original campaign's document library.

Use **Search sourcebooks** and optional category/title filters, then **Search indexed content**. FTS5 ranks matching passages and handles punctuation and multiword terms safely. Each result includes the actual uploaded title and **physical PDF page** (cover = PDF p. 1). **Read surrounding context** expands neighboring chunks, including their page references. These are PDF indices, not inferred printed page numbers. Extraction preserves page order and line breaks where possible, but complex tables, columns, lists and unusual fonts can lose layout; verify the PDF when precision matters. Search is local and makes no AI or embedding calls.

### Storage and database

The maintained dependency **`pdfjs-dist` 6.5.438** (Mozilla PDF.js, plus its locked transitive/optional packages) handles server-side text extraction. A separate Node process reads the PDF locally, page by page, without rendering or executing PDF actions. It has a three-minute timeout, a 384 MB JavaScript heap limit, and caps of 2,000 pages, 200,000 extracted characters per page and 30 million characters per document. The upload request streams to a temporary file, enforces the byte limit even without Content-Length, checks PDF header/trailer and hashes the file; full PDF parsing validates its structure before it becomes Indexed. Extraction failures never publish partially indexed passages to search.

PDFs are stored under `data/sourcebooks/` by default, next to the configured SQLite database, with generated UUID filenames and private file permissions. This is outside `public/`, ignored by Git through the existing `data/` rule, and survives application restarts on this development workspace. No public PDF download endpoint is provided. Original filenames are display metadata only; paths, traversal and symlinked document files are rejected. `SourcebookStorage` abstracts streaming writes, local extraction staging and deletion so a future cloud-object adapter can replace local disk. Cloud storage is not implemented. Use a durable mounted directory for another hosting environment; stateless/ephemeral deployments are not suitable.

Optional server configuration (also documented in `.env.example`):

```dotenv
# Default is sourcebooks/ beside RAVENLAND_DB_PATH. Must be outside public/.
# RAVENLAND_SOURCEBOOK_DIR=/absolute/persistent/private/sourcebooks
RAVENLAND_SOURCEBOOK_MAX_MB=64
RAVENLAND_RULES_MAX_CHUNKS=4
RAVENLAND_RULES_TOKEN_BUDGET=3000
```

Upload size is configurable within 1–256 MB. Retrieval allows 1–6 chunks and an estimated 500–4,000-token budget. Keep a custom storage directory outside version control. Back up **both SQLite and the private sourcebook directory** together; player campaign JSON backups intentionally contain neither private library metadata nor PDF text/files. No source PDFs or extracted copyrighted material are committed to Git.

Migration **011_sourcebook_library.sql** adds `source_documents` (campaign-scoped metadata, content hash, portable storage key, classification, progress, status/error and revision), `source_chunks` (IDs, sequence, text, optional heading and physical start/end pages), and the FTS5 `source_search` index. Insert/update/delete triggers synchronize FTS; deleting a document cascades through chunks and index entries. Reindex replaces chunks rather than duplicating them. It never updates existing campaign snapshots, approved memories, recaps, AI instruction settings, geography or character sheets. Use `npm run db:migrate` or normal app startup. FTS5 is required; the migrator reports a clear requirement if the SQLite runtime lacks it. The supported Node 24 runtime includes FTS5.

### AI retrieval and security

The existing chat request pipeline detects likely rules questions locally, searches authorized passages with SQLite FTS5, ranks matches, applies a minimum keyword-coverage check, skips adjacent overlapping chunks, and applies the configured chunk/token budget. Chunks remain within a physical page, target about 2,400 characters with roughly 220-character overlap, and prefer line/word boundaries. Retrieved passages carry document/chunk IDs, title and page indices. Whole PDFs are never sent to OpenAI. No model call is added for classification or search.

**Automatic player-facing retrieval uses only Indexed documents explicitly classified Public Rules in Rules, Bestiary or House Rules.** GM Only documents and all Adventure, Campaign Reference and Other documents are excluded at the database query boundary, even if the request includes the GM token or asks for hidden text. Public Rules applies to the entire uploaded file, so only classify a file public when all of its contents are suitable for players. Adventure-internal retrieval and secrecy rules are deferred to Phase 6B.2.

Protected application instructions, private editable GM behavior, campaign state/approved memory, sourcebook reference passages, history and the player message remain separate. Source text is untrusted reference data, cannot override instructions or authorize mechanical actions, and is not an automatic source of campaign canon. Existing memory evidence/review requirements remain in force. Recap and quarter-day requests do not automatically retrieve rules in this phase. If a likely rules question has no sufficiently matching authorized passage, an application-labeled uncertainty answer is saved with no official citation and no paid call; it explicitly identifies any table ruling as provisional. Other narrative chat and approved-memory recall continue through their existing paths.

AI replies attach **server-selected structured reference metadata** for retrieved passages, displayed under the normal chat reply as `Source: <actual title>, PDF p. <physical page>`. The model is instructed to ground its rules explanation and cite only these sources. These metadata identify retrieved references, not a proof that every sentence is supported. Model-generated prose is still fallible. Saved request context previews recheck current public visibility before returning raw passages if a document is subsequently made private or deleted; already published public chat is historical information and is not erased by changing classification.

All management, list, unrestricted search and surrounding-context operations use **`/api/sourcebooks`**, require `x-ravenland-gm-token` on every request, and return private/no-store responses. Upload, reindex, classify and confirmed deletion are server-authorized. JSON mutations and raw streaming uploads validate same-origin requests. The token uses existing `RAVENLAND_GM_REVIEW_TOKEN` (at least 24 characters); it is not stored in browser localStorage. Locking or closing Settings clears the library view. This remains a development gate, not multiplayer authentication.

Retrieved-context use, chunk count and approximate tokens are saved with the request/reply and displayed with references. The token estimate uses UTF-8 byte length divided by three plus a per-passage allowance; it is deliberately approximate, not model-tokenizer accounting or measured savings. Existing OpenAI usage/cost tracking records actual API token counts normally. Longer passages add input-token cost to that one existing request. Unknown rules can be answered by the deterministic guard without an API call; searches, indexing and library administration make no paid calls.

### Verification and manual checks

```bash
npm test
npm run typecheck
npm run build
npm run test:sourcebooks
npm run test:ai
npm run test:ai-instructions
npm run test:persistence
npm run test:quarter
npm run test:dice-repair
```

Tests use original synthetic PDFs, temporary databases/private storage, and a test-only fake official-SDK transport. They cover multi-page upload/extraction and physical citations; all example search terms; malformed/blank/OCR/oversize/path handling; authorization on library operations; cross-campaign, category and visibility restrictions; context budgets; failed-document retry; duplicate-free reindex; cascading file/chunk/search deletion; restart persistence; one-request AI retrieval and unknown-rule uncertainty; and existing AI, instructions, memory, recap, campaign, character/dice and quarter-day features. No paid API calls or live campaign-memory changes are required. No lint script is configured.

For a manual check, run `npm run dev`, unlock the library and upload a small text-based PDF as GM Only. Search a known term and confirm PDF page indices against the file. Ask a rules question in the main chat: the private file must not be used. Explicitly classify an appropriate Rules document as Public Rules, ask again and inspect references/context-token estimate. With OpenAI enabled, this second question uses one normal metered request. Try an unknown rule, refresh and restart the server, reindex, then cancel and confirm deletion. Confirm the prior campaign, editable GM instructions, approved Orvik memory and session recaps are still present.

Known limits: local keyword intent/relevance heuristics can miss paraphrases or match irrelevant material; no semantic retrieval, embeddings or OCR. PDF layout extraction is imperfect. Model grounding still needs verification. Interrupted uploads can leave an unreferenced `.tmp` file after a hard process kill; partial indexing is never searched, and interrupted processing can be retried. This local Node implementation is not a durable distributed job queue. Phase 6B.2 adventure access, Phase 6B.3 retrieval improvements, autonomous mechanics and multiplayer hosting are not implemented.

Implementation files: `src/lib/sourcebooks/schema.ts`; `src/server/sourcebooks/{storage,extract,library,retrieval}.ts`; `scripts/extract-sourcebook.mjs`; migration 011; `src/app/api/sourcebooks/route.ts`; `src/components/sourcebook-library.tsx` mounted in the existing Settings panel and styled in `globals.css`; AI request, reply-reference and saved-context integration in `service.ts`, `instructions-v1.ts`, `schema.ts`, `ai-reply-actions.tsx`, and the context endpoint; the SQLite migrator's FTS5 diagnostic; environment/package/lock configuration; and focused sourcebook unit/browser tests, synthetic PDF generator and SDK fixture updates. Existing migration-count tests now expect eleven migrations.

## Phase 6B.1a: Structured Rules Compendium and player Rules Library

**Rules Library** now appears immediately left of **Campaign Settings** in the main navigation, using the existing companion dialog. Ordinary players can open it without a GM token, search published rules, choose topic/source filters, read complete curated documents, and return to their previous chat with **Close panel**. Curated results retain their document/section link; PDF results open one bounded original passage with its physical PDF page. No new PDF viewer or separate application was introduced.

The topic filter includes All Rules, Core Mechanics, Combat, Injuries & Recovery, Journeys, Survival, Magic, Talents, Equipment & Crafting, House Rules and Other. Source filters are All Sources, Curated Rules (including curated house rules), Sourcebook PDFs, and House Rules. Keyword matches use FTS5; quoted phrases are supported for curated entries. Title/topic matches receive additional ranking weight. With an empty query the library browses visible curated sections; enter a query to include PDF passages. Existing PDFs do not have structured topic metadata: they appear under All Rules/Other, except PDFs already categorized House Rules, which appear under that topic. No PDF topic or geographic information is invented.

### Administrator workflow

Open **Campaign Settings → Sourcebook Library**, unlock with the existing development GM token, and scroll to **Rules Compendium** beneath PDF management. PDF upload/search/classification/reindex/deletion controls remain in place.

1. Choose **Create New Rule** or **Paste Text**. Enter a title, topic, Official Rules Summary or House Rule, visibility, optional source reference, and body. New entries default **GM Only**. The body supports Markdown or plain text, up to 160,000 characters, without trimming the original Markdown source.
2. **Upload File** imports `.md`/`.txt` into the editor only. Server validation requires a supported extension/content type, valid UTF-8, readable nonbinary text, at most 1 MB uploaded bytes and 160,000 decoded characters. Review the imported text/classification; nothing is saved or published until **Save Rule**. Imports start GM Only even when replacing the editor's previous selection.
3. Use **Show Markdown Preview** for headings, lists, paragraphs, emphasis, tables, blockquotes, code and other GitHub-flavored Markdown. Added dependencies are `react-markdown` 10.1 and `remark-gfm` 4. Raw HTML is skipped, images are disabled, unsafe link protocols are sanitized and external links use noreferrer/noopener. Pasted/uploaded content cannot execute scripts. The source remains unchanged in SQLite.
4. **Save Rule** atomically persists and updates the index. Click a saved title to edit it. Last-modified time uses America/Chicago. **Reindex Rule** explicitly rebuilds sections; **Delete Rule** requires confirmation and removes the document, sections and FTS entries. Search/filter controls list both public and private entries only in this authenticated administrator view.
5. Unsaved edits are marked. Closing the dialog, Escape/backdrop dismissal, locking Sourcebook Library, selecting another rule, importing, creating another rule and campaign-library navigation ask before discarding a dirty rule draft; full-page navigation/refresh uses the browser's unsaved-change warning. **Revert Rule Edits** returns to the loaded version. Concurrent saves/deletes check the revision and preserve a stale editor's unsaved draft on conflict. **Reload Saved Rule** explicitly retrieves the newer version.

There is no full revision history or automatic draft storage. Save before closing/restarting. Campaign JSON exports do not contain private compendium records; the SQLite backup contains them. AI test campaign copies do not automatically inherit the original campaign's compendium.

### Storage, sections and permissions

Migration **012_rules_compendium.sql** is additive. It creates `curated_rules` (campaign ID, title, topic, type, visibility, complete Markdown body, source reference, explicit override scope, created/updated times, revision), `curated_rule_sections` (stable document link, ordered section IDs, heading/text and indexed metadata), and the FTS5 `curated_rule_search` virtual table. Title, topic, section body and source reference are indexed. Insert/update/delete triggers maintain FTS; create/save/reindex are transactional, and deletion cascades. Sections prefer Markdown heading boundaries, retain lists/tables and recognize fenced code; exceptionally long sections split at paragraph/line boundaries with a 6,000-character cap. No PDF files, existing sourcebook metadata/chunks, campaign snapshots, GM Memory, editable AI instruction records or recaps are rewritten by this migration.

`/api/compendium` requires the existing `x-ravenland-gm-token` for **every** read, import and mutation. Responses are private/no-store, mutation schemas are strict, and same-origin checks apply. Import is a preview-only operation, not a save. Lists omit full bodies; selecting a rule retrieves its complete source. The interface uses the existing Sourcebook Library unlock rather than asking for a second token.

`GET /api/rules` is the player endpoint. It queries only **Player Visible** curated records and existing **Public Rules** PDFs in eligible categories. Direct document/section reads enforce campaign and visibility constraints in the query; a private or foreign-campaign ID returns not found. Supplying an admin token or an arbitrary scope parameter does not elevate this player endpoint. It never queries GM Memory, private AI instructions or adventure secrets. Management permissions remain the local development gate, not full multiplayer identity.

### AI retrieval and house rules

The existing local rules-question workflow now searches both eligible curated sections and PDF chunks. There is still no extra AI classification/summarization call and no embeddings service. It reuses the existing request/reply diagnostics, approximate retrieval-token budget, maximum-chunk settings and actual OpenAI usage tracking.

Relevant House Rules are considered first, then curated Official Rules Summaries, then original PDFs for verification. Candidate ordering gives the leading house rule, leading official summary and leading PDF an opportunity to fit before additional sections, subject to relevance checks and the existing budget. Large passages can be skipped when they do not fit; not every available source is necessarily sent. Sourcebook text remains untrusted data, not behavioral instructions or campaign canon.

For a deliberate house-rule override, select **House Rule** and fill **Explicitly overrides official rules for** with the affected mechanic/procedure, e.g. `Pushing a Roll`. Leave it blank for a supplement. Only player-visible house rules enter ordinary gameplay retrieval. The server includes the scope and an `overrideApplicable` keyword-match hint for the current question; unrelated scopes are not marked applicable. The AI is directed to use a house rule only for its applicable mechanic and label it campaign-specific. This is reference priority for an explanation, not automatic rule execution.

Curated Official Rules Summaries are interpretation aids, **not automatic official overrides**. Protected instructions direct the AI to identify conflicts or uncertainty against original PDF evidence unless an applicable explicit house rule resolves them. Conflict recognition and semantic applicability still depend on the model/manual review; this phase does not implement a semantic contradiction engine or a deterministic interpreter for arbitrary rule prose.

Each retrieved item carries its source type, document title, ID, section/chunk ID, topic/type where applicable and available attribution. Curated citations have **null physical pages**; their optional administrator-supplied source reference is not represented as a verified PDF citation. UI reference labels distinguish Campaign House Rule, Curated Official Rules Summary and original PDF pages. Page numbers are generated only from actual PDF chunk metadata. Private, deleted and edited-away curated sections are removed from new retrieval and from public raw saved-context previews. Previously published chat remains historical information, as with the PDF library.

No automated dice, combat, journey, character-state or canon changes are introduced. Campaign state and approved memories retain their existing authority; editable GM behavior is still loaded independently for each relevant model request.

### Verification

```bash
npm test
npm run typecheck
npm run build
npm run test:compendium
npm run test:sourcebooks
npm run test:ai
npm run test:ai-instructions
npm run test:persistence
npm run test:quarter
npm run test:dice-repair
```

Focused tests use original synthetic rule text, PDFs and temporary SQLite stores. They verify curated creation/edit/delete/reindex, Markdown preservation, section boundaries and title ranking, private and cross-campaign direct reads, public filters, priority and applicability metadata, null curated page references, unchanged mechanical state, idempotent AI requests, and a migration fixture with three preexisting PDF documents/chunks/classifications preserved byte-for-byte. The browser suite verifies navigation placement, paste/save, reviewed Markdown import, invalid extension/UTF-8/binary/size rejection, formatted full readers, script/image/unsafe-link handling, revision conflicts preserving drafts, dirty-close/lock guards, restart persistence, deletion confirmation, mobile layout, and curated/house-rule use by inspecting actual official-SDK request payloads through a test-only fake transport. It deletes its synthetic house override after testing. No paid API calls, live house rules or live GM Memory edits are needed. Existing PDF, AI/recap/memory, instructions, campaign, journey and dice browser suites remain regression checks. No lint script is configured.

Manual check: launch `npm run dev`, create a synthetic “Pushing a Roll” summary in the administrator compendium, preview it, save as Player Visible, close Settings, and search/read it through Rules Library. Import a UTF-8 text file and verify it is unsaved/private until reviewed and saved. Edit a unique phrase and search again; refresh/restart to confirm persistence. Ask a relevant AI question and inspect the saved request's `rules.passages` source type, source IDs, references and token estimate. Add a clearly labeled temporary, published House Rule with an explicit matching override scope, verify its priority and campaign-specific label, then delete it. Confirm GM-only entries cannot be found/opened through `/api/rules`. Check existing PDF searches and approved campaign memory normally. Live model requests, if enabled, are metered as usual; deterministic SDK fixtures do not guarantee a live model's grounding quality.

Implementation: `src/lib/compendium/schema.ts`; `src/server/compendium/{store,search}.ts`; migration 012; administrator `/api/compendium` and player `/api/rules`; `rules-compendium.tsx`, `rules-library.tsx`, `rule-markdown.tsx` and the shared `rule-draft-guard.ts`; their integration in existing campaign navigation, panel routing, Sourcebook Library and styles; shared source/citation types, safe FTS phrase handling and existing AI retrieval/reference rendering; protected source instructions; package/lock updates and focused tests/SDK fixtures. No new environment variables are required.

Remaining limits: bounded search result lists (no pagination), keyword-based relevance/override applicability, approximate context tokens, no semantic search or guaranteed conflict detection, and no automatic verification of free-text administrator source references. Very large sections/tables may cross retrieval chunks even though the reader retains the full Markdown document. PDF topic metadata is unchanged. Raw HTML and images are intentionally not rendered. Adventure-secret retrieval, autonomous mechanics and multiplayer permissions remain out of scope.

## AI GM request diagnostics and long procedural questions

A reproducible application bug was identified: chat actions accept up to **3,000 characters**, but the curated and PDF search schemas accept **400**. Previously, rules retrieval passed the entire action directly to both searches. A longer procedural question could therefore throw a local validation exception **before OpenAI was called**, which the service reported as a generic connectivity/model error. The automated test reproduces this contract mismatch directly against the search stores. The workspace did not contain the user's original failed-request database/logs, so this establishes a concrete matching failure mode, not proof of the exact cause of every historical failure.

`rulesSearchQuery()` now derives a safe keyword query within the existing 400-character local search limit for long actions. Short search queries keep their previous behavior, and the **complete original question remains unchanged in the OpenAI prompt**. Search still uses the existing relevance, visibility and retrieval budgets. The model, protected/editable instructions, approved memory, context selection, 90-second default timeout (configurable up to 120 seconds), response-token default/cap and manual retry policy are unchanged. No schema migration or new dependencies are required.

Every validated GM turn emits one structured JSON completion/error/replay record to server stdout with `event: "ravenland.ai.request"`. It includes:

- Application `requestId` and attempt number, requested model, outcome and failure stage.
- Total service duration, retrieval/context-assembly duration, API duration and response-processing duration in milliseconds.
- Retrieved passage count and estimated retrieval tokens.
- Estimated total input tokens when the official provider has constructed the request (UTF-8 bytes/3 over the request envelope, including the output schema; approximate, not tokenizer accounting).
- Response status or safe error category, upstream HTTP status when available, output-character count and recognized incomplete-response reason.
- Configured timeout, configured output-token budget and whether the request timed out.

Stages distinguish claim/replay, retrieval, prompt construction, API execution, response processing and persistence. Tiny Test Connection requests also receive correlated completion/error diagnostics. No log record includes the action text, full prompts, instructions, retrieved passages, GM-only documents, API keys, upstream error bodies or stack traces. Model identifiers that resemble API credentials are masked. Usage/cost tracking continues to use actual API usage when returned, including incomplete/invalid responses; estimates and unknown token counts remain labeled as such.

The normal chat error now includes **Request ID: UUID**, and the streamed response also carries that ID in `X-Request-ID`. The frontend retains it for transport/interrupted-response errors too. Safe categories distinguish timeout, rate limit, credentials/model configuration, input-context limit, temporary upstream failure, retrieval failure, output-token limit, invalid/incomplete response and unexpected server error. Check server logs by this identifier; the existing Settings request-recovery view retains saved error codes and retryable actions. For local troubleshooting you can capture the server terminal output, then search its JSON lines for the displayed request ID. Diagnostics cannot reconstruct old failures that were never logged, and a hard process/host termination can prevent a final record from being emitted.

SDK abort errors and deadlines are recognized explicitly, including a stream that ends silently after abort. Incomplete output caused by `max_output_tokens` receives a specific output-limit error instead of suggesting connectivity failure. Malformed/invalid responses never publish a GM message, memory proposal or recap. SQLite retrieval failures are separated from API errors. Failure-recording errors are flagged without masking the original failure category. The application continues to retain the queued **player message and request/error/usage metadata** for recovery; failed requests do not apply mechanical state, GM memories or partial GM narration. Successful responses and memory proposals remain subject to their existing validation/transaction rules.

**Retry GM response** reuses the saved request ID. A transient failure can be retried explicitly without duplicating the queued player message; completed requests replay their saved result without another model call. There are no new hidden automatic API retries. A manually retried failed upstream call can incur normal API usage. If diagnostics actually show an output limit, an administrator may adjust `OPENAI_MAX_OUTPUT_TOKENS` within the existing bounds, or request a shorter answer. If they show timeout, review `OPENAI_TIMEOUT_MS` and hosting limits. Do not change model/context simply on the assumption that question length caused an upstream failure.

Verification commands:

```bash
npm test
npm run typecheck
npm run build
npm run test:ai-diagnostics
npm run test:ai
npm run test:sourcebooks
npm run test:compendium
npm run test:ai-instructions
npm run test:persistence
npm run test:quarter
npm run test:dice-repair
```

Focused tests cover ordinary conversation, short rules questions, journey/melee procedure questions over 400 characters, complete-question preservation, bounded retrieval, correlated safe logs, simulated official-SDK timeout, upstream 503 and successful same-ID retry/replay, SQLite retrieval failure, output-token exhaustion, invalid output, privacy and unchanged mechanics/canon. Browser tests verify the user-visible categories/identifiers and log correlation through the real application, with the official SDK using a test-only fake transport. These are not paid live-model quality tests. Existing suites cover approved GM Memory, recaps, editable instructions, PDF/curated retrieval, persistence, journey and dice workflows. No lint script is configured.

The unrelated sheet adjustment alphabetizes the existing sixteen skills in both the standalone source and generated integrated sheet, beginning with **Animal Handling (EMP)**. IDs, governing attributes and saved values are unchanged. The dice browser regression checks the rendered alphabetical order and continues to test skill staging/pushing, damage/Willpower and persistence.

Changed implementation: `src/server/sourcebooks/retrieval.ts`; new `src/server/ai/diagnostics.ts`; AI config/error mapping, provider and service; `/api/gm`, shared HTTP/stream-event types and the existing GM hook; root `index.html` and generated sheet field/version modules; focused diagnostics unit/browser tests, SDK fixture and the dice browser assertion. The package script adds `test:ai-diagnostics`. Existing sourcebook files, campaign data, protected instruction text and editable instruction records are not reset or reseeded.

## Phase 6B.1b: rules interpretation, related retrieval and persistent windows

This phase refines the existing library and GM pipeline. It does not add a combat/dice/journey execution engine, paid search, new model, new API call, or sourcebook ingestion requirement. The recent **3,000-character chat / 400-character local search** fix remains: the complete question goes into the prompt and only the local search query is bounded.

### Heading-aware indexing and automatic upgrade

Migration **013_heading_aware_rules.sql** adds derived section metadata: parent `heading_path`, `section_order`, `chunk_order`, original `start_offset`/`end_offset`, and locally inferred `mechanical_topics`. Document ID, title, topic, source reference and section text remain in the section index; document type and current visibility are joined from the source record on every read. The FTS5 index now indexes parent-heading context as well as title/topic/body/reference.

The existing SQLite migrator calls the same shared TypeScript indexer used by Save/Reindex **inside the migration transaction**, before writing the migration ledger entry. It automatically reindexes every existing curated document once, including private entries. No reupload, manual splitting or reorganization is required. The replacement external-content FTS index is seeded before old derived sections are removed so delete triggers remain consistent during backfill. A failed migration rolls back; the ledger entry is not recorded until indexing succeeds. Normal startup, `npm run db:migrate`, and `npm run dev` all use this migrator. Do not apply only the raw SQL in an unrelated migration runner and omit the TypeScript backfill hook.

Original `curated_rules` rows are not updated by reindexing: Markdown/plain text, CRLF/whitespace, titles, timestamps/revisions, topics, visibility, house-rule type/scope and references remain intact. PDF files, metadata, chunks and indexes, approved memory, campaign state and private editable GM instructions are untouched. New section IDs are derived-index references; historical published chat is retained, and old raw-context previews continue to redact sections no longer present/currently public. A complete backup is still the SQLite database plus private sourcebook/image storage.

The indexer recognizes ATX heading levels `#` through `######`, maintains a level-aware parent stack (including skipped levels), retains preface/unheaded text, and ignores headings inside fenced code. Heading-only containers provide context rather than wasting a retrieval slot. Sections keep their original source slices and offsets. Paragraphs, list runs, tables and code blocks stay together when practical. Oversized sections use a 6,000-character cap with modest overlap; splitting prefers paragraph/line and complete-block boundaries. A procedure larger than the hard bound may still span chunks. The reader always renders the unchanged full document.

### Topics, procedures, ranking and authority

`src/lib/rules/topics.ts` defines a small local vocabulary and associations, not official mechanical formulas. It recognizes dice mechanics, combat actions, initiative, melee/ranged attacks, defensive reactions, damage, armor, Broken/critical injuries, recovery, journeys, quarter-days, navigation/watch, camp/survival, foraging, hunting/fishing, mishaps, magic, talents and equipment/crafting. Leaf headings are preferred for section classification; parent headings, body, title and document topic provide context/fallback.

Related procedure maps connect melee/ranged attacks to action availability, defense, damage and armor; journeys to quarter-day activities, navigation/watch, camp and mishaps; magic to dice/mishaps; Broken/injuries to recovery. These associations retrieve supporting sources without encoding rule constants, automatically resolving mechanics or making a classification API call. Candidate acquisition combines bounded FTS searches and a bounded, player-visible metadata query for associated curated sections, so a related armor/defense section can be found even when the question does not contain its exact words.

Ranking considers exact titles, heading-path words, title/body words, direct/related mechanical topics, source type, scoped house-rule applicability and FTS candidate order. Topic diversity favors distinct relevant steps rather than multiple chunks covering the same topic. Ties use stable source/section order. A clearly magic-specific document/section is excluded from an ordinary nonmagical melee query. Other relevance filtering prevents sources with no topic or meaningful heading/title relationship from occupying slots solely through a common body word. This remains a deterministic heuristic, not semantic understanding.

Identical and substantially overlapping material is removed where safe, while distinct sections from one document remain eligible. Offset overlap and text shingles detect redundancy. Different source-authority tiers are retained for verification rather than deduplicating away the original PDF. Different numeric/negation qualifiers and different section headings make deduplication more conservative to avoid hiding important exceptions/conflicts. Default maximum chunks and approximate context-token budgets are unchanged; a bounded result may omit steps, and the GM must identify insufficient source coverage instead of inventing details.

An applicable, explicitly scoped, **player-visible House Rule** receives an explicit priority tier before other sources. If potentially applicable override material cannot fit the bounded selection, the context flags the omission and directs clarification rather than silently defaulting to an official mechanic. It remains a campaign-specific override. A curated Official Rules Summary remains an interpretation aid; original PDFs remain the published-rule verification source. Conflicts require uncertainty/identification unless an applicable house rule resolves them. Physical PDF pages come only from PDF metadata. Curated source references remain administrator attribution with no invented physical page numbers.

### Interpretation safeguards

The protected application policy now adds targeted requirements without replacing saved editable instructions:

- Use retrieved Forbidden Lands procedures rather than generic RPG assumptions. Ask for missing attributes, skill ratings, bonuses, armor, talents or dice results; do not infer them from profession or invent example results as actual rolls.
- Distinguish a declared, proposed and completed action. Follow source-supported fast/slow action availability and defensive-reaction timing, compare successes according to sources, and distinguish weapon damage calculations from dice rolls and armor resolution from flat reduction assumptions.
- Use attribute damage and Broken terminology. Identify applicable talents/exceptions and missing source support. No guessed numerical constants are added.
- For a complete procedure, explain the relevant state/actions, declaration, defense timing, pools/modifiers, success comparison, damage, armor and consequences in the source-supported order. This framework is not an official rule or a substitute for the retrieved details.

Locally recognized hypothetical/procedural explanations carry `explanationOnly`/`procedureRequested` flags in the request context. The GM is instructed to return no actions or memories for an explanation; the server also drops generated action/memory proposals in that mode. The queued question and answer still persist normally, but hypothetical examples cannot trigger the existing quarter-day proposal controls or add campaign-memory proposals. Actual submitted quarter-day workflows retain their existing validation/confirmation path.

These are retrieval, prompt and application-boundary improvements. They do **not** prove that a live model will correctly interpret every opposed roll or exception. Reference citations alone do not establish mechanical correctness. Live table verification remains necessary.

### Authorized diagnostics

In **Settings → Sourcebook Library → Rules Compendium**, expand **Rules retrieval diagnostics**, enter a rules question and choose **Inspect rules retrieval**. This makes a local authorized query only, not an OpenAI request. `GET /api/rules/diagnostics` requires the existing development GM token on every request and returns private/no-store metadata: selected public document titles/IDs, source types, heading paths, physical PDF pages or administrator references, section count, estimated tokens/budget, selected topics, related-procedure use, overlap removals and applicable-house-rule status. It returns no passage bodies, private AI reasoning or hidden documents. Player-facing queries and AI retrieval remain restricted before assembly to Player Visible curated rules and eligible Public Rules PDFs. Ordinary raw-context previews redact the selection-diagnostics block and recheck source visibility. Existing request IDs, stage/timing diagnostics, usage/error tracking, long-question fix and retry behavior are preserved.

### Persistent application windows

The shared companion dialog (Journal, Rules Library, Campaign Settings, Map, character sheets and comparable tool panels) and nested portrait chooser now ignore **backdrop/outside clicks and Escape**. Underlying content remains inert through the native modal dialog. Clicking inside still operates normal controls. Use the visible, labeled **X/Close** or another explicit close action. The portrait chooser now also has a labeled X.

The policy is applied through native `closedBy="none"`, a shared dialog cancel-handler fallback, and removal of light-dismiss click handlers, not a global Escape listener. Native selects, transient sidebar/menu controls, tooltips and JavaScript confirmation dialogs keep their normal behavior. Native dialog semantics/focus trapping remain intact; the companion restores focus to its opener and close controls remain keyboard-accessible. A standalone browser character window retains its own browser close control.

An aggregated draft-close guard gives one confirmation for meaningful unsaved edits when explicitly closing/locking/navigating away. It covers journal entries, campaign/journey settings, curated rules, sourcebook classification/upload drafts, GM instruction edits, GM memory edits, recaps, discovery and image-upload drafts. Portrait selection uses a local explicit-close confirmation. Backdrop/Escape do not attempt dismissal, discard data or prompt unnecessarily. Unchanged/saved editors close without a draft warning. Browser refresh/navigation retains the browser's existing unsaved-change protection. The journal Notes field has an explicit accessible label so its name remains stable while the controlled textarea contains text.

### Verification and manual checks

```bash
npm test
npm run typecheck
npm run build
npm run test:rules-windows
npm run test:compendium
npm run test:sourcebooks
npm run test:ai-diagnostics
npm run test:ai
npm run test:ai-instructions
npm run test:persistence
npm run test:dice-repair
npm run test:portraits
npm run test:quarter
npm run test:fog
npm run test:locations
npm run test:map:real
```

Focused tests cover heading paths/source offsets/order/fences, complete lists/tables where bounded, skipped heading levels, unheaded/oversized sections, automatic upgrade of an old private Markdown source with unchanged content/metadata, repeat-start idempotency, related combat/journey/recovery retrieval, distinct sections, overlap removal, unrelated spell exclusion, numeric/authority preservation, privacy, house rules, long questions, missing-stat/no-invented-roll policy wiring, and server rejection of hypothetical action proposals. A three-PDF migration fixture continues to assert unchanged PDF rows/chunks/classifications.

The new browser suite checks desktop/mobile Journal/Settings/Rules/character/portrait windows against outside/backdrop/Escape dismissal, explicit keyboard close/focus restoration, draft preservation and confirmed discard, ordinary select interaction, authenticated safe diagnostics, original Markdown reading and actual SDK request metadata/policy wiring. Existing suites cover compendium editing/imports, PDFs, request errors/retries, approved memory/recaps, character dice, persistence, journeys and fog/discoveries. Regression tests that previously used Escape as their close shortcut now use the explicit Close button to match the new policy. No lint script is configured.

All rule fixtures are original synthetic material and model calls use the official SDK with a test-only fake transport. No paid/live-model mechanical-accuracy claim follows from these tests. Manually verify representative attacks and journey procedures against your uploaded official rules, including missing ratings, defensive timing, success handling, weapon damage and armor, before relying on a live answer.

Manual preview: run `npm run dev`; existing curated entries are automatically reindexed during the safe startup migration. Inspect an admin diagnostic query for a melee procedure and confirm relevant heading paths and absence of unrelated/private spell material. Check an associated journey query and a scoped house rule. Open Journal, type a draft, click outside/press Escape and confirm it remains; X must warn before discarding. Save an entry and close/reopen normally. Repeat Settings/Rules/character/portrait cases on desktop and a narrow viewport. Confirm existing PDF searches, approved campaign facts and character rolls still behave normally.

Implementation files: `src/lib/rules/topics.ts`; shared `src/server/compendium/indexer.ts`; migration 013 and the migrator hook; compendium metadata/search/types; `sourcebooks/selection.ts` and refined retrieval/citation types; protected interpretation policy and explanation-only service guard; the authorized diagnostics route/component; shared persistent-dialog and aggregated draft guards; affected dialog/editor components; focused rules/window tests and existing regression updates. No new dependency, secret or environment variable is required.

Remaining limits: keyword/topic inference can miss synonyms or misclassify mixed sections, deduplication is conservative, context tokens are approximate and bounded retrieval can omit necessary steps. No OCR, semantic embedding service, exhaustive mechanical interpreter, automatic rules-conflict adjudication, adventure-secret retrieval or multiplayer authentication is introduced. Very large list/table/code blocks can still exceed a chunk boundary. Reindexing is transactional and synchronous at upgrade, so large libraries may increase the first startup time.

## Multi-procedure compendium retrieval diagnostic and fix

The reported comparison was reproducible with synthetic sources: without a question mark, `Compare …` skipped rules retrieval; with one, four broad PDFs displaced all three dedicated curated procedures. Hunting and Fishing also shared one retrieval topic, and topic diversity was only a ranking bonus. These are demonstrated pipeline defects, not evidence that the eight live documents are missing. The live campaign database was not attached to this checkout, so their actual presence could not be inspected here.

Create/update/delete already synchronize curated sections and FTS transactionally. This change adds **no migration**, changes no source documents, and does not write campaign state during retrieval. Dedicated subject searches now complement the existing bounded query. Selection covers each requested major subject with a relevant titled/headed curated procedure before filling with supporting PDFs. Hunting/Fishing are separate topics; existing Fishing metadata is interpreted compatibly without requiring a reindex. Applicable explicit house overrides still precede official sources; PDFs remain verification sources and conflicts must be disclosed. Topic matching generalizes to combat, magic, conditions and equipment; no document titles are hardcoded. Existing section/token limits remain in force, and missing/limited subject coverage is disclosed instead of silently claiming a complete procedure.

Protected mechanical-answer instructions require source-supported skill names, ordered checks, modifiers, success/failure/mishap branches and separate resource outcomes. They prohibit guessing absent steps and do not change storytelling personality or introduce game mechanics.

To inspect your existing documents:

1. Run `npm run dev`, open your campaign, then **Campaign Settings → Sourcebook Library** and unlock with your configured administrator token.
2. Expand **Rules retrieval diagnostics** and enter: `Compare the official Forbidden Lands procedures for Foraging, Hunting, and Fishing, including their skill rolls, mishap triggers, and resource outcomes.`
3. Optionally enter an exact document title, e.g. `Fishing — Official Procedure`, and select **Inspect rules retrieval**. Check `coverage`, selected sections, `audit.curatedDocuments`, per-candidate omission reasons and `audit.index`. Repeat the title check for the other seven documents. `indexed` means derived sections have FTS postings and a title search matches; title/heading/body CRUD search is covered by tests. Empty exact-title results mean no matching *player-visible* record was found, not proof of a hidden record.
4. If an existing visible source has missing/incomplete search data, choose **Rebuild curated search index** and confirm. This regenerates derived sections for the selected campaign and restores the shared FTS postings transactionally. Original content, IDs, revisions, timestamps, visibility and campaign state are unchanged. It is an explicit administrator repair, not an automatic rewrite on every read. The confirmed command is `POST /api/compendium` with `type: "repair-index"`, `campaignId` and `confirmed: true`, using the existing GM review header. Other campaigns' source documents/sections are not rewritten.
5. Ask the same comparison in AI GM chat. Expect separate Foraging/Hunting/Fishing references, plus a supporting PDF when available and within budget. Check the answer against your actual rules: correct supplied skill names, all required checks in order, water/food distinctions, failure versus mishap triggers, and no unsupported seasonal modifiers. A missing procedure must be acknowledged. This manual check uses your configured API and can incur its normal cost; the diagnostic itself makes no model call.

Diagnostics return metadata only, require administrator authorization on every call, and omit GM-only/foreign sources, passage bodies and private prompts. Candidate output is capped at 100, index inspection at 200 visible documents (an exact-title check avoids broad-list truncation). Ordinary player snapshots omit the administrator audit and recheck passage visibility. This remains local keyword retrieval: headings can be ambiguous, large procedures may exceed budgets, and metadata coverage does not prove that every check/exception is present. The live model's mechanical answer accuracy has **not** been verified by the fake-provider tests.

Verification for this fix:

```bash
npm test
npm run typecheck
npm run build
npm run test:procedure-retrieval
npm run test:compendium
npm run test:sourcebooks
npm run test:ai
npm run test:ai-instructions
npm run test:ai-diagnostics
npm run test:persistence
```

The seven new automated tests cover immediate title/heading/body search, update/delete synchronization, all eight synthetic titles and three-procedure coverage against broad PDFs, supporting PDF retention, distinct-procedure preservation, legacy Fishing metadata, missing-posting/section repair without source/campaign changes, privacy and public-audit redaction, house-rule precedence, explicit bounded omissions, and generalized topics/grounding policy. The new browser test exercises authenticated diagnostics, optional exact-title health, confirmation/cancellation and validation of repair, immediate indexing, and all three curated procedures entering the official SDK request through chat. Existing compendium/PDF/AI/memory/persistence suites remain applicable. All fixtures are original synthetic content; no uploaded rules or paid AI calls are used by tests.

## Phase 6B.2 — Rules-aware retrieval planner

The existing retrieval pipeline now plans rules-reference, gameplay-adjudication, adventure-narration and general-conversation turns without another AI call. It selects character/combat/journey/magic/site/generic profiles, checks substantive source coverage, and makes at most one bounded targeted retry. Rules-only turns retain the server-side action/memory-proposal block. Site references remain party-public only and are distinguished from current approved campaign state; GM-only adventures remain excluded.

See [planner architecture, profiles, authority, limits and manual verification](docs/rules-retrieval-planner.md). In the authorized **Rules retrieval diagnostics**, inspect the compact intent/profile summary and `planner.coverage`, gaps and retries. Run `npm run test:retrieval-planner` after `npm run build` for the new browser suite; `npm test`, `npm run typecheck` and the existing retrieval/AI/persistence browser suites remain the core checks. No migration, dependency, source-document rewrite, character-sheet or dice change is required. Coverage does not guarantee mechanically correct answers.

## Rules Library organization and metadata

The player library now groups matching sections by parent document ID, preserving separate documents with identical titles. Cards show readable descriptions and normalized tags; opening a document still renders its complete Markdown. Authorized compendium editing adds primary topic, tags and short description. Metadata-only changes preserve section citation IDs and become searchable immediately.

Migration **014** adds metadata columns and a synchronized parent-document FTS index without rewriting bodies, sections, permissions or campaign state. Existing fields supply category/classification/visibility. Reviewed metadata suggestions are **preview-only until confirmed**, fill only empty values and are idempotent. Open **Campaign Settings → Sourcebook Library → Metadata suggestions and backfill** to review them.

See the [audit, metadata/search design, backfill example, changed files and manual verification](docs/rules-library-metadata.md). Run `npm run test:rules-metadata` after a production build for the new browser suite, alongside `npm test` and `npm run typecheck`. Metadata improves relevance but does not establish source authority or guarantee mechanically correct answers.

## Handbook PDF retrieval diagnostic

Reference commands (`find`, `identify`) now enter the rules-reference pipeline. Profession/skill PDF entries can be recognized from standalone body headings even when their chunk starts with a page number. Explicit official-PDF-only reference requests exclude curated summaries and bind named books only within the existing authorized source scope. Printed page requests remain separate from physical PDF citations; no pagination offset is guessed.

The local **read-only** `npm run sourcebooks:diagnose` command (with optional `--database`, `--campaign`, `--source` and `--sourcebook-dir` overrides) checks an existing registered source, file extraction/page evidence, persisted FTS searches and exact-question selection without a model call, migration or reindex. See the [investigation, evidence, changed files, tests and live audit instructions](docs/handbook-retrieval-diagnostic.md). The live handbook database/file was unavailable during development; synthetic PDF/FTS regressions do not establish its actual pagination or repair status. Run `npm run test:handbook-pdf` after a production build for the new browser test.

## Equipment facts and damage references

Weapon ratings are now explicit retrieval requirements. A general combat overview cannot establish Longbow/Heavy Crossbow statistics. Named handbook requests bind the authorized PDF even without the word “PDF”; missing facts use the existing bounded targeted retry. Supported read-only equipment questions produce cited application reference answers and arithmetic only when each required numerical input/rule is evidenced. Missing/conflicting facts, unparseable house overrides and unsupported explicit modifiers yield an unverified result. No attack is executed and no paid model call is needed for this reference path.

See [root cause, retrieved test passages, files, regression results and limits](docs/mechanical-fact-coverage.md). Run `npm run test:mechanical-facts` after a production build. To inspect the real library without changing it, run `npm run sourcebooks:diagnose -- --mode equipment` where the existing campaign database/private books reside. The live handbook was unavailable here; synthetic PDF regressions do not verify its extraction or pagination. No migration, dependency, general GM personality change or complete mechanical execution engine was added.

## Real fifth-printing PDF regression tests

The owner's actual Handbook and Gamemaster's Guide attachments have now been tested through application extraction, isolated SQLite/FTS indexing and final retrieval selection. See the [real-file results, demonstrated fixes, selected passage IDs and limitations](docs/real-sourcebook-regressions.md). This adds real-file evidence beyond the earlier synthetic-only investigations; the live campaign database remains unverified and untouched.

Keep legitimate sourcebook copies outside Git, or in the ignored private fixture directory. Follow [private fixture setup](tests/fixtures/private-sourcebooks/README.md), then run from `ravenland/`:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:real-sourcebooks
# Required pre-merge check: unit/synthetic coverage and real PDFs; missing books fail.
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

The optional real-file command explicitly skips if books are unavailable; it never substitutes synthetic PDFs. The required check fails instead. Both use disposable databases and copied files, preserve source permissions, clean up after execution, and make no external AI calls. Never commit PDFs, extracted source bodies or private database fixtures.

The [missing hit-threshold evidence repair](docs/missing-mechanical-evidence.md) combines the official general success rule with the ranged skill-roll instruction, reuses available evidence, and makes at most one bounded targeted retry if needed. The real-book regressions verify Longbow damage for three, one and zero successes, recovery of a missing initial threshold candidate, and a safe unverified answer when the rule cannot be retrieved. All numerical inputs remain cited; no attack or campaign state change is executed.

The [player-input preservation repair](docs/player-mechanical-inputs.md) keeps rolled successes separate from source hit requirements. It recognizes word/digit/sixes reports and preserves the original input. Phase 5.3 supersedes its old allocation policy: ordinary SHOOT damage automatically includes every uncanceled additional success, even if a legacy question mentions partial allocation. Missing or ambiguous attack counts still require clarification. Real-file tests now check the original request, saved context, streamed answer and final reply for 0–4 successes, the reported full question and Heavy Crossbow; existing evidence/security tests remain required. Historical saved replies stay unchanged, so send a new question to calculate with the corrected parser.

## Character awareness and advisory action preparation

The GM uses saved character values for narration and reminders. Current/maximum attributes, Broken, conditions, injury notes, talents, equipment and resource dice are read-only context. Pride, Dark Secret and Relationships are party-known background in this campaign, with explicit recorded/empty/unrecorded status; they do not automatically establish NPC knowledge. Active-character mechanics remain ownership-scoped and public diagnostics redact them.

**Trusted local play needs no player token:** run `npm run dev`, open loopback, and choose ACTING AS. The local launcher validates real loopback connections and stamps an internal proof; production and `dev:hosted` retain player-grant ownership checks. GM review and sourcebook permissions remain separate.

Normal declarations reach narration. Equipped is advisory, and missing weapon data leaves calculations unverified without blocking the scene. The separate read-only preparation endpoint and official-PDF numerical validation remain available. The canonical four-attribute/sixteen-skill registry, existing character persistence and manual dice/push controls are preserved. No dice UI or automated resource/stat changes were added.

See [local-play architecture and earlier implementation](docs/read-only-character-awareness.md) and [current background/resource/scene policy](docs/gm-situational-awareness.md). Hosted player configuration remains documented in [player access setup](docs/player-access-setup.md). Run `npm run test:character-preparation` after a production build, `npm run test:character-awareness` for the local browser flow, and the required real-PDF retrieval gate.

## Submit saved dice to the GM

Open **Recent Dice Rolls**, expand a result, push first if desired, and choose **Submit to GM**. Submission finalizes that version; the saved rolling character, faces, exact successes and recorded consequences go through the existing GM pipeline. Submitted results remain in the panel with persistent status and safe retry. **Finalize without GM** keeps the independent local-only archival operation available.

Full dice cards and push controls live in Recent Dice Rolls, while chat shows a compact reference and narration. One compatible prior action is linked; ambiguous actions prompt clarification. Ordinary SHOOT extra damage is automatic; other optional effects retain their own verified rules. Push consequences are not repeated, and no inventory, attribute, injury, condition, time or journey changes are executed. Existing local/hosted access and official PDF retrieval remain in place.

See [infrastructure, matching, duplicate prevention, tests, changed files and limitations](docs/dice-gm-submission.md). Run `npm run test:roll-gm` for the default local browser flow, plus the required real-PDF gate and existing dice/character/AI regressions.


## GM situational awareness

Saved Pride, Dark Secret and Relationships can be reported directly without a model guess; empty fields are identified as empty. These three fields are not confidential between players. Other private memories, GM-only sources and character mechanics retain their existing access controls.

The GM receives bounded current-scene context from existing campaign/chat/request records, relevant approved NPC/quest memories and Journal entries. A submitted roll uses its matched original declaration and scene; compatible recorded GM roll requests take precedence over earlier clarification-only declarations. Genuine ambiguity asks a question. Explicit zero supplies trigger an advisory shortage question, positive quantities permit proceeding, and unknown quantities stay unknown. D8 food/water remain resource dice. No automatic deductions, Pride invocation, combat resolution or canon changes were added.

From `ravenland/`, preview with `npm run dev`, choose ACTING AS, and try “What are my Pride, Dark Secret and Relationships?” Use the existing character sheet to record a resource as `0`, a positive quantity or `D8`, then declare a relevant action. Roll/push normally and use Recent Dice Rolls → Submit to GM. Mock mode remains available; model narration requires the existing optional AI configuration.

Run `npm run test:gm-situation` for the local browser regression, plus `npm run test:character-awareness`, `npm run test:roll-gm` and the required real-PDF retrieval gate. See [root causes, context example, changed files, verification and limitations](docs/gm-situational-awareness.md). Tests use disposable records and controlled providers, without paid requests or live campaign changes.

## Action declarations and compact composer (Phase 5.1)

Recognized skill declarations—including a named character who “raises his Longbow and fires … What happens?”—now stop at an application-controlled requirement/roll stage. Depleted supplies prompt a shortage question; blank/unrecorded supplies remain unknown. Available ammunition leads to a character-sheet Marksmanship roll, optional push and **Recent Dice Rolls → Submit to GM**. The GM cannot stream an unrolled hit through this guarded path. Zero-success submissions cannot be narrated as successful hits. Ordinary no-roll conversation remains available, with no new Equipped gate or local player login.

The composer removes the visible keyboard hints, keeps Enter/Shift+Enter behavior, starts around 80–100 pixels including controls, and expands long drafts within a viewport-aware limit. ACTING AS, Send and the existing styling remain.

Run `npm run test:action-safeguards` for the browser acceptance checks. Continue running the existing dice/character/AI browser regressions and `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`. See [causes, implementation, changed files, verification and limits](docs/action-declaration-safeguards.md). Preview with `npm run dev`; no paid requests are needed for the automated checks.

## Submitted ranged attacks (Phase 5.2)

A submitted **Attack: Longbow** now explicitly reports a successful attack roll when the saved successes meet the source-backed threshold, and uses recorded plus official weapon damage. Each additional uncanceled SHOOT success increases damage automatically; no allocation or confirmation is required. Attack success, an applicable legal defense, armor, and final damage are separate stages; enemy statistics/results are never fabricated.

Until autonomous NPC combat exists, answer a target-fact question through ordinary chat using explicit manual statements—for example, `No defense attempted. Target is unarmored.` or `Armor rating: 3. Armor roll: one success.` with the **actual** values. A defense must have been declared before the attack and have an available action. The application reuses the saved attack, makes no extra roll, and changes no sheets. See [attack-resolution history](docs/submitted-attack-resolution.md) and [current automatic SHOOT policy and pre-roll defense workflow](docs/automatic-shoot-damage.md).

Run `npm run test:submitted-attacks` for the browser regression and the required real-sourcebook retrieval gate for official evidence. Preview normally with `npm run dev`, roll/push on the character sheet, and use Recent Dice Rolls → Submit to GM. The existing composer and dice interface are preserved.


## Automatic SHOOT damage correction (Phase 5.3)

Ordinary ranged damage is `Weapon Damage + max(0, remaining attack successes - 1)`, after applying an actual legal predeclared defense. Edrus's Longbow therefore deals 1/2/3 damage before armor for 1/2/3 uncanceled successes. The application never asks how many additional successes to spend.

If an NPC will Dodge or Parry, first declare the player attack, then record the reaction through chat **before the player rolls**, for example `Target attempts to dodge. A defensive action is available.` Wait for its acknowledgment. The existing character-sheet roll/push and Recent Dice Rolls → Submit to GM workflow stays the same. Report the actual already-declared defensive result when available. A late declaration is not accepted, including one made after rolling but before submission. With no pre-roll declaration, no cancellation is applied and resolution proceeds directly to armor.

Unknown armor and target Strength remain unknown; no NPC rolls or sheet changes are automatic. MELEE uses its separately reviewed procedures. See [exact changed paths, source evidence, regression results and limitations](docs/automatic-shoot-damage.md). Archived allocation-based chat is retained; a new follow-up can recalculate an older saved roll without creating another one.

### Phase 6: NPC and monster combat

This tested initial implementation supports the enemies and procedures below. Full Phase 6 coverage remains incomplete; complex monster effects and advanced tactical procedures require adjudication.

Open **Combat** above Recent Dice Rolls. Index both actual fifth-printing books in this campaign's Rules Library first; keep the Guide **GM Only**. Start with an established range and enemies such as `Bandit x2`, `Bandit; Thief`, `Minotaur`, or `generated Sentry`. The initial supported library contains Bandit, Soldier, Rider, Thief, Gray Bear, Minotaur, Nightwarg and Drakewyrm. Missing statistics or unsupported special procedures require adjudication.

The GM controls validated enemy decisions and engine-generated dice. Players declare defenses before enemy attack dice, roll on their sheets, and use the existing **Submit to GM** button. Player attacks target the exact encounter name; declare Slash or Stab explicitly for melee. Enemy wounds, armor, actions and initiative persist in SQLite. Player sheets, resources and campaign time remain player-managed. **GM Dice Audit** exposes actual enemy dice without revealing private sourcebook tables. **End encounter** retains history and isolates the next encounter. Public campaign JSON backups do not include private combat tables; back up the SQLite file for those records.

Mock mode exercises the same validated combat workflow without OpenAI. With OpenAI configured, the existing model chooses only from server-provided legal decisions; the server generates all dice and validates mechanics. See [the Phase 6 report](docs/npc-monster-combat.md) for source pages, exact paths, permissions and supported/unsupported mechanics.

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/book-directory npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/book-directory npm run test:combat
npm run typecheck
npm run build
```

The real-sourcebook gate and combat browser test require both actual PDFs described in `tests/fixtures/private-sourcebooks/README.md`. The browser test uploads/indexes them into a disposable private store, tests turns and real Submit to GM, and removes its temporary database/files. Never commit licensed books, extracted pages, private fixtures, or credentials.

### Phase 6.1: combat workflow repair

Combat setup now selects participants explicitly, defaulting to ACTING AS rather than the entire campaign roster. You can also declare an encounter naturally in chat, for example “Start a one-on-one encounter between [saved character name] and a bandit at Near range.” Missing participants or range receive one clarification before numbered-card initiative. Full-party participation requires established presence or explicit confirmation.

The compact Combat panel names the current action, target and exact person who must choose or roll. Use its sheet button, then the existing Recent Dice Rolls → Submit to GM. Wrong-character/type/skill submissions remain unconsumed and explain the expected roll so you can recover in the same encounter. Quarter-day proposals pause during combat, and the campaign clock remains unchanged.

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/book-directory npm run test:combat-workflow
```

This browser regression uploads and indexes both actual books into a disposable store, uses controlled SDK responses/dice, and exercises participant selection, pre-roll defenses, invalid-roll recovery and refresh. See [the Phase 6.1 report](docs/combat-workflow-repair.md) for root causes, changed files, executed checks and remaining Phase 6 limitations.
