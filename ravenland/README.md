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

**Journey Settings is configuration only**: weather mode, default leader/watcher, and default Hike outcome requirement. Manual weather can be retained or edited when completing. AI weather is not connected, so that mode requests an explicit weather entry before completion; no substitute weather or modifiers are invented. Legacy journey/roll-matching management is disabled once the chat workflow is initialized. Existing saves, old activity/dice records and journal notes are retained.

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
