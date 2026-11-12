# Phase 6: encounter-scoped NPC and monster combat

Updated November 12, 2026 (America/Chicago).

**Status:** the supported encounter workflows are implemented and tested, but the full original Phase 6 specification is **not yet complete**. Enemy coverage and complex monster procedures remain limited as described below. Unsupported mechanics pause rather than producing invented results.

## Audit and reuse

There was no initiative manager, NPC stat-block model, monster attack executor, or persistent encounter record. The existing combat feature interpreted submitted ranged attacks against manually reported target facts. It did not control enemies.

This implementation reuses:

- The SQLite campaign repository, additive migrations and transaction conventions. Two campaign-scoped feature tables follow the existing private GM Memory/sourcebook storage pattern; they do not replace campaign persistence or create player characters for temporary enemies.
- The authorized indexed sourcebook pages and existing `weaponRow`/hit-threshold evidence readers. The ordinary player PDF retrieval planner and source permissions remain intact.
- The existing `StructuredRoll`, category arrays, negative Skill Dice and `countSuccesses`. `generatePool` adds initial server pool generation to that same dice module. No separate success-counting or push engine was introduced.
- Recent Dice Rolls, original saved roll IDs, server verification, weapon snapshots, fingerprints, stable Submit to GM request IDs, finalization and already-applied push consequences.
- The AI request claim/retry mechanism, streaming reply contract, usage records and protected instruction policy. Enemy decisions use the existing official OpenAI SDK and configured model. Players do not acquire another credential.

## Starting and playing

1. Index both actual fifth-printing books in this campaign's Rules Library. Keep the Gamemaster's Guide **GM Only**. Exactly one indexed edition of each book must be identifiable; missing or ambiguous evidence blocks mechanics.
2. Open **Combat** above Recent Dice Rolls. Enter enemies, for example `Bandit x2`, `Minotaur`, or `Bandit; Thief`. Select the established starting range, then **Begin encounter**. All current party characters participate. This is ordinary, aware combat; surprise, terrain, initiative talents and advanced tactical adjustments need separate adjudication.
3. The application draws the initiative deck without replacement and preserves the order between rounds. Select the appropriate ACTING AS character for a player turn. Players declare their own attacks and use their sheets. **End my turn** yields to the GM; **Continue GM turn** requests the enemy's next legitimate decision rather than asking the player to choose enemy statistics/actions.
4. An enemy declares its attack before attack dice are generated. A targeted player selects **Declare Dodge**, **Declare Parry**, or **No defense** where legal. Once all required choices are recorded, the server rolls the enemy attack. No later defensive choice is offered.
5. For a declared player defense or required armor roll, roll on the existing character sheet, optionally push an eligible defense, and use **Submit to GM**. Armor cannot be pushed. The existing shield button's `Shield Parry:` label is supported. Actual success totals come from the saved dice, not text typed into chat.
6. Player weapon attacks target one exact active enemy name. Ordinary SHOOT remains automatic damage after actual defensive cancellations. For MELEE, explicitly declare **Slash** or **Stab**; the feature requirement and defensive modifiers are checked separately against their actual handbook procedure.
7. A prone combatant must **Stand up** before attacking. A reaction consumes an available fast action, or the remaining slow allowance as a second fast action. Actions used before a turn stay spent until the next round. The application never takes a player turn automatically.
8. **End encounter** closes it while retaining its audit. A new encounter has new IDs, initiative and state. A location/hex change prevents the old encounter from continuing in another scene.

The equivalent chat commands are `/combat start Bandit x2 at Near`, `/combat next`, `/combat end turn`, `/combat defense dodge`, `/combat defense parry`, `/combat defense none`, `/combat stand`, and `/combat end`. Unknown armor can be corrected with the sheet controls and **Recheck saved armor** (`/combat resume`); the existing attack dice are reused.

## Enemy data and rules authority

No official stat blocks, complete extracted pages or private books are committed to Git. Templates are constructed at runtime from the campaign's actual indexed originals, with document/chunk/page provenance.

Supported initial published humanoids: **Bandit, Soldier, Rider and Thief**. The Guide's typical NPC table is physical PDF page 187 (printed 183). Equipment is selected from its published alternatives; values come from the Handbook's actual weapon, shield, armor and helmet tables at physical pages 105, 107 and 110. Unlisted skills are untrained, and no unlisted talent is supplied.

`generated Sentry` creates a clearly labeled generated human using the actual Guide's three-per-attribute baseline at physical page 187. It has untrained skills, no armor/talents, and a GM-selected dagger whose ratings are verified against the equipment table. It is not attributed to a published named NPC. This is intentionally a small supported generator, not arbitrary model-authored statistics.

