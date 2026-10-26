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

Eight unit/storage tests exercise reducer behavior, dice rules, strict validation, migrations, complete public snapshots, stale-write conflicts, multiple campaigns, imports, secret separation, and closing/reopening SQLite.

`test:persistence` requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is elsewhere. It launches a production server on an available local port with a **temporary database**, modifies settings/chat/journal in a real browser, closes the browser, stops/restarts the server, and asserts exact restoration. It also tests tools, mobile layout, create/load, backup export/import, invalid imports, stale writes, and confirmed/cancelled resets. It removes only its own temporary database. Run `npm run build` first. `node tests/browser.cjs` is an alias for this isolated browser check.

## Connected character sheets and dice pool

Open **Characters**, then click a character card to open the complete latest sheet. Back to characters returns to the four cards. Sheet fields, equipment, armor/helmet/shield, consumable dice, spells, current attribute damage, and Willpower save with that campaign character. Regular attributes and names also update the cards and party list. Existing campaigns without sheets initialize from their saved character profiles on first use. Campaign JSON exports/imports include the sheets.

The main **Dice Roller** uses the exact same visual pool and rules as the sheet: base/skill/gear selectors, negative skill dice, artifacts, D66, clearing, rolling and pushing. Select **Rolling as** to attach changes to a character. Custom rolls have no attribute association; use the skill/weapon stage buttons inside the full sheet for automatic attribute damage. Pools/results are temporary and reset when a panel closes; character state is persistent.

`scripts/generate-sheet.mjs` builds an embedded HTML asset from the repository's maintained root `index.html`, with a narrow same-origin message bridge. Both panel modes share that asset, preventing the dice implementations from drifting. `predev`, `prebuild`, and `pretest` generate it automatically; the generated public file is ignored by Git. The standalone source remains usable independently. Embedded sheets do not use or replace its browser roster: campaign and character IDs control ownership, messages are checked against the iframe source and origin, and sheet updates are validated on the client and server.

To move an existing standalone character, use **Export JSON** on the old sheet and **Import JSON** inside the desired campaign character's sheet. Import edits that selected character rather than creating another party member. Existing standalone browser data is never automatically read or overwritten.

## Phase 3: authoritative hex map

**Source files are not bundled.** The actual `Forbidden_Lands_Map.png` and `Ravenland_Campaign_Master.xlsx` were unavailable during implementation. The app shows an explicit missing-source status until they are supplied; no real Ravenland geography or calibration has been fabricated. Automated map tests use a synthetic workbook and plain test image only. Actual workbook mapping and visual alignment still require those files.

### Import the workbook

Place both files in `ravenland/data/source/` (ignored by Git). `RAVENLAND_MAP_PATH` can point to a different absolute PNG path. Use the same `RAVENLAND_DB_PATH` for import and server commands.

```sh
cd ravenland
npm ci
npm run db:migrate
npm run map:import -- data/source/Ravenland_Campaign_Master.xlsx --inspect
```

Inspection prints worksheet names, row counts, and headers, **not row contents**. Copy `config/map-mapping.example.json` to a local mapping file and fill in actual sheet/header names. The template is intentionally incomplete and unreviewed; it is not an assumed workbook schema. Every mapped field must be reviewed for player visibility. Only after review, set `publicColumnsReviewed` to `true`.

Required mappings: `coordinate`, `column`, `row`. Column/row are explicit **logical grid indices**, not image pixels. If the workbook does not provide logical indices, stop and establish a documented coordinate conversion based on its actual coordinate convention before import; do not guess. Optional public mappings: `terrain`, `region`, `printedFeatures`, `waterways`, `routes`. Omitted fields remain null/empty and display “Not provided by source.” List fields use the configured separator. Mapped headers naming GM secrets, spoilers, encounters, treasure, adventure details, or undiscovered content are rejected. Unmapped columns are never persisted or exposed.

If authoritative adjacency is supplied as edge rows, add:

```json
"adjacency": {
  "sheet": "ACTUAL_ADJACENCY_WORKSHEET",
  "from": "ACTUAL_FROM_HEADER",
  "to": "ACTUAL_TO_HEADER",
  "bidirectional": false
}
```

