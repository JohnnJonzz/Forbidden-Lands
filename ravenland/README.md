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
