# Phase 6.5.2 — Post-combat scene routing

## Root cause and trace

The obsolete response is selected in `prepareEncounterSetup`, before Phase 6.5.1 world-action selection:

1. `AIService.run` claims the chat request and calls `playerActionTurn`. With no active encounter, that player-combat interpreter returns unhandled.
2. `orchestrateCombat` calls `combatTurn`. With no active encounter or explicit `/combat` command, it calls `prepareEncounterSetup`.
3. Previously, `setupContinue` matched **any message starting with `Continue` followed by a space**, including “Continue the current scene.”
4. `prepareEncounterSetup` admitted that message when `latestSetup` returned any old row, even though neither an actual pending row nor a new encounter request existed.
5. Its `!pending && last` branch returned “That setup is no longer pending” for cancelled/superseded rows, or “That setup has already been used” for resumed rows, and saved a setup receipt.
6. The non-null combat result selected that narration and prevented `worldTurn` from running. The consequence narration guard then appended the still-correct lethal-injury reminder. The reminder did not indicate that NPC execution had happened.

An actually pending row had a related problem: unrelated messages were parsed as plan revisions, or fell back to repeating the held-plan question. NPC/enemy mentions could therefore capture conversation that did not answer a setup question.

The exact long live prompt also exposed a second routing conflict: `planRetrieval` classifies its references to Broken and critical injuries as `rules_reference`. After fixing setup interception alone, `AIService` still skipped world actions and returned the generic missing-rule response. This was reproduced with the supplied long prompt as well as the short acceptance prompt. The global rules planner is unchanged; explicit scene/workflow continuation takes precedence at the service boundary.

The actual-main-route browser check also exposed a provider-output extraction bug: the world chooser read only `response.output_text`, while the SDK response can carry text in `response.output[].content[]`. The existing combat chooser already supported both forms. The world chooser now uses the same fallback, with a regression using the actual SDK transport. This is a response-reading repair, not a new provider or execution mechanism.

These causes were reproduced with isolated pending, cancelled, superseded and resumed setup rows. No live setup row or SQLite campaign was inspected or modified to obtain the result.

## Routing changes

- `setupContinue` accepts short confirmations for a real pending question and direct references to an encounter/setup/proposal/plan. It no longer treats “Continue the scene/aftermath” or an incidental later mention of an encounter as confirmation.
- `setupResumeRequested` controls obsolete-plan diagnostics. A generic “yes” or bare scene continuation cannot resurrect an old row. Explicit old-plan requests retain the duplicate/cancelled diagnostic, and exact saved setup request IDs retain receipt replay.
- `relevantSetupReply` limits pending-plan handling to actual confirmation/refusal/cancellation, explicit field edits or answers filling fields that the plan lacks. Unrelated conversation leaves the plan unchanged and returns unhandled to the caller.
- `encounterSetupRouting` is shared by `combatRouting` and `prepareEncounterSetup`, so the early authorization/routing decision and executor agree. Explicit world-scene continuation bypasses incidental field matches; explicit new encounter requests and saved request receipts retain precedence.
- `worldContinuationRequested` identifies only the requested workflow: scene/aftermath continuation or a direct GM request to choose/decide. It does not interpret NPC actions, durations or outcomes. `AIService` allows those explicit requests through to the existing typed world decision loop even when the generic retrieval planner calls the text a rules reference.

Lifecycle routing remains:

| Situation | Handler |
| --- | --- |
| Exact saved request replay | Existing request/command receipt |
| Active combat | Phase 6.4 typed player-action and combat orchestration |
| Explicit new encounter or relevant pending setup reply | Existing setup workflow with source, snapshot and confirmation checks |
| Current concluded scene and continuation | Phase 6.5.1 world decision/dispatcher |
| Rules-only question or unrelated exploration/social conversation | Existing ordinary/reference path; no forced setup resumption |
| Urgent consequence overlapping a scene | Existing consequence registry/roll obligations, plus permitted world actions |

A changed setup snapshot still requires confirmation. This fix does not silently discard pending plans, auto-start another encounter, bypass initiative, or change combat lifecycle rules. New encounter requests after an old setup remain genuine new requests.

## Consequence and world-action integration

The current concluded scene, current campaign position, surviving participants, current character conditions, unresolved consequences and established NPC intent continue to come from the Phase 6.5.1 authorized context. This repair changes how that existing handler becomes reachable; it does not create a second context, consequence manager, timeline or action interpreter.

A saved four-round injury with zero elapsed rounds does not block every NPC intention. The GM can record a supported observation and propose a search. Missing search duration produces the existing specific adjudication requirement. Required injury/treatment rolls remain mandatory. Missing actor/access/item capabilities and provider validation errors retain their own diagnostics instead of an obsolete-setup message.

The dispatcher, atomic event/time handling, replay fingerprints, privacy filters and bounded three-decision loop are unchanged. Ordinary prose cannot advance the clock. A partial world action does not resolve the robbery aftermath or the lethal injury. Historical narration still requires the Phase 6.5.1 reconciliation decision; this patch never replays or backdates a narrated search.

