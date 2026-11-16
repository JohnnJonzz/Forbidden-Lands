# Phase 6.4: AI Game Master action interface

Natural-language player combat declarations now enter a structured interpretation step. The model proposes intentions; the existing deterministic combat engine decides what happens. Character sheets, dice attachments, source verification, encounter setup, enemy tactics and SQLite records remain authoritative.

## Architecture and replacement boundary

`AIService.run` routes active-encounter chat through `playerActionTurn` before the legacy orchestrator. The existing configured OpenAI provider returns strict structured output. A conversational response continues to the existing guarded GM conversation; it does not run a second player combat parser. Encounter creation/clarification, lifecycle recovery and explicit legacy slash commands retain their existing orchestration paths. Outside combat, existing rules retrieval and character-aware guidance are unchanged.

Previously, `combatTurn` mixed phrase recognition with execution and selected a single command. A recognized movement branch could consume a compound declaration before its attack was handled, while longer movement paraphrases missed the parser. Player Ready/Load also lacked authoritative persisted prerequisites. The new boundary separates interpretation from those existing mechanics.

The production interface does not add a phrase dictionary. The finite paraphrase responses in `tests/fixtures/action-interpretation.mjs` belong exclusively to the intercepted SDK test transport.

| Module | Responsibility |
| --- | --- |
| `src/lib/combat/action-intents.ts` | Strict shared Zod intent contract and structured step outcomes |
| `src/server/combat/action-context.ts` | Authorized selected-character context with actual encounter, actor, target and weapon references |
| `src/server/combat/interpret-actions.ts` | Validate and freeze a model interpretation in the existing request audit |
| `src/server/combat/action-turn.ts` | Route chat/direct controls, check stale state, resume the existing enemy controller when appropriate |
| `src/server/combat/action-dispatcher.ts` | Atomically commit an ordered legal prefix and its replay receipt |
| `src/server/combat/player-actions.ts` | Dispatch into existing movement, attack, defense and initiative services |
| `src/server/combat/player-weapons.ts` | Stable row references and persistent held/readied/loaded prerequisites |
| `src/server/combat/prepare-attack.ts` | Character-sheet attack preparation through the same dispatcher |
| `src/server/ai/provider.ts`, `service.ts` | Existing model/Responses SDK, usage tracking, verified narration and request lifecycle |
| `src/components/combat-panel.tsx`, `/api/combat` | Current authorized action context and direct recovery controls |

Additional integration changes extend `WeaponHandling` and attack-preparation types, interrupt bow readiness through the existing action economy, consume preparation when a verified shot is bound, restrict weapon Parry to held rows, and validate the optional typed control payload in the existing GM request schema. No migration, new character model or parallel pending-action table is introduced.

## Typed interpretation contract

The root is `{ encounterId, actorId, disposition, actions, message }`. `disposition` is `actions`, `conversation`, `clarification` or `unsupported`. At most four ordered steps are accepted:

- `move { targetId, to }`: Arm, Near, Short or Long; the existing movement validator determines which transitions are actually supported.
- `draw_weapon`, `ready_weapon`, `load_weapon { weaponRef }`.
- `prepare_attack { targetId, weaponRef, attackType }`: Slash, Stab, Shoot, Punch or null for a missing voluntary choice.
- `end_turn`.
- Existing `declare_defense { defense }` and `stand` controls.
- `clarify { question }` to stop after a clear completed prefix and request a missing decision.

All objects reject unknown properties. No dice results, successes, damage, action costs, inventory changes or arbitrary code can be supplied by the model. Actual target/weapon references are checked before model intentions reach execution. The dispatcher independently revalidates current equipment, target, actor, initiative, pending step, range and action budget.

The context includes the selected authorized actor, authorized character names/IDs, public combatants, shared range and ground condition, remaining actions, actual inventory row references, held/readied/loaded/ammunition state, and the existing pending attack or Slash/Stab draft. Unarmed is a separate combat option. It excludes other players' private sheets, character secrets, private NPC statistics and sourcebook text. Existing trusted-local identity and hosted character grants remain in force; client IDs never grant ownership.

## Ordered execution and narration

Each step executes on a copy of the current encounter. A successful copy becomes the next state; a failed copy is discarded. The completed prefix and receipt commit in one SQLite transaction. A wait or failure stops the sequence. Outcomes include the step index/type, `completed`, `awaiting_input` or `blocked`, a safe error code and a specific message.

For a held Shortsword at NEAR, “Move to arm's length and attack Bandit 1 with my shortsword” commits Run, changes range to ARM'S LENGTH, spends the fast action, and retains a Slash/Stab draft without spending the slow attack. Selecting Slash/Stab commits the existing pre-roll enemy defense and waits for the player. The sheet's matching weapon icon stages that pending attack automatically.