Set `bidirectional: true` only when the workbook defines those edges as undirected. Without imported edges, travel stays disabled. Unknown endpoints, self-edges, duplicate coordinates, duplicate logical positions, missing headers, and invalid grid indices fail import. This adapter supports an explicit hex sheet and optional edge sheet; inspect the real workbook before adapting other adjacency encodings.

```sh
npm run map:import -- data/source/Ravenland_Campaign_Master.xlsx path/to/reviewed-mapping.json
npm run dev
```

Import is transactional and rejects replacing existing geography. `--replace` explicitly authorizes replacement; it invalidates calibration but never moves existing parties or replaces campaign records. Keep the original workbook as the source of truth. Geographic records live in separate SQLite tables; public campaign discoveries live in `session.discoveries` and are included in campaign JSON backups. No adventure/GM columns are imported. Player endpoints return only reviewed public geography and that campaign's already-known discoveries; they do not query GM-secret storage.

### Calibrate against the printed image

1. Open **Map → Developer calibration**. The image retains its original proportions. Use drag/wheel or touch pan/pinch; zoom buttons work too.
2. Set orientation (pointy or flat), stagger parity, origin X/Y, horizontal spacing, and vertical spacing. The origin is the image-pixel center of logical grid `(0,0)`, which may be outside the image. Pointy grids stagger alternate rows; flat grids stagger alternate columns. Logical indices come from the reviewed import mapping.
3. Choose a known printed coordinate, enable landmark marking, and click its **printed hex center** on the image. Repeat for at least three non-collinear coordinates across the map, spanning at least half the imported column range and half the row range. Pick independently identifiable, widely separated corners/edges rather than neighboring hexes.
4. Compare preview outlines with printed hexes and adjust origin/spacing/orientation. Blue dots are independently clicked landmarks; listed error is the distance between each clicked point and its computed center. Remove/re-mark a mistaken landmark. Save a draft at any time.
5. **Verify calibration and enable overlay** is enabled only when the landmarks span the required range and each error is at most 15% of the smaller grid spacing. The server checks these constraints again. Visually inspect additional widely separated coordinates: passing a mathematical tolerance alone does not establish the real printed map's correctness.

Before verification, only calibration landmarks/outlines are shown; the complete interactive overlay, party marker, and travel are gated off. Editing calibration invalidates verification. Calibration persists in SQLite and is tied to the PNG checksum; replacing the image invalidates it. Reimporting geography also clears it. Grid lines and coordinate labels can be toggled independently. Large overlays render only hexes in the current viewport.

### Explore and travel

Click or keyboard-select a hex, or choose it using Inspect hex. Inspection highlights it and shows terrain, region, reviewed printed features, waterways/routes, and campaign-known discoveries. It never moves the party. The travel button is enabled only after verified calibration and an explicit imported edge from the party's current coordinate. Confirmation is required. The server rechecks adjacency, source/destination, calibration, and campaign revision inside the update transaction. It updates only hex, source-provided location, and terrain—no narration, time advance, encounters, or mishaps.

If the campaign's existing starting hex is absent from the imported data, no position is guessed. Set the intended starting coordinate explicitly in Campaign Settings, then use validated travel. Named printed features are used as destination names; otherwise the exact source coordinate is shown. Missing terrain remains empty rather than invented.

### Map tests

```sh
npm test
npm run typecheck
npm run build
npm run test:map
npm run test:persistence
```

Ten unit/storage tests now include workbook import, lookup, missing-field handling, source privacy, calibration verification, explicit directed adjacency, travel rejection, and saved positions. `test:map` launches an isolated temporary database/server with **synthetic** source files. It exercises selection without movement, cancelled and confirmed travel, nonadjacent rejection, zoom/pan/touch pinch, privacy filtering, and restoration after a server restart. No real map content or source alignment is claimed by fixture tests. The regular persistence/character-sheet suite continues to run independently and checks the missing-map state when real sources are absent.
