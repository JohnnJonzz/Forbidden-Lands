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

Click or keyboard-select a hex, or choose it using Inspect hex. Inspection highlights it and shows terrain, region, reviewed printed features, waterways/routes, and campaign-known discoveries. It never moves the party or spends time. **Plan journey to…** opens the Journey panel with that destination selected. Verified calibration and an explicit imported edge are required. Planning alone does not move anyone. Phase 4 requires explicit departure and expenditure confirmations, and moves the party only when the full adjudicated cost is spent. Source facts, party revision, and adjacency are rechecked by the server. No narration, encounters, or travel mishaps are generated. The former direct-travel endpoint returns HTTP 410 so it cannot bypass journey accounting.

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


## Phase 4: persistent journey engine

Open **Journey** in the main navigation, or select an adjacent map hex and click **Plan journey to…**. The panel shows the current hex/source terrain, proposed destination, date, quarter, weather, responsibilities, and travel mode. It is independent of the mock Game Master; journey commands never call an AI service or append narration.

### Plan, assign, and complete travel

1. Pick a source-adjacent destination. Assign existing party members to Lead the Way and Keep Watch. Save assignments independently if preparing for later travel.
2. Choose On foot, Mounted, or Other (manual). Other requires a description. Capability references come from the connected sheets, but mounts, simultaneous roles, and movement restrictions require manual review.
3. Enter an **explicit manual cost in whole quarter-days** (1–16 per leg), a rules reference/adjudication, and check the review acknowledgment. There is no terrain-independent default rate. The destination terrain is shown from the workbook. Save the plan: neither location nor time changes.
4. **Confirm and start journey** asks for confirmation and marks the leg in progress, without moving or advancing the clock.
5. **Spend next quarter** charges one quarter and saves progress. **Complete travel** charges the remaining quarters, after confirmation. Only fully spent legs update the campaign hex/location/terrain and add completed Hike/travel history. The source, destination, assignments, calibration, adjacency, plan ID, and campaign revision are checked again. Arrival uses a single printed feature if one exists, otherwise the source coordinate.
6. Cancel a plan or an in-progress leg explicitly. Already spent time is retained; the party stays at its departure hex. Closing the panel/browser or restarting the server preserves the plan and expenditure for later resumption.

The old invalid H14 sample position is still never guessed or relocated. Set a valid starting hex in Campaign Settings before planning.

### Clock and calendar

The verified quarter sequence is Morning → Day → Evening → Night → Morning. Completing Night increments the date, and every charged quarter creates a before/after clock log entry. Selection, assignment changes, planning, and starting a plan cost no time. Manual date/quarter changes through Campaign Settings are recorded as clock corrections, not journey expenditure.

**Calendar limitation:** existing dates are free-form labels, and Forbidden Lands fantasy month lengths/year boundaries have not been verified against the rulebooks. Named dates therefore retain their original label plus an explicit elapsed-day suffix, e.g. `12th of Stillfall, 1165 (+1 day)`. Subsequent days increment that offset. This deliberately does not fabricate a fantasy month boundary. For exact civil day/month/year arithmetic in this prototype, set an ISO date such as `2026-12-31`: ending Night yields `2027-01-01`, Morning. ISO arithmetic is Gregorian, not a claim about the game's official calendar. This distinction is also displayed in the panel.

### Activities and weather

The panel records Hike, Lead the Way, Keep Watch, Make Camp, Forage, Hunt, Fish, Rest, Sleep, and Explore. Select party members, enter a manual roll result/successes and outcome, explicitly adjudicate time, and confirm. Choose **0 additional quarters** for an activity concurrent with travel; that means no double charging, not a claim that the activity is free. Separately charged activities are blocked while travel is in progress; finish/cancel travel first or record concurrent results. Completed travel records Hike automatically, so do not charge the same hike again.

Duration/role compatibility, resource use, hunting/foraging yields, healing, sleep deprivation, forced marches, mishaps, fractional movement, and multi-hex-per-quarter travel are **not implemented or verified**. No hidden approximations are applied. This phase tracks whole-quarter, single-hex adjudicated legs, not a complete automated Forbidden Lands travel ruleset. Manual outcome records do not automatically alter character supplies or health.

Weather description updates the existing campaign weather everywhere. Unverified effect notes are stored separately, are visible as unverified, and never become numeric modifiers. Sources are Manual or Roll20 manual entry. `WeatherProvider` is an interface for a future reviewed Roll20 adapter; no generator, external script, random weather table, or OpenAI API is connected. Paste manually obtained weather descriptions for now.

### Persistence and reliability

- `src/lib/journey/clock.ts`, `engine.ts`, and `schema.ts` contain the testable clock, rules-review boundaries, commands, and typed state, without UI/database access. Geographic facts are supplied through an interface; sheet capability extraction is separate.
- `src/server/journey/service.ts` validates commands and performs campaign updates and idempotency receipts in one SQLite transaction. Migration `003_journey_actions.sql` adds campaign-scoped action IDs and payload fingerprints.
- Identical retries return the current record without spending time twice, even after server restarts. Reusing an ID with different action parameters is rejected. Revision tokens prevent stale tabs from charging travel. Imported logs also prevent reusing already recorded IDs when the original operational receipts are absent.
- Journey assignments, plans, spent quarters, completed/cancelled travel, activity outcomes, weather state, and before/after logs live in the public campaign snapshot and are included in JSON backups. Old campaigns without journey state remain compatible. GM-only storage remains separate.
- Backend confirmation is required for departure, expenditure/completion, cancellation, and charged activities. The UI disables buttons while submitting and offers Retry same action after an uncertain failure. Normal Campaign Settings remains an explicit manual preparation/correction tool, not a substitute for journey travel.

### Verify a journey

```sh
npm test
npm run typecheck
npm run build
npm run test:map:real
npm run test:map
npm run test:persistence
```

Unit/storage tests cover map adjacency, confirmation, named/ISO clock handling, Night/year rollover, manual terrain-cost boundaries, role validation, partial travel, activities, weather, duplicate submissions before/after reopening SQLite, backup restoration, and absence of automatic narration. The real-map browser test sets a temporary party at M22 with an ISO Night clock, plans a two-quarter M22 → N21 journey, spends one quarter, restarts the server mid-journey, resumes/completes it, records Sleep, and updates weather. Synthetic map tests check cancellation of confirmation and retain zoom/pan/pinch/calibration coverage. The existing character, backup, and campaign suites still run against isolated temporary databases.
