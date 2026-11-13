# Phase 6.2.2 — Pending encounter continuity

## Root cause

The baseline was `493ae96` on `ravenland-ai-gm-prototype`, with a clean working tree. The exact initial request parsed into one bandit, Edrus and NEAR range, then paused for scene confirmation. Passing the exact natural confirmation to the existing parser returned `null`.

The failed path was `AIService.run` → `combatTurn` → `previousSetup` → `parseEncounterSetup` → `encounterScene`. Scene confirmation recognized only a small anchored set of Yes phrases. The full reply was not recognized as an answer or a fresh declaration. `combatTurn` returned `null`, allowing the general AI pipeline to narrate without creating an encounter. That reply saved `combatSetup: null`. Since `previousSetup` read only the latest completed chat's context, the next message could no longer find the original plan. The proposal was first bypassed and then effectively lost from the workflow, even though an older request still contained it.

An ended encounter was no longer mechanically active, but its conversation could still reach the immediate-scene/history context. That enabled old wounded-enemy narration to accompany a failed new setup. A separate parser gap failed to record “No companions are present” as explicit absence, despite correctly selecting only Edrus as a combatant.

These code paths were reproduced locally. The production request/database was not mounted, so this report does not certify additional facts about the original live records. No live campaign was modified.

## Durable clarification and execution

Migration 016 adds `combat_setup_proposals` and `combat_setup_actions`. A proposal retains the original declaration, authorized acting character, participant IDs, excluded/absent companions, enemy types/counts, starting range and proposed/confirmed scene. Its consistency snapshot retains campaign ID, location, hex, campaign revision, latest encounter identity and relevant recorded/declared equipment. Equipment snapshots preserve intent; current character sheets and existing official template lookup remain authoritative at execution.

`prepareEncounterSetup` runs before general narration. Natural confirmation, continuation, scene/range revision, use-current-location, negative answers and cancellation have deterministic handling. A revision changes its field while preserving valid original fields. Negative/unrelated replies retain the proposal and ask one concise question without a general model call. Incidental questions mentioning a character/enemy and unchanged incidental statements cannot resume a fully prepared plan held after an execution failure. Cancellation is terminal; a later confirmation cannot resurrect it. Creating an explicitly new proposal supersedes the old one.

Pending state survives refresh and server restart. A bounded compatibility lookup can recover a pre-migration proposal from the last 30 completed character chat requests, even if a later reply saved null context. It stops at the latest encounter boundary or an explicit cancellation and never resurrects a proposal once durable lifecycle history exists.

Before starting, existing character access is checked again, along with campaign identity, proposal revision/status, current location/hex, latest encounter identity, valid participants, enemy/count limits, range and existing source-backed template availability. Ordinary chat revisions alone do not force another scene confirmation. Location/hex or intervening encounter changes require reconfirmation when appropriate. An active encounter cannot be overwritten.

The existing combat transaction creates the encounter, saves initiative, marks the proposal consumed with the actual encounter ID and stores the command receipt atomically. No second engine or dice system was added. Missing official template evidence leaves the plan pending. A narration failure after creation can retry the existing mechanical receipt without recreating the encounter or redrawing initiative. Both same-request replay and repeated confirmation with a new request ID are covered.

## Scene and narration boundaries

An explicitly local courtyard/road within or just outside the saved location can proceed without a question. Bare “near” remains ambiguous. Setup does not change campaign location, hex, time, resources, or player sheets.

Current context excludes chat requests associated with ended encounters. For a new explicitly changed scene or explicit companion absences, it also excludes pre-declaration immediate-scene chat, including older unscoped wound descriptions. Ordinary same-scene bystanders remain available when no new scene/absence boundary was declared. Explicit historical recall can still access historical dialogue. Approved memory and actual player-sheet conditions are preserved.

