# Phase 6.1: combat workflow and UI repair

November 12, 2026 (America/Chicago).

## Root causes and evidence

1. **Unintended participants:** `createEncounter` iterated over the entire campaign roster. The service had no participant argument, so even a one-on-one request could create four player combatants. The existing enemy policy then selected from that enlarged set, preferring a character with lower current Strength. That explains the mechanism by which an unintended character could become a target; no historical Rose attribute value is assumed. The earlier combat browser fixture contained only one campaign character and therefore missed this defect. The new browser fixture retains four characters while testing different encounter subsets.
2. **Competing GM instructions:** the combat adapter recognized `/combat` commands and certain actions in an already-active encounter. A conversational request to start an encounter could reach ordinary GM generation without creating authoritative combat state. In addition, ordinary conversation during combat could still return quarter-day proposals because action filtering was guarded only for handled combat commands. The repair routes supported natural encounter declarations into the combat service and blocks quarter proposals throughout active combat, including confirmation of previously generated proposals.
3. **Initiative:** the existing engine already drew numbered cards correctly. The general conversation path could operate without that order. It now receives the actual participant-specific order and workflow, and initiative/current-step questions return an application-controlled response. Protected policy v1.12 explicitly preserves card initiative.
4. **Unclear pending steps:** the panel primarily printed internal phase strings and target names. It did not identify the exact requested skill/responder or open the sheet for that person. It could remain collapsed, offered broadly computed defenses, refreshed only after successful requests, and did not discard older overlapping fetch results.
5. **Roll finalization before combat validation:** `AIService.claim` marked a verified saved roll Submitted before the combat engine checked whether it matched the pending action. The subsequent error was generic. A wrong owner, skill, type, time or step could therefore leave an unusable finalized roll even though combat did not consume it. The shared pending-step validator now runs before finalization and again at binding.

There is **no live campaign database in this checkout**, so the exact original failed submission cannot be classified retrospectively as wrong character, wrong skill, stale action, or a synchronization race. The reported combination of an attack targeting Rose and an Edrus defense is reproducible as an owner/target mismatch. Actual browser tests also reproduce wrong-skill rejection. Both remain unconsumed and recover without restarting the encounter. The refresh changes address identified synchronization risks; they are not claimed as proof of the historical cause.

## Workflow changes

- The encounter constructor requires a nonempty, unique set of actual character IDs. It never chooses the whole roster by default. Existing numbered-card initiative and combat mechanics are reused unchanged.
- The compact setup form lists campaign characters with checkboxes, initially selecting ACTING AS. The server uses those selected IDs. The legacy internal start command defaults to its acting character, with explicit lists retained for compatibility.
- Natural declarations such as `Start a one-on-one encounter between Edrus Braveheart and a bandit at Near range` or `Edrus and Rose fight two bandits at Near` resolve actual saved character names/unique first names. No example names or IDs are hardcoded into application logic.
- Missing participants, enemies or range produce one concise clarification before any initiative is drawn. The draft uses the existing saved AI request context, so a short answer after refresh can complete it. Full-party language uses explicit names, an explicit roster-size confirmation, or established presence; membership in the campaign roster alone is insufficient. Explicitly absent characters are excluded.
- Ordinary combat continuations and defense declarations can use normal chat or the existing buttons. Players do not need to type internal commands. General nonmechanical conversation remains available with current combat context.
- The panel opens for a new encounter/step and shows round, active combatant, action, target, exact responder, legal decision/skill/armor request and remaining actions. Initiative and raw GM dice stay in compact collapsible details. A responder can open their existing sheet or switch ACTING AS using existing controls.
- Chat and the panel share the same server-derived workflow projection. A pending attack is presented as an attempt awaiting a decision or verified roll, not a resolved hit. Recorded defenses are acknowledged and are not requested again. Slash/Stab defensive modifiers remain visible where appropriate.
- Quarter-day controls/proposals pause during active combat. Starting combat does not advance the date, quarter-day, location or weather. Existing quarter-day records remain intact and become usable again afterward.
- Failed submissions refresh the panel as well as successful ones. Fetch sequencing prevents a late response from replacing a newer state.

## Roll validation and recovery

The existing server verifier still checks ownership, saved ID/fingerprint, category faces, successes, push constraints and snapshots. `checkCombatRoll` then validates the pending combat action, requested responder, recorded defense, expected skill/weapon or armor type, timing, pool constraints and already-consumed status. The same function is used at claim and final binding; validation was not relaxed.

