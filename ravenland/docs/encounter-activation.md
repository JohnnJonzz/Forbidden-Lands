# Phase 6.3.3 — Natural-language encounter activation

## Confirmed root cause

Baseline: clean `09836bc` on `ravenland-ai-gm-prototype`. Its existing regression gate passed 339 unit tests and 106 actual-PDF tests before changes. Both original fifth-printing books were available.

I also ran the exact reproduction against a private temporary copy of the baseline setup parser. It detected encounter intent, selected only Edrus, counted one bandit and preserved NEAR. It extracted `the muddy forest road immediately outside The Hollow Watch`, but returned `confirmed: false` and the exact reported “We're at The Hollow Watch. Is … a local scene here?” question.

The cause was application validation, before model narration or encounter creation:

1. `clearlyLocalScene` rejected any occurrence of `journey`, including **not a journey**.
2. Its location patterns recognized **just outside**, but not **immediately outside**, a standalone **same/current hex** declaration, or **keep the campaign hex unchanged**.
3. Locality in an answer was only evaluated for a fresh request. The existing affirmative/snapshot path often covered this, but explicit locality should also be recognized on a saved-plan answer.
4. A separate loadout defect would have mattered after starting: the parser recognized **armed with** and **wielding**, but ignored **equipped with** and explicit negative weapon lists. The source bandit's Sling could therefore survive a Broadsword-only declaration.
5. A natural-language “acts first” request was not recorded or acknowledged. The engine already drew numbered cards correctly; it had no player-facing initiative override.

The existing natural-language intent detector, pending-plan database, source lookup, encounter constructor and enemy-turn orchestrator were already connected. No second encounter engine or pending-plan store was needed.

## Request and persistence path

| Stage | Existing path and resulting behavior |
| --- | --- |
| Main composer / Acting As | Sends the original declaration through `/api/gm`; no manual panel action or slash start is required. Existing character authorization applies. |
| Intent and full plan | `combatRouting` → `prepareEncounterSetup` → `parseEncounterSetup` retains the declaration, actual participant IDs, enemy counts, range, scene and optional first-actor request. |
| Scene validation | Explicit local statements can confirm the current location/hex snapshot. Travel, a conflicting hex, or a recorded discovered/visited location in another hex prevents automatic confirmation. Only player-known location records are consulted. |
| Pending clarification | Existing `combat_setup_proposals` and request receipts retain the complete plan across refresh and server restart. An affirmative answer resolves locality and resumes the plan. “Use the current campaign location” explicitly corrects a conflicting scene. Unrelated questions do not start it. |
| Actual creation | `validateReadySetup` rechecks ownership, participants, location/hex and intervening encounters. `lookupEnemy` supplies original-source statistics; `applyDeclaredLoadout` restricts its existing weapons. `createEncounter` draws initiative. |
| Atomic commit | Encounter state, command receipt and consumed proposal commit in the existing transaction. On creation failure, the transaction rolls back and the saved plan remains pending. Cancellation remains explicit. |
| GM turn | Existing `orchestrateCombat` advances the NPC through legal movement/preparation until a player response, turn completion or genuine blocker. It never chooses a player action. |
| Narration and UI | The verified packet narrates recorded movement and the actual pending attack. Range, held weapons and initiative reflect persisted state in Combat. Detailed dice stay in their existing interfaces. |

Explicit statements such as **immediately outside The Hollow Watch**, **in the same/current hex**, **this is a local scene, not a journey**, and **keep the campaign hex unchanged** are accepted when facts do not contradict them. Removing a recognized denial does not remove a whole sentence: **not a journey; travel to W24** still requests travel. A different explicit hex and a player-known distant site take precedence over a generic local claim. Unanchored “a road near The Hollow Watch” can still ask one genuine local-scene question.