If the sword has not been drawn, movement still commits and preparation reports the missing held state. A separate Draw consumes another action. Draw + Run uses the fast slot and the slow slot as a second fast action, so an attack cannot also occur that turn. This is intentional, not a free initialization grant. Characters do not automatically end their turns after spending their actions.

The existing verified event packet controls narration. Free-text interpretation prompts also pass through the existing conversation guard; they cannot act as a substitute outcome record. Unsupported, malformed or unavailable interpretation yields a concise explanation and leaves direct Combat controls and sheet preparation available. No fallback player parser invents a replacement action. Full dice remain in Recent Dice Rolls and Combat audit.

## Weapon state and verified rules

Player state lives inside existing `CombatEncounter.weaponHandling`: actual held indexes, active index and preparation keyed by row. A reference binds the character, row index and canonical weapon identity/skill. Gear wear from a saved push does not invalidate holding; changing/removing a held identity blocks conflicting preparation rather than silently freeing a hand. Shield/hand conflicts also stop for adjudication.

Missing legacy preparation is unestablished, not evidence of a drawn weapon. Draw costs a fast action; a slow slot may be used as a second fast action. Ready is fast for supported bows/slings; Load is slow for crossbows. Movement, defense and other supported non-shoot actions interrupt bow readiness. Loading survives turn changes. Readiness/loading is consumed only when the existing engine binds the verified compatible shot, not by merely selecting an attack or refreshing. Existing pending legacy attacks can finish through their recorded dice workflow.

Original fifth-printing Player's Handbook evidence used by the existing verifier:

| Physical PDF page | Printed page | Procedure |
| --- | --- | --- |
| 89 | 85 | One slow + one fast, or two fast actions |
| 92 | 88 | Run and supported range transitions |
| 97 | 93 | Draw Weapon |
| 98 | 94 | Retreat with Move; failed retreat/free attack |
| 101–102 | 97–98 | Ready, Load and Shoot |
| 104 | 100 | Grip and shield handling |
| 105–107 | 101–103 | Official weapon tables |

Both authorized original books are required by the combat/source regression suite. Existing source permissions, house-rule precedence and saved push-wear verification remain intact. Conflicting or unsupported house rules still require review. Ammo state distinguishes empty, unknown, available resource dice/quantities and untracked sling supplies; it is context and a preparation prerequisite. The interface never deducts provisions or ammunition, changes sheet equipment or applies player damage. Existing dice/push effects continue exactly once.

## Dice, idempotency and retries

Prepare → Roll → Optional Push → Attach → Send is unchanged. Direct sheet preparation, typed buttons and saved-roll submission do not call the interpreter. Direct typed controls also use canonical narration and the existing deterministic enemy policy without a new narration/model decision call. Plain chat may use the existing optional enemy chooser and verified narrator. Interpretation and enemy-choice usage are recorded through the existing usage service.

A validated interpretation is frozen in `combat_commands` using a namespaced hash of the existing request ID and a fingerprint of the original request. The dispatch uses its own namespaced receipt containing outcomes, checkpoint and authoritative result. Original request IDs are included in the interpretation receipt. Reusing an ID with different parameters is rejected.

Retries replay the original interpretation and completed prefix, even after later combat actions. Pending decisions and rolls use the existing `pending`/`actionDraft` fields and survive refresh and SQLite reopening. Existing committed encounter envelopes replay before attempting interpretation. State changed while a new interpretation was in flight causes a specific conflict rather than executing stale intentions. Enemy continuation has a stable child request ID and cannot advance a later unrelated turn on retry.

An unavailable or malformed interpretation commits no combat actions. Its actionable fallback can be saved as the completed chat response; after fixing model availability, send a new declaration or use direct controls. Replaying that completed response deliberately does not make another paid call.

## Verification