The current-scene contract identifies the active encounter, its participants, scene and original declaration. Old enemy wounds/presence cannot establish the new encounter's state. Previous battle pending-action and completed-roll references are filtered from current encounter context. The existing verified-event narration packet, checks and safe fallback remain in place.

## Files changed

| Area | Files under `ravenland/` |
| --- | --- |
| Durable lifecycle | `src/server/migrations/016_pending_combat_setup.sql`, `src/server/combat/setup-store.ts`, `setup-workflow.ts`, `setup-intent.ts` |
| Existing setup and engine integration | `src/server/combat/setup.ts`, `setup-scene.ts`, `setup-participants.ts`, `setup-enemies.ts`, `service.ts`; optional proposal ID in `src/lib/combat/types.ts` |
| Existing AI routing/context | `src/server/ai/service.ts`, `context.ts`, `provider.ts` |
| New tests | `tests/pending-encounter.test.ts`, `pending-encounter-browser.cjs`, `fixtures/pending-encounter.ts`; three real-PDF cases in `tests/combat-real.ts` |
| Compatibility test updates | `tests/ai.test.ts`, `persistence.test.ts` (16 migrations); `encounter-fidelity.test.ts`, `encounter-fidelity-browser.cjs` (natural question wording); `fixtures/ai-provider-preload.mjs` (stale-context assertion) |
| Commands/documentation | `package.json`, `README.md`, this report |

## Verification

Both actual fifth-printing books were available: Player's Handbook (212 PDF pages) and Gamemaster's Guide (268 PDF pages). Before changes, all **57** required real-sourcebook integration tests passed. After changes, the retrieval gate passed **309 unit tests and 60 real-sourcebook integration tests**, with none skipped. The nine new unit tests cover full-plan restoration, natural confirmation, database reopen, refusal/unrelated chat, single-field revisions, cancellation/replay, consistency changes, authorization, local scenes and legacy recovery.

The three added real-sourcebook tests cover fresh identity/state after an ended wounded encounter, unavailable-template recovery with atomic consumption, and narration failure/retry after creation. All use isolated databases and the real indexed sources.

All **13 browser suites** passed: `pending-encounter`, `combat-narrative`, `encounter-fidelity`, `combat-workflow`, `combat`, `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation`, and `windows`, run as `npm run test:<name>`. The first five index both actual PDFs. Older synthetic-fixture browser suites provide additional regression coverage. Production build and TypeScript checks passed.

The new integrated browser test wounds an old bandit with a real character-sheet Dagger roll, ends that encounter through Combat, sends the exact two-message reproduction, and refreshes before confirmation. It verifies the same proposal is consumed, exactly one fresh bandit and Edrus participate, NEAR and the forest-road description are preserved, the other three companions remain absent, the new ID differs, and no previous damage/history leaks. It checks the Combat panel and narrated opening, repeat confirmations, active-encounter protection, No/unrelated replies, revision, cancellation, direct local-scene setup and unchanged campaign/character records.

Browser model responses and dice are controlled for reproducibility; no paid production-model calls were made. PDFs, full extracted text, uploads and test databases were not committed. All execution used temporary private storage.

## Remaining limitations and setup

- Restart the server once to apply migration 016 automatically. Existing campaign data needs no manual conversion; very old pending plans outside the bounded recovery window need a fresh declaration.
- Natural setup remains a bounded recognizer. Unsupported phrases, ambiguous locations, enemy types without verified templates and complex loadout edits can require clarification or existing manual controls. No arbitrary NPC statistics or equipment modifiers are invented.
- Unrelated chat while a plan is pending receives a brief hold/clarification response; cancel the plan to return to ordinary conversation.
- Existing combat mechanics, unsupported-maneuver adjudication and player-managed sheets are unchanged. This phase does not broaden combat automation, source permissions or authentication.
- Context boundaries and existing narration checks reduce stale-state leakage; controlled browser tests are not a guarantee of every possible production-model phrase. The saved engine state and verified event packet remain authoritative.