An error now names the requested character and roll, attacker and actual submitted character/type, followed by `The roll was not consumed.` Wrong records retain their previous Pending status; combat actions, dice, wounds and consumption history remain unchanged. The player can open the expected character's sheet and submit the correct roll against the same pending attack. An unrelated roll is not reassigned to another character. Existing replay receipts prevent a completed roll from resolving twice.

## Files modified

- `src/server/combat/setup.ts`: bounded natural setup recognition, participant resolution and saved clarification loading.
- `src/server/combat/workflow.ts`: shared pending decisions/rolls, legal defense projection, narration guidance and precise pure roll validation.
- `src/server/combat/engine.ts`: explicit constructor participants; delegates binding validation to the shared validator. Dice, initiative ordering, damage and armor math are preserved.
- `src/server/combat/service.ts`: setup/chat routing, explicit participant propagation, current-step replies and shared workflow narration.
- `src/server/combat/store.ts`, `src/lib/combat/types.ts`, `src/app/api/combat/route.ts`: typed, sanitized public workflow derived from the existing encounter and character records.
- `src/server/ai/service.ts`: validation before finalization, authoritative combat routing, clarification context and quarter-day suppression/confirmation guard.
- `src/server/ai/context.ts`, `instructions-v1.ts`: actual combat workflow/order and protected policy v1.12.
- `src/components/combat-panel.tsx`, `campaign-app.tsx`, `src/app/globals.css`, `src/hooks/use-gm.ts`: compact setup/current step, sheet/actor navigation, quarter-day pause and reliable refresh.
- `tests/combat-workflow.test.ts`, `combat-workflow-browser.cjs`, `fixtures/combat-workflow-setup.ts`, `fixtures/combat-workflow-random.mjs`: new participant and full-browser regression coverage. The SDK fixture has an isolated, opt-in adversarial combat case.
- `tests/combat.test.ts`, `combat-real.ts`, `ai-canon.test.ts`: existing checks adapted to explicit participants, typed nullable clarification results and clearer errors; mechanical/source assertions retained.
- `package.json`, `README.md`, this report and the Phase 6 report: test entry point and current workflow documentation.

No new database, migration, authentication, player record, dice engine, tactical map or journey mechanic was introduced.

## Verification

Executed checks:

- **268 unit tests passed**, zero failures/skips.
- **44 real-sourcebook tests passed**, zero failures/skips, using both actual supplied fifth-printing PDFs. The same 44-test real suite passed before the change. The final real suite was rerun after the workspace reconnected.
- **Nine browser suites passed:** `test:combat-workflow`, `test:combat`, `test:submitted-attacks`, `test:roll-gm`, `test:action-safeguards`, `test:character-awareness`, `test:gm-situation`, `test:ai`, and `test:dice-repair`.
- `npm run build` and `npm run typecheck`: passed on the final implementation.

The Handbook (212 pages, 243 chunks, Public Rules) and Guide (268 pages, 373 chunks, GM Only) were uploaded, extracted and indexed in disposable private stores. The complete browser workflow uses those actual indexed books. No paid API call was made, no live campaign was modified, and no licensed book/extraction/database fixture was added to Git. Existing automatic Longbow damage, source permissions, memory/Journal recap, scene continuity, roll/push behavior and character ownership regressions passed.

The new real-PDF browser workflow covers one-on-one, two-player, partial-party/multiple-enemy and full-party encounters; absent/unintended character exclusion; authoritative card initiative; rejected adversarial quarter proposals; active/pending UI; legal pre-roll Dodge; refresh while waiting; wrong-character and wrong-skill errors with untouched Pending records; recovery with an actual character-sheet Move roll; real Recent Dice Rolls submission; duplicate replay; continued combat; unchanged player sheets/clock; persisted clarification after refresh; and mobile controls. SDK output and random values are controlled only by test preloads, never production switches.

## Remaining limitations

The original Phase 6 enemy/mechanics coverage is unchanged. Unsupported creatures, complex monster effects and advanced movement/initiative still require review; this repair does not turn Phase 6 into a complete tactical simulator. In particular, complex special-procedure pauses still lack a general in-application adjudication/resume path.

Natural-language setup recognition is intentionally bounded to actual character names/unique first names and recognized enemy descriptions; other phrasing can use the compact participant form. Unsupported enemies are not given invented statistics. Scene presence is accepted only through supported explicit evidence; ambiguous participation asks before initiative.

Previously saved encounters that already contain unintended participants retain their original history. End that incorrect encounter and start one with the intended participants; the repair does not silently delete combatants or retarget a historical attack. Invalid-roll recovery within a correctly configured pending encounter does not require restarting it. Paid-model narration quality has not been tested live.
