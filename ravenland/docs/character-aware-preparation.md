# Character-aware mechanical preparation

> Updated workflow: [Read-only character awareness and trusted local play](read-only-character-awareness.md) supersedes local token and strict Equipped requirements below. The token instructions remain applicable to hosted development/production. Normal chat now narrates actions; direct preparation remains read-only.

Implemented November 9, 2026. This phase prepares ordinary ranged attacks and validates their base pool. It does not execute attacks or roll dice.

## Existing architecture and reuse

The existing `Session.characters` records are persisted inside the campaign's SQLite JSON through `SqliteCampaignRepository`. `Character` already holds stable IDs and regular attributes; `CharacterSheet` holds current/regular attribute fields, the `skill-*` fields, weapon/gear rows, talents, conditions and resource dice. The embedded sheet is generated from the repository-root `index.html`. Its skill configuration previously supplied the sheet's own list, while the AI had no shared registry.

Skills and most sheet numbers are strings. Empty, missing, fractional, negative or out-of-range values must not become zero. `sheetFor` supplies useful UI defaults, including a Dagger, but those are not proof of character possession or training. Preparation reads the saved sheet directly, uses top-level regular attributes only where they are already established, and treats absent current attributes/skills as unknown. It uses current Agility, not regular Agility, for a ranged pool.

Weapon rows had no equipped state; the inventory list did not prove that a weapon was in hand. A new optional `equipped` boolean is carried in the existing weapon row and exposed as an Equipped checkbox. It saves, exports, imports and reloads through the existing character-sheet transport. Legacy absence remains unknown to the validator. Preparation never equips a weapon or changes its row. Free-text inventory item names do not establish an equipped combat row or a current weapon bonus. The existing manual dice roller remains independent, including staging and pushing.

There was no authenticated player identity or ownership record. The browser's ACTING AS/character ID was merely a selection; the character/dice services explicitly marked ownership as future work. The old AI projection also supplied party attributes broadly and read actor talents based only on that selection. These were not an authorization boundary.

## One canonical registry

The root `character-rules.json` is the source of truth for the four standard attributes and sixteen standard skills, including skill-to-attribute bindings and official origin labels. `scripts/generate-sheet.mjs` generates both the standalone/embedded sheet's skill configuration and `character-registry-data.ts` from it. `character-registry.ts` provides typed IDs, name lookup and the shared AI registry projection; sheet defaults and dice-metadata attribute validation also use its IDs. Edit the root JSON, not generated output. The existing alphabetical skill order is preserved.

Navigation and Hunter do not resolve as standard skills; Hunter remains a profession. Multi-word names such as Animal Handling resolve correctly. Unknown sheet skill keys are rejected by the existing strict sheet schema. Action preparation can return only a registry skill backed by source evidence. Requests for invented official skill references receive an application clarification instead of a model-generated check. The protected GM instructions include the same registry, rather than another handwritten list.

Optional and house-rule skill definitions have distinct origin labels, namespaces and source references. `validateScopedSkill` prevents them from silently renaming official skills. Such definitions are not activated by AI prose, sheet key injection or arbitrary campaign notes: their mechanical use still needs reviewed integration/manual adjudication. A verified, explicitly scoped existing House Rule Gear Bonus can be used and is labeled `house-rule` only when its complete body is an unconditional stat declaration. Conditional bonuses, costs and unclear pool/skill overrides remain unresolved. Standard skill/attribute facts continue to be identified as official.

## Character-context authorization

`CharacterPrincipal` is a server-side identity plus campaign/character grants. `requireCharacterAccess` checks it before loading any character for preparation. The prototype's new credential adapter verifies an opaque token against SHA-256 hashes configured on the server. It does not trust a player ID, character ID, GM review token, browser event, or a principal supplied in JSON. The existing character records remain authoritative; there is no second character database or duplicated ownership field inside a character sheet.