The reproduction creates exactly Edrus and one bandit. `equipped with a broadsword only` selects the existing verified Broadsword; `has no sling, bow, or other ranged weapon` cannot silently leave Sling equipped. Controlled catalog aliases are reused. A selected weapon also explicitly excluded produces a loadout clarification. An unavailable weapon is never supplied from another template. Player equipment/consumable statements do not act as NPC loadout restrictions. The existing limitation on assigning distinct equipment to multiple enemies remains.

The saved proposal retains starting range **NEAR**. If the NPC draws first and legally Runs, current encounter range becomes **ARM'S LENGTH**, with `from: Near`, destination, cost and actor in the existing action log. These represent starting and current facts rather than contradictory states. The bandit pays a fast Run and a slow attack, then waits for Edrus's pre-roll defensive choice. It does not roll the attack before that decision or invent a ranged weapon. Resolving a miss completes the enemy turn and gives Edrus the next legal turn.

No campaign hex, location, date, weather, journey, exploration or character record is edited to make a local scene fit. The local description belongs to the combat record. Existing push consequences and player-managed damage retain their existing behavior.

## Initiative and failure reporting

There is **no natural-language initiative override** in production. A declared first actor is preserved as an optional `initiativeRequest` in the proposal. The encounter stores an `initiativeNotice`, shown as a fixed narration event and in Initiative order: a requested actor cannot override numbered-card initiative, and the notice identifies who actually drew first. The same prompt starts immediately with normal initiative; it does not pretend the requested bandit-first result occurred.

Older held plans without the new intent field recover it from their saved original declaration on resumption. A restart regression removes the optional field to verify this compatibility. When a first-actor request exists, both the opening event and initiative notice are fixed verified narration; an adversarial model beat claiming the bandit acted first cannot contradict the actual player-first draw.

The existing `tests/fixtures/combat-narrative-random.mjs` is a **test-only** server-dice preload, never imported by production code. Tests use its `[2, 1]` draw sequence (Edrus card 2, bandit card 1) to exercise automatic NPC movement. A separate `[1, 1]` index sequence draws Edrus card 1 and the remaining card 2 for the bandit, proving the text cannot force the enemy first. Neither test edits initiative after creation.

| Failure | Player-facing behavior |
| --- | --- |
| Required participant, enemy count or range missing | Existing concise setup question identifies the missing facts; complete plan fields are retained. |
| Travel / geographic contradiction | Explicit location/hex explanation asks for local correction or completion of travel separately. |
| Requested initiative override | Combat starts with normal initiative and an explicit notice, without an unrelated location question. |
| Unknown, unavailable or contradictory loadout | `combat_loadout` identifies the equipment issue; nothing is equipped and the held plan remains. |
| Existing active encounter | Names the active encounter and requires ending it before a new one; participants and initiative are preserved. |
| Unexpected setup/creation exception | Safe `combat_setup_failed` error with the existing request identifier/retry interface. SQL, paths and raw exception details are not shown. |
| Missing authorized source evidence | Existing evidence error and permissions remain; no synthetic statistics or fabricated rule replaces the book. |

Same-request receipts replay setup, creation and orchestration. Repeated affirmative messages against an already used plan cannot create another encounter. The latest saved proposal is retained as history; only successful creation consumes a pending plan. Internal creation failure is tested by interrupting the actual SQLite insert, checking rollback and retrying that same request.

## Verification

- **Before changes:** the required retrieval gate passed 339 unit tests and 106 actual-PDF integration tests. The temporary baseline-parser reproduction returned the exact reported location question.
- **After changes:** `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check` passed **352 unit tests and 114 actual-PDF integration tests**, with zero failures or skipped tests. The final required run completed after the workspace reconnect. Both original books were extracted and indexed by the actual application library; no synthetic book replaced either one.
- **13 browser suites passed:** `test:encounter-activation`, `test:combat-mobility`, `test:dice-chat`, `test:equipment-catalog`, `test:roll-timing`, `test:pending-encounter`, `test:encounter-fidelity`, `test:combat-narrative`, `test:combat-workflow`, `test:combat`, `test:persistence`, `test:dice-repair` and `test:roll-gm`. The ten combat/activation suites use both original PDFs. The production persistence, dice-repair and roll-submission suites retain their existing scoped fixtures.
- `npm run build`, `npm run typecheck` and `git diff --check`: **passed**. Production browser tests ran against the completed build.
- The focused setup/compatibility/roll-timing group also passed all 59 tests, including restart of a saved proposal without the newly optional initiative field.