Automated tests use isolated temporary databases, actual private sourcebooks, controlled SDK responses and controlled dice. They do not call a paid model, edit the live campaign, publish source text or commit PDFs.

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:action-interface
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:dice-chat
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:combat-mobility
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:roll-timing
npm run typecheck
npm run build
```

New coverage resides in `action-interface.test.ts`, `action-interface-real.ts` (included by `combat-real.ts`) and `action-interface-browser.cjs`. Older integration/browser setups now perform an actual costed Draw instead of relying on carried-as-held assumptions. `player-weapon-controls.cjs` exercises the actual deterministic endpoint for those setups; it never grants held state by editing JSON.

The browser suite covers the exact compound declaration, five movement paraphrases/named actor, Draw/Move/action exhaustion, Slash/Stab, Ready/Shoot, Load/Shoot, sheet/push/attachment, malformed/invented references, direct controls without interpretation, exact replay, browser refresh, server restart, range/history/panel updates and mobile width. Integration tests also check unauthorized access, out-of-turn/pending conflicts, missing equipment, zero/unknown ammo, source evidence and SQLite reopen.

## Executed results

| Check | Result |
| --- | --- |
| Before-change baseline at `6d6ec5f` | 352 unit tests and 114 real-PDF integration tests passed |
| Final `test:retrieval-check` | 370 unit tests and 127 real-PDF integration tests passed; zero failures/skips |
| Original private PDFs | Both fifth-printing books available and tested: 212-page Handbook and 268-page GM Guide |
| Actual-PDF browser suites | All 10 passed: action interface, dice chat, equipment catalog, mobility, roll timing, encounter fidelity, pending encounter, narrative combat, encounter activation and combat workflow |
| Additional browser suites | Persistence and dice repair passed against the production build; roll-to-GM passed using its existing controlled development server |
| TypeScript and optimized production build | Passed |
| Paid live-model smoke | Not executed; manual procedure below |

The earlier browser failures were corrected without granting free state: older attack setups now Draw through the actual endpoint; a defense scenario establishes its weapon on an earlier real turn so a reaction remains available; wording checks follow the new specific messages. The pending-setup test still forbids general narration while setup is pending, while permitting ordinary guarded conversation in an already active encounter. The action-interface test waits for the asynchronous Combat panel refresh before asserting displayed range.

## Manual live-model smoke test

This procedure is optional and incurs the configured provider's usual API charges. Automated tests intercept the SDK; this procedure intentionally uses the real configured model.

1. Start a separate local development process with a new persistent `RAVENLAND_DB_PATH` outside the live database and Git. Use `npm run dev -- --port 3100`. Do not set test preload `NODE_OPTIONS` or any `RAVENLAND_*_TEST`, fixture-log or fixture-dice variables. Configure `RAVENLAND_AI_MODE=openai`, `OPENAI_API_KEY` and the existing `OPENAI_MODEL` server variable, then restart. Keep the key only in the server environment or ignored `.env.local`; do not copy it into chat or records. See the main README for local/hosted access boundaries.
2. Create a disposable campaign in the UI. Upload/index your authorized original fifth-printing Handbook and GM Guide through the Sourcebooks library with their existing official roles/permissions. Check indexed status. Use your campaign's actual Acting As character and recorded weapon values; do not copy fabricated IDs from this report.
3. Record a Shortsword, Longbow and Heavy Crossbow through the existing sheet controls if testing all three; record available arrows for bow/crossbow tests. Do not change a production character. Start a clearly local one-on-one encounter at NEAR. Initiative is real: wait/resolve the actual enemy turn as necessary; no “player acts first” production override exists.
4. Establish the weapon through “I draw my shortsword.” This spends the real fast action. To test Move + Attack with both slots available, enter the next own turn with that same sword held and the target still at NEAR. Use an explicitly equipped ranged foe if it must stay at range; a sword-only foe may legally close. No manual range change is needed or permitted by this test.
5. Send “Move to arm's length and attack Bandit 1 with my shortsword” using the actual enemy's name. Verify committed Run/range/fast cost and the Slash/Stab question. Choose the type, open the sheet, stage, roll, optionally push, attach and Send. Confirm only the saved result resolves once and no full dice card is inserted in chat.
6. In fresh encounters/own turns, test “Draw my sword and approach,” “Move closer to the bandit,” and a named-character paraphrase. Verify order and action exhaustion. With a previously held bow, “Ready my longbow and shoot” spends fast + slow and waits for sheet dice. With a previously held crossbow, “Load my heavy crossbow and shoot” loads but reports no slow attack remaining; explicitly end the turn and use the loaded weapon on a later turn if legal.
7. Refresh before rolling and restart after a completed Draw/Load. Confirm state remains. Replay the exact captured request through developer tools with the same request ID: no second interpretation, movement, roll consumption or damage should occur. A new message with a new ID is a new declaration.
8. Temporarily make the provider unavailable in this disposable process and send a new action. Confirm the fallback does not move or spend actions and direct Combat controls still work. Restore configuration and send a new declaration. Inspect request IDs, usage records and authoritative combat history without logging keys or private prompts.

## Remaining limits

The existing one-on-one shared-range representation remains; no full tactical map/zone graph, rough-route automation, multi-opponent positioning, guessed LONG distances, free Drop/Stow, weapon-swap planner, unsupported combat maneuvers or exploration/inventory action execution was added. Unknown handling costs require adjudication. More than four ordered steps require separate declarations. The selected Acting As character stays fixed; the model cannot choose another player's actor. Generic Slash/Stab decisions persist in the existing draft; other ambiguous declarations may need a clearer follow-up rather than automatic completion. Live-model interpretation quality and latency require the optional smoke test; controlled browser tests do not establish live-model quality.