The browser exchanges its credential at `/api/player-access` for a same-origin, HttpOnly, SameSite=Strict cookie; HTTPS cookies are Secure. Credentials are not kept in browser storage, campaign settings, backups or chat records. API clients can use Bearer authentication. Grants are read on every request, so removing a grant revokes subsequent access. Connect/disconnect changes cookie/browser state only. The adapter can later be replaced by authenticated accounts and database campaign memberships without changing preparation's ownership policy.

AI actor context now requires that grant. Other party members contribute public identity summaries only, not their attributes, conditions, Willpower or sheets. Public character evidence excerpts and legacy public context snapshots are redacted accordingly. Unauthorized actor identifiers cannot inject private talent names into retrieval queries. The authorized actor projection includes canonical numeric values, weapon readiness, talent names/ranks and conditions; it excludes dark secrets, Pride, relationships, spell descriptions and arbitrary talent/gear descriptions. GM-only memories and sourcebooks remain excluded by their existing boundaries.

**This is scoped authorization for the new preparation/AI character-read path, not a rollout of full multiplayer accounts.** Existing campaign, sheet-management and manual dice interfaces remain trusted local-development interfaces. They have not been converted into a secure public multiplayer application. Player authentication, ownership-backed writes and private channels across the entire application remain future work. The new path fails closed without configured grants; it never treats local Player 1 or a client-selected ID as authentication.

## Server configuration and preview

For the access error, architecture findings, current-campaign ID inspection and four-player setup, see [Player access setup](player-access-setup.md). No authenticated campaign-owner session exists to inherit automatically.

Supply each player a fresh random access token privately, and keep its hash/grants in server configuration. For example, generate a token locally:

```bash
node -e 'const c=require("node:crypto");const t=c.randomBytes(32).toString("hex");console.log("Player token:",t);console.log("Server tokenHash:",c.createHash("sha256").update(t).digest("hex"))'
```

Set `RAVENLAND_PLAYER_GRANTS` in the environment or ignored `ravenland/.env.local` using the real campaign UUID and existing character IDs. The value is a JSON array, for example:

```dotenv
RAVENLAND_PLAYER_GRANTS='[{"playerId":"player-one","tokenHash":"REPLACE_WITH_THE_64_CHARACTER_HASH","grants":[{"campaignId":"REPLACE_WITH_CAMPAIGN_UUID","characterIds":["ilva"]}]}]'
```

The placeholders must be replaced; they are not working credentials. Do not put the raw token in a campaign record or send it in chat. No grant or credential is generated automatically against an existing campaign by this feature.

Restart the development server after changing server configuration, then:

Use the existing authorized sourcebook library: the relevant player-facing Handbook must already be indexed and available as Public Rules. The real-file tests do not register or reclassify books in a live campaign. Keep GM-only material private.

1. In Campaign Settings, open **Player access for action preparation** and connect the player's token.
2. Open the character through THE PARTY. Record current attributes, the Marksmanship rating, conditions and talents; choose the weapon and mark its row Equipped. A known None artifact selection is supported; artifacts/talents need review rather than guessed bonuses.
3. Make the authorized character active and send `I shoot the bandit with my longbow.`
4. Inspect the preparation card and its validated inputs/sources. It has no roll/confirm-execution button. Use the existing sheet separately when ready to roll.

The active owned character is restored from the scoped session on reload. Selecting another player's character cannot grant access. Preparation cards are intentionally transient and are cleared on campaign/access changes or refresh; character data and equipped flags persist normally. Cards are marked stale when the saved campaign revision changes. Re-submit to prepare against the latest saved values.

## Rules and structured result

The preparer reuses the existing authorized retrieval and equipment-fact helpers. It checks official Marksmanship/Agility evidence, the Shoot roll and weapon Gear Bonus instruction, the additive skill-pool procedure, and the named weapon row. Four bounded existing reference queries cover those facts. When generic dice context selected definitions rather than the actual quantitative formula, one bounded targeted lookup (20 hits per allowed source, at most four matched sources) recovers the missing formula through `SourcebookLibrary`. Explicit named-PDF constraints and player visibility are preserved. Shared PDF extraction/indexing/ranking were not replaced.