Supported initial monster entries: **Gray Bear, Minotaur, Nightwarg and Drakewyrm**. Exact headings anchor the statistics and adjacent attack-table pages. All six original entries must be present. The model cannot supply a substitute attack or an invented pool. The lookup retains published movement, special rules and individual attack procedures privately.

The rules reader separately establishes initiative/action allowance, pre-roll reaction timing, SLASH/STAB, SHOOT, the hit threshold, armor and Broken status from the actual Handbook. The Guide's physical pages 77–79 establish monster attack selection, fixed attack pools, no pushing, default defensive restrictions and monster defeat. Scoped combat house-rule overrides stop automatic execution for adjudication; official defaults do not silently overrule them.

## Dice, resolution and enemy decisions

Enemy rolls contain combatant/action IDs, pool categories or table, actual individual faces, successes, push status, timestamp and source references. Initiative and D6/D66 selections are likewise recorded. Production randomness uses Node's cryptographic random integer source. Monster attack pools come from the selected published entry and do not shrink with wounded Strength. Humanoid physical pools use their current attributes, trained skill and verified weapon bonus. Supported range and defensive modifiers are applied or explicitly requested from the player's sheet pool.

With OpenAI configured, the GM receives a finite set of currently legal enemy decisions and returns only a typed `choiceId`. The application validates it before spending actions or rolling. Statistics, successes, damage and outcomes cannot be supplied through this decision contract. The configured model is preserved, storage is disabled, actual usage is recorded, malformed decisions fail safely, and retries reuse completed command receipts. Mock mode uses a deterministic application policy for the same validated options and makes no paid calls.

Ordinary attacks apply actual legal defense cancellations first, then source-backed base damage and additional-success damage, then actual armor results. The engine distinguishes successful attack, pending defense, pending armor and completed damage. Enemy armor rolls use Gear Dice and degrade from ones only when damage penetrates; natural armor does not degrade. Body armor is degraded before helmet as the GM's choice. Broken humanoids require a real D66 critical-table lookup; published helmet protection is another recorded armor roll. Lethal timers remain recorded facts, not automatic clock advancement. Monsters use their published Broken/defeat rule rather than a humanoid critical table.

Supported monster procedures include fixed physical attacks, multiple targets, stated Parry exceptions, armor bypass, prone/knockback/Cold/grapple reminders and distinct fear damage to Wits with no armor. Effects on player characters are reported for player application, never written to their sheets. Complex chained/conditional attacks, special targeting and threshold abilities pause with an explicit review reason before unsupported dice or effects are invented.

## Storage, privacy and safety

`combat_encounters` holds each private encounter snapshot. A unique partial index permits only one active encounter per campaign. `combat_commands` records the request fingerprint and result for idempotent retries. Each completed attack retains its own IDs and player-roll bindings; consumed rolls cannot resolve another step. The same roll cannot be applied again through another request. A failed or invalid GM decision rolls no dice. State revisions and campaign revision checks reject stale decisions.

Enemy current/maximum attributes, protection, actions, wounds, critical records, Broken status, attack history and all dice persist in SQLite. Player capabilities are read from the existing sheet and refreshed for combat checks. No second player character record or automatic player damage/resource/condition write is introduced. Sheet push consequences are never repeated. Enemy state is temporary encounter data, not automatically approved GM Memory or permanent NPC canon. Existing Journal, memory review, quarter-day, map and campaign clock behavior are preserved.

The public combat endpoint requires the existing campaign/character access boundary. Trusted local development still uses the launcher's proof and ACTING AS selection. Hosted requests retain explicit ownership grants; there is no new public authentication bypass. Player views and ordinary GM context receive a sanitized projection without unpublished enemy attributes, source bodies, full attack tables or private special rules. Only witnessed roll information and pending/completed mechanical facts are shared. Private Guide pages never enter ordinary player rules retrieval. Combat does not change source visibility.

The resumed review found and fixed two multi-target binding defects. A player who chose No defense cannot supply a defensive roll, and an armor roll can bind only to its own target's unresolved armor step. Rejected rolls do not enter the encounter's consumed-roll list or change enemy state. New tests reproduced both failures before the correction; an additional real-PDF test exercises the multi-player monster case through the production roll verifier and AI service. Player-specific roll requests name the target. Completed combat receipts remain replayable after the encounter ends, Stand up enforces its prone/no-pending-attack prerequisites, and completed critical-injury notes are not appended repeatedly.