The new main-chat browser test enters the complete reproduction once, without a panel/slash start, precreated encounter or post-creation initiative edit. It verifies exact participants, the source-backed Broadsword-only loadout, the NEAR starting proposal, legal fast Run/slow attack declaration, no premature enemy dice, the actual defense/miss/next-player-turn flow, current panel range and held weapons, refresh, server restart, saved affirmative resumption, replay, same-hex clearing, genuine location and equipment errors, unchanged campaign/character/journey facts, and mobile layout. A second draw establishes Edrus first despite the requested bandit-first order.

Actual-source integration cases additionally verify SQLite reopening, source-backed enemy equipment, a fixed initiative notice under adversarial model prose, existing-active-encounter safety, and a forced internal insert failure followed by atomic same-request recovery. Unit cases cover explicit local phrasing, travel negation followed by a real travel request, contradictory hexes/known locations, controlled equipment aliases/exclusions, unavailable equipment, and separation of player equipment from enemy restrictions.

The older persistence test initially targeted the removed chat dice-card Push button. It now pushes on the character sheet, checks restored records under Recent Dice Rolls, and verifies that no full dice card returns to narrative chat. Its campaign settings, chat, journal, full-session restart equality, create/load/import/export, cancelled/confirmed reset, optimistic-write conflict and original-record-preservation checks remain and passed.

All tests use isolated temporary databases and controlled providers/dice. No paid API calls were made, and the live campaign was not altered. Test screenshots are private temporary artifacts, including `/tmp/ravenland-encounter-activation.png`.

## Files changed

| Purpose | Files |
| --- | --- |
| Negation-aware locality and conflict checks | `src/server/combat/setup-intent.ts`, `src/server/combat/setup-scene.ts` |
| Preserve first-actor intent in the existing plan | `src/server/combat/setup.ts` |
| Restrict verified NPC equipment | `src/server/combat/loadout.ts` |
| Safe setup failures and truthful initiative notice | `src/server/combat/service.ts`, `src/server/combat/narrative.ts` |
| Optional persisted/public notice and current panel | `src/lib/combat/types.ts`, `src/server/combat/store.ts`, `src/components/combat-panel.tsx` |
| Focused unit, original-PDF and browser coverage | `tests/encounter-activation.test.ts`, `tests/encounter-activation-real.ts`, `tests/encounter-activation-browser.cjs`, `tests/fixtures/encounter-activation.ts`, `tests/combat-real.ts` |
| Existing persistence regression follows the current sheet-push and Recent Dice Rolls controls | `tests/persistence-browser.cjs` |
| Test command and documentation | `package.json`, `README.md`, `docs/encounter-activation.md` |

New record fields are optional JSON additions. No migration, new dependency, campaign reset, authentication change or dice-engine replacement is required.

## Preview and limits

Restart the updated development server and enter the reproduction prompt in the main chat as Edrus. The authorized original books must already be indexed for that campaign. Combat starts without a location confirmation. The actual initiative draw controls who acts first; when the bandit draws first, it Runs and declares its attack automatically. Answer the pre-roll defensive prompt, then continue through the existing sheet/roll/push/attach/Send workflow.

Natural-language recognition is deliberately bounded. Unclear scene descriptions, unsupported equipment and multi-enemy loadout assignments still require clarification/adjudication. A failed equipment plan can be cancelled or replaced with a new complete encounter request. This phase retains Phase 6.3.2's one-on-one ordinary-ground movement limits; it does not introduce rough-ground automation, a full zone graph or forced initiative. Tests use controlled providers and dice, so they establish the state and narration contract rather than live-model prose quality. No paid API calls were made and no licensed PDF, full extract, private database or user campaign was committed.