Real Handbook evidence for the successful fixture:

| Fact | Physical PDF page |
| --- | ---: |
| Marksmanship (Agility) | 58 |
| Shoot: skill roll plus weapon Gear Bonus | 102 |
| Skill level plus current attribute; helpful gear adds dice | 46 |
| Longbow Gear Bonus +2 | 107 |

Each fact has a selected source/chunk citation and a bounded supporting quote. Mere keyword co-occurrence in an overview is not enough to verify the additive procedure. Optional/campaign source effects are not silently substituted for official values.

An abridged actual result for a saved character with regular Agility 4, current Agility 3, Marksmanship 2 and an equipped Longbow with Gear Bonus 2 is:

```json
{
  "version": 1,
  "status": "ready",
  "characterId": "ilva",
  "declaration": "I shoot the bandit with my longbow.",
  "action": "ranged_attack",
  "characterInputs": {
    "attribute": 3,
    "skill": 2,
    "weapon": {"index": 0, "name": "Longbow", "bonus": 2, "skill": "marksmanship", "artifact": "None", "equipped": true}
  },
  "ruleInputs": {
    "skillOrigin": "official",
    "gearBonusOrigin": "official",
    "skill": "marksmanship",
    "attribute": "agility",
    "weaponGearBonus": 2,
    "poolRuleVerified": true
  },
  "basePool": {"base": 3, "skill": 2, "gear": 2, "total": 7},
  "missing": [],
  "stateChangesPermitted": false
}
```

The full result also contains campaign revision, an authorized mechanical projection, modifiers, citations and evidence. It is a projection of existing records, not persisted parallel character state. With no matching equipped weapon it instead returns `needs_review`, `weapon: null` and `basePool: null`; missing/inconsistent stats likewise stay unknown. Multiple matching equipped weapons require identification. Active/unknown conditions, unrecorded talents, talent applicability, artifacts, unverified modifications or unresolved house rules prevent readiness. Verified base components can be displayed while such modifiers await review, without inventing a final modified pool.

`POST /api/characters/prepare` returns the structured result directly. Declared mechanical chat actions go through the same preparation service before `AIService.claim`, so they make no chat/request/memory/usage/database writes and no model call. The streamed/final reply carries the same preparation packet; the browser renders it as an application card. Other action types return an unsupported/manual-review proposal rather than guessing mechanics. Custom weapon names/types and complete melee, spell or journey-check preparation remain manual until their verified bindings are implemented. Ordinary rules-reference chat and its saved history remain available.

`ready` means the ordinary **base pool** is verified. Target range, ammunition, defenses, situational modifiers, talent activation, action economy and complete combat legality are not a combat execution engine in this phase. Preparation cannot roll dice, push, spend Willpower/resources, damage anyone, change equipment or advance time. No private source or editable AI instruction can authorize those effects.

## Verification and changed files

Both actual supplied fifth-printing PDFs were readable outside Git and tested before and after. The Handbook extracts 212 pages / 243 indexed chunks, and the Guide 268 pages / 373 chunks; the Guide stays GM Only. The baseline real suite passed 19 TAP tests. The extended suite adds actual-book character preparation and verifies a 7-die result, source facts/citations, final reply and zero SQLite changes. Source files, full text and private databases remain uncommitted.

The unit suite covers the registry, different characters (7 versus 8 dice), damaged current versus regular attributes, absent/ambiguous equipment, incomplete values, invalid skills, talents/conditions/artifacts, official and verified house Gear Bonuses, unauthorized/cross-campaign access, forged identity headers, actor-context redaction, unknown-skill references and omission of private talent names from unauthorized retrieval. The browser suite covers real API authorization, HttpOnly cookie login, the main-page proposal, zero preparation writes/model calls, equipped-flag save/reload, logout and secret exclusion. Existing PDF, character-window, dice/push and AI/memory suites remain regression checks.