Combat records live outside the public campaign JSON backup, like existing private GM records. Back up the SQLite database for encounter history; public campaign JSON export/import is unchanged. Migrations run automatically when the repository opens and preserve prior campaign snapshots and secret records.

## Exact code paths

- `src/lib/combat/types.ts`: encounter, combatant, attack, roll and public projection contracts.
- `src/lib/dice/engine.ts`: shared initial server pool generator; existing push/count behavior retained.
- `src/server/combat/sources.ts`: authorized private runtime page assembly, rule evidence, official/generation lookup and equipment verification.
- `src/server/combat/engine.ts`: initiative, action spending, attack/defense staging, dice, player-result binding, armor and enemy damage.
- `src/server/combat/critical.ts`: recorded D66 critical injury selection and source-row/helmet resolution.
- `src/server/combat/store.ts`: current encounter lookup, sanitized public view and persistence.
- `src/server/combat/service.ts`: validated GM commands, actor authorization, legal decision choices, source checks, scene/revision checks and idempotent transactions.
- `src/server/migrations/015_combat_encounters.sql`: additive private encounter/receipt tables.
- `src/server/ai/provider.ts`, `service.ts`, `context.ts`, `instructions-v1.ts`: structured decision contract, existing request/usage integration, bounded public combat awareness and protected policy v1.11.
- `src/lib/rules/action-declaration.ts`: recognizes explicit Slash/Stab declarations using the existing canonical Melee skill.
- `src/app/api/combat/route.ts`, `src/components/combat-panel.tsx`, `campaign-app.tsx`, `src/app/globals.css`: authenticated public projection and compact companion controls, without replacing chat or character sheets.
- `tests/combat.test.ts`, `combat-provider.test.ts`, `combat-real.ts`, `combat-browser.cjs`, `real-sourcebooks.integration.ts`: engine, SDK, actual-book and browser regressions. Existing migration-count and protected-version assertions are updated in `ai.test.ts`, `persistence.test.ts` and `ai-canon.test.ts`.
- `package.json`, `README.md`, this report: reproducible verification and setup.

## Verification

Executed on the resumed working tree:

- `npm run test:retrieval-check`: **261 unit tests and 44 real-sourcebook tests passed**, zero failures or skips. The pre-change baseline real suite passed 34 tests.
- Both actual supplied fifth-printing books were uploaded, extracted, indexed and queried in disposable private stores: Player's Handbook (212 pages, 243 chunks, Public Rules) and Gamemaster's Guide (268 pages, 373 chunks, GM Only). The actual Guide supplied the humanoid and monster entries; synthetic fixtures did not replace it.
- Ten browser suites passed: `test:combat`, `test:submitted-attacks`, `test:action-safeguards`, `test:roll-gm`, `test:character-awareness`, `test:gm-situation`, `test:ai`, `test:dice-repair`, `test:character-preparation`, and `test:retrieval-planner`. The combat browser test indexed both actual PDFs and exercised enemy turns, pre-roll defense choices, authoritative dice, real Recent Dice Rolls submission, replay, refresh, mobile controls and unchanged player sheets/campaign mechanics.
- `npm run typecheck` and `npm run build`: passed on the final implementation.

Tests use disposable databases and controlled SDK/providers. No paid OpenAI call was made and no live campaign was modified. Existing GM Memory, Journal recap, scene continuity, character ownership, push behavior, official PDF retrieval and automatic Longbow damage regressions passed. Books, extracted pages and private fixture databases remain outside Git.

## Known limits

This is a focused tabletop combat prototype. It does not claim complete bestiary/NPC coverage or full tactical automation. Other official entries fail closed until an extractor is supported. Group initiative above ten participants, initiative exchanges/talents, surprise, zone movement/terrain/cover, free attacks, all spells, NPC pushing and advanced hidden combinations are not automated. The supported encounter starts with established range and combat-ready equipment. Unsupported positional or special-rule dependencies require adjudication instead of a fabricated action or roll.

Complex monster follow-on effects and reactive threshold attacks may leave the encounter paused; they cannot be dismissed by the armor recheck control. A general in-application adjudication-and-resume workflow for those procedures is not implemented yet. Ending the encounter is currently the supported way to exit such a pause. This is a material remaining Phase 6 limitation, including for some entries in the supported monster tables. Automatic injury timers, healing/recovery and permanent campaign-NPC promotion are outside this implementation. Players remain responsible for their own sheets. No live paid-model decision quality is claimed by controlled tests.