In the isolated Edrus scenario the original ended encounter, Broken sheet, D66 64 critical, four-round saved deadline, zero elapsed rounds, possessions and open robbery aftermath are preserved while the main chat route reaches world selection.

## Files modified for Phase 6.5.2

- `src/server/combat/setup-intent.ts`: distinguish setup confirmation/resumption from scene continuation.
- `src/server/combat/setup-workflow.ts`: request-specific pending-plan gate and shared routing predicate.
- `src/server/combat/service.ts`: use the same predicate for early combat/setup routing.
- `src/server/world/routing.ts`: narrow workflow-continuation predicate; no NPC command parsing.
- `src/server/ai/provider.ts`: read structured world decisions from both SDK response text shapes.
- `src/server/ai/service.ts`: explicit continuation reaches world actions before the generic reference fallback.
- `tests/post-combat-routing.test.ts`: isolated service/routing regressions and SQLite reopen/replay.
- `tests/fixtures/post-combat-routing.ts`: exact prompts and old setup fixtures.
- `tests/post-combat-routing-browser.cjs`: actual main composer and `/api/gm` coverage with restart.
- `tests/fixtures/post-combat-provider.mjs`: controlled official-SDK transport in the isolated test process; rejects unexpected AI routes and never forwards paid requests.
- `tests/pending-encounter.test.ts`: unrelated conversation must preserve a held plan without interception; genuine clarification/cancellation protections remain asserted.
- `tests/pending-encounter-browser.cjs`: update the old assertion that all unrelated conversation had to be captured by setup. Conversation can now reach narration while preserving the plan.
- `package.json`: targeted unit/browser commands.
- `docs/phase6-5-2-post-combat-routing.md`: this report.

Phase 6.5.1 changes already present in this workspace are preserved. Commit and GitHub publishing status are reported separately from this implementation report.

## Regression verification

```sh
npm run typecheck
npm run test:post-combat-routing
npm run test:post-combat-routing:browser
npm run test:retrieval-check
npm run build
```

Recorded results:

- Typecheck: PASS.
- Full unit/regression portion of `test:retrieval-check`: **428 passed**, including **12 new post-combat routing tests**, existing combat/activation/action-interface tests and all Phase 6.5.1 world tests.
- Actual-main-chat browser test: PASS, including controlled SDK output, refresh, replay, reopened SQLite/server restart, and no time or character/encounter changes.
- Production build: PASS.
- `git diff --check`: PASS.
- Required original fifth-printing sourcebook portion: **BLOCKED**. It fails immediately because both private PDF fixtures are absent. Thus the overall `test:retrieval-check` command is not green, and existing book-dependent browser/sourcebook suites were not validated here.
- Live campaign/model verification: not run. No paid calls or live campaign mutations.

The unit tests cover all four old setup statuses, ordinary and explicit continuation, the exact long request, unrelated NPC mentions, genuine clarification, changed snapshots, new encounter requests, concurrent lethal injury and aftermath, specific unsupported-transfer diagnostics, mandatory rolls, malformed provider output, rules-only questions, zero invented time, unchanged sheets/encounter, replay and SQLite reopening.

The browser test uses the **actual main composer and `/api/gm` route**, the real AI service and official SDK structured-output path, and a controlled transport instead of paid model calls. It verifies a recorded observation followed by a pending search, explicit/full continuation with an old setup now marked pending, unsupported-transfer diagnostics, genuine new setup/field clarification, refresh and server restart. All state is in a temporary SQLite database; source evidence is explicitly synthetic.

The full retrieval-check command includes existing player interpretation, encounter activation, combat, dice/defense/lifecycle, consequence and world-action unit regressions, then the required actual fifth-printing PDF suite. Actual PDF validation remains BLOCKED if the private fixtures are absent. This patch does not claim PDF retrieval is fixed or sourcebook integration verified from synthetic evidence.

## Remaining limits and manual observation

- World actions retain Phase 6.5.1's scope: recorded concluded encounters in the authoritative current location; no invented actor membership, arbitrary environmental simulation or NPC inventory.
- Unsupported durations still require a trusted local adjudication. Transfers remain blocked without a safe custody mechanism. Hosted player grants do not become a hosted GM role.
- Explicit continuation is a bounded routing distinction, not a general natural-language classifier. Ambiguous replies to a real setup question retain that question's established context; explicit scene continuation is kept separate.
- Exact old request IDs still replay their original receipt, including an old obsolete-setup reply. Use a **new** request ID for a new continuation after installing this repair; rewriting historical receipts would break replay guarantees.
- A scene with unverified historical NPC prose still requires reconciliation. The repair does not authorize a past search, theft, elapsed round, rescue or death.

For a live observational smoke test, open the existing Edrus campaign and verify Broken, original D66 64 and saved four-round/zero-elapsed deadline. Send the short acceptance prompt or supplied long prompt as a **new chat request**. It should report the actual world result or specific blocker (including historical reconciliation if required), never the stale setup message. Inspect the saved event/pending intention and refresh to verify unchanged elapsed time if no duration was authorized. Do not approve a duration, transfer, treatment or deadline advancement merely to test routing. Those would intentionally change live state. No live-model smoke test or live mutation was run during implementation.