From `ravenland/`:

```bash
npm run typecheck
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
npm run build
npm run test:character-preparation
```

The required real-file gate fails when books are unavailable; synthetic fixtures cannot substitute for that check. Tests use disposable databases/credentials, and controlled providers only. No paid/live-model quality test or live campaign database audit was performed.

Final executed results:

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| Production build (`npm run build`) | Passed |
| Required retrieval gate, unit/synthetic portion | 161 passed, 0 failed |
| Required retrieval gate, actual PDF portion | 19 subtests plus parent = 20 TAP tests passed, 0 failed |
| `test:character-preparation` | Passed: separate authenticated players produce 7/8 dice; cookie, ownership, zero writes, equipped persistence, stale-state notice and logout |
| `test:retrieval-planner` | Passed: existing diagnostics/references; unauthenticated declarations now rejected before character/model access |
| `test:dice-repair` | Passed: sheet staging, pushing, saved consequences and Recent Dice Rolls |
| `test:windows` | Passed: character popups, save/reload/sync and independent dice |
| `test:ai` | Passed: controlled SDK, canon/memory, failure/retry, recap and existing campaign flow |
| `test:mechanical-facts` | Passed: cited numerical references and player-input/partial-allocation regressions |
| `test:handbook-pdf` | Passed: upload/extraction/FTS and source-constrained reference regression |

The real character-preparation check independently asserted `total_changes()` stayed unchanged across direct preparation and its streamed GM reply. Its source pages were 58, 102, 46 and 107, and its base pool was exactly `{base:3, skill:2, gear:2, total:7}`. Test-only setup changes were rolled back, and original input PDFs remain outside Git.

Changed-file groups: root `character-rules.json` and `index.html`; sheet generator, generated registry data and asset version; shared registry/preparation types and sheet schema; server mechanical projection/access/preparation services; player-access/preparation endpoints and GM/context boundaries; canonical GM policy; access/proposal components, campaign/settings integration and GM hook; focused unit/browser/real-PDF tests and adapted ownership/version assertions; package scripts and documentation. No database migration, dependency or sourcebook rewrite is required.

| Purpose | Files (relative to `ravenland/` unless marked root) |
| --- | --- |
| Canonical source and standalone controls | root `character-rules.json`, root `index.html`, `scripts/generate-sheet.mjs`, `src/lib/rules/character-registry-data.ts`, `src/lib/rules/character-registry.ts`, `src/lib/sheet-version.ts` |
| Existing models and typed results | `src/lib/character-sheet.ts`, `src/lib/dice/schema.ts`, `src/lib/ai/schema.ts`, `src/lib/rules/action-preparation.ts`, `src/lib/rules/planner.ts` |
| Read-only services and ownership policy | `src/server/character-access.ts`, `src/server/mechanical-character.ts`, `src/server/action-preparation.ts` |
| AI authorization/context integration | `src/server/ai/context.ts`, `src/server/ai/evidence.ts`, `src/server/ai/instructions-v1.ts`, `src/server/ai/service.ts`, `src/server/sourcebooks/retrieval.ts` |
| HTTP boundaries | `src/app/api/characters/prepare/route.ts`, `src/app/api/player-access/route.ts`, `src/app/api/gm/route.ts`, `src/app/api/ai/context/route.ts` |
| Browser workflow | `src/components/action-preparation.tsx`, `src/components/player-access.tsx`, `src/components/campaign-app.tsx`, `src/components/panels.tsx`, `src/hooks/use-gm.ts` |
| Tests | `tests/character-preparation.test.ts`, `tests/character-preparation-browser.cjs`, `tests/real-sourcebooks.integration.ts`, `tests/retrieval-planner.test.ts`, `tests/retrieval-planner-browser.cjs`, `tests/ai-canon.test.ts` |
| Commands/documentation | `package.json`, `README.md`, `docs/character-aware-preparation.md` |
