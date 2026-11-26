# Player access setup investigation and repair

> Updated workflow: [Read-only character awareness and trusted local play](read-only-character-awareness.md) supersedes local token and strict Equipped requirements below. The token instructions remain applicable to hosted development/production. Normal chat now narrates actions; direct preparation remains read-only.

November 9, 2026 (America/Chicago).

## Finding

The application has no account login, authenticated campaign-owner session, user table, or campaign membership/character ownership table. Campaign creation and the campaign library do not record an authenticated owner. The `ACTING AS` selector and character-sheet window IDs select records; they do not prove who controls them.

`RAVENLAND_GM_REVIEW_TOKEN` authenticates a shared **privileged development capability** on selected memory, sourcebook and settings routes. It is entered separately in component memory, not a persistent administrator login. It has no player subject, campaign membership or character ownership mapping. Possession of that token cannot identify the administrator's own character. The prose saying the administrator is also a player in GM instructions is not authorization.

The new character preparation route introduced `RAVENLAND_PLAYER_GRANTS` because no secure existing identity/ownership mapping could be reused. Its server-validated credential resolves a player subject and explicit campaign/character grants. `api/gm` checks declared mechanical actions before loading character context or making a model call. Without a valid player session it returns HTTP 401 with `player_authentication`; selecting an unassigned character returns HTTP 403. Neither changes campaign state.

The reported message is emitted by that guard, rather than PDF retrieval or the OpenAI provider. The specific request `c0c7f9cb-d86b-4a6f-ba65-20ea7df20c7e` was not present in this workspace's retained test logs. No live campaign database, `.env.local`, configured player grants, or GM review credential was attached here, and the companion page supplied no application URL. Consequently, the deployed session/configuration for that exact request could not be audited. No campaign IDs, owner mappings or credentials were guessed or provisioned.

**Can the current administrator prepare without another player credential?** Not on the existing architecture: there is no authenticated administrator/owner principal with established character ownership to inherit. The administrator needs an explicit scoped player grant like the other participants. Reusing the GM review secret or automatically assigning the selected character would cross that missing boundary. Once account authentication and database ownership exist, the adapter can consume the same account session for both roles; an administrator playing their own character should then need only that session, without GM-only context being added to player narration.

## What changed

- Settings distinguishes **server setup required**, **configured but disconnected**, and a connected player. Invalid server configuration produces a safe error, including when no cookie is present; whitespace/blank configuration is treated as unconfigured.
- **Setup for this campaign** shows the loaded campaign's actual UUID and public character names/IDs. It grants nothing and reveals no sheets, secrets, token hashes or other players' access mappings.
- Authentication errors in chat offer **Open player access setup**, opening the correct Settings section. Retry is preserved after configuration/login.
- `.env.example` documents the previously missing configuration variable. The default `[]` disables access; it does not create an owner.
- `npm run player-access:inspect` reports actual IDs from an existing database using the existing repository's read-only mode. It never migrates, creates or selects a campaign, writes grants, generates credentials, or prints private character/GM data. A missing database fails without creating one.

The existing grants schema, hashing, HttpOnly cookie, ownership policy and mechanical evidence checks remain authoritative. There is no administrator bypass or second authentication mechanism.

## Manual setup for the existing four-player campaign

1. Open the intended campaign, then **Campaign Settings → Player access for action preparation → Setup for this campaign**. Copy its actual campaign ID and the IDs of the characters each participant is authorized to control. Agree that ownership explicitly; the administrator does not inherit every character. Loading another campaign requires that campaign's grant as well.

   Alternatively, on the application's server, from `ravenland/`, run:

   ```bash
   npm run player-access:inspect
   ```

   It uses the same `.env.local`/`RAVENLAND_DB_PATH` and default `data/ravenland.sqlite` path as the application. With a different existing database or pinned campaign, supply `--database` and/or `--campaign` after `--`, followed by your real path/UUID. Run it where the live database is mounted. It does not use or create a sample campaign if none is available. The current task workspace has no live database, so no campaign-specific values can be supplied in this report.

2. Generate a **different random player token for each of the four participants**, including the administrator, locally on a trusted machine. This command creates a token and its SHA-256 hash when you execute it:

   ```bash
   node -e 'const c=require("node:crypto");const token=c.randomBytes(32).toString("hex");console.log("Player token:",token);console.log("Server tokenHash:",c.createHash("sha256").update(token).digest("hex"))'
   ```

   Give each participant only their own raw token privately. Keep it in a password manager. Do not send it in game chat or this chat, store it in a campaign record, reuse the OpenAI/GM review secret, or commit it. The server stores **only the hash**, not the raw token.

3. Edit the server environment or ignored `ravenland/.env.local` to set `RAVENLAND_PLAYER_GRANTS` to a JSON array containing one object per player. The object's fields are:

   | Field | Value to use |
   | --- | --- |
   | `playerId` | A stable, non-secret label you explicitly choose for that participant; this prototype has no existing account IDs |
   | `tokenHash` | That participant's 64-character lowercase SHA-256 hash from step 2 |
   | `grants` | An array of campaign grants |
   | each grant's `campaignId` | The exact UUID copied in step 1 |
   | each grant's `characterIds` | An array containing only that participant's agreed existing character IDs |

   Shape only, with placeholders that must be replaced; these are **not** working IDs or credentials:

   ```dotenv
   RAVENLAND_PLAYER_GRANTS='[{"playerId":"<your participant label>","tokenHash":"<that token hash>","grants":[{"campaignId":"<actual campaign UUID>","characterIds":["<that player’s actual character ID>"]}]}]'
   ```

   Add the other three player objects to this **same array**, each with a distinct token hash and its own character grant. Do not create four repeated environment-variable assignments: only the last one would take effect. Do not assign all four characters to one player as a workaround. Existing secrets/configuration must be preserved. A server-injected environment variable can override `.env.local`; update the actual source of configuration.

4. Restart the application server after changing configuration. For local development, stop the current process and run `npm run dev` from `ravenland/`. Production runs need their normal process restart with the updated environment; do not delete the database or reset the campaign.

5. Each participant connects their **raw player token** under **Player access for action preparation** once. Settings shows `Connected as ...`; the active selector chooses an owned character. The application uses the same HttpOnly, SameSite=Strict cookie on subsequent requests. Its 12-hour lifetime survives page refreshes, reopening the same browser profile and application restarts, provided the origin and server grants remain the same. HTTPS cookies are Secure. It does not survive explicit disconnect, browser data clearing, expiry or revocation. No extra login is needed for each action.

6. Retry the failed action. It still requires a recorded equipped weapon and verified character/rules inputs. Missing talents, conditions or statistics remain review items; fixing authentication does not fill in missing data or execute a roll.

If connection is accepted but an action returns 403, check that the selected character and campaign match the grant. A valid credential for a different campaign is insufficient. If setup shows invalid configuration, check JSON syntax, exact UUIDs, unique lowercase hashes and the environment used by the running process. Do not paste the environment file into chat to troubleshoot.

## Four-player configuration recommendation

For the current trusted local-development prototype, use four independent scoped player credentials with one agreed character each, a separate GM review capability for privileged tools, and HTTPS if accessed remotely. Keep the same server environment across restarts so valid sessions remain usable. Removing a player's grant revokes subsequent character preparation reads; disconnect clears the local cookie. Connect an administrator's ordinary player credential while playing, keeping GM-only sourcebooks/memories excluded from preparation and public narration.

This change does not add account authentication to legacy campaign, sheet, image, map or dice APIs. A securely hosted multiplayer campaign still needs one real account/session system, campaign memberships and character ownership enforced on **all** read/write routes. Putting the current prototype on a public URL with these scoped preparation credentials alone is insufficient. That larger account rollout is outside this setup repair.

## Verification

Tests use isolated databases and test-only credentials. They check the unconfigured status and safe errors; actual IDs in the setup UI; denial of the GM review capability alone; an explicitly granted administrator's own character; another authorized player's distinct pool; unauthorized character/campaign selection; logout; page reload and application-server restart session restoration. Read-only inspection tests reject nonexistent databases/campaigns, preserve state and exclude private sheet and GM data.

Run from `ravenland/`:

```bash
npm run typecheck
npm run build
npm run test:character-preparation
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

The actual fifth-printing Handbook and GM Guide were available outside Git. The unchanged real-PDF suite passed before this repair (20 TAP tests). After the repair, `npm run test:retrieval-check` passed all 164 unit/synthetic tests and all 20 actual-PDF TAP tests. `npm run typecheck`, `npm run build`, the expanded `npm run test:character-preparation` browser suite, and `npm run test:retrieval-planner` also passed. The read-only inspection command failed safely against this workspace’s absent live database, as expected; its tests passed against an existing isolated database and a missing file. Synthetic browser PDFs are separate coverage, not a substitute for the real books. No paid API calls or live campaign writes are needed for these tests.

Changed files: `src/server/character-access.ts`, `src/app/api/player-access/route.ts`, `src/components/player-access.tsx`, `src/components/panels.tsx`, `src/components/campaign-app.tsx`, `.env.example`, `src/server/player-access-setup.ts`, `scripts/inspect-player-access.ts`, `package.json`, `tests/character-preparation.test.ts`, `tests/character-preparation-browser.cjs`, `tests/player-access-setup.test.ts`, this document, README, and the prior preparation guide's setup link. PDF extraction, retrieval, source permissions and mechanical validators are unchanged.
