# Phase 6.2.3 — Natural roll timing and combat synchronization

## Findings

The clean baseline was `55fb7fa` on `ravenland-ai-gm-prototype`. Both actual private fifth-printing PDFs were available and the required baseline sourcebook suite passed all 60 tests. No live campaign database or original playtest request/roll records were mounted. The parser and routing failures below are reproducible from the code and isolated tests; the exact live enemy loadout, final chat packet and action history cannot be certified without those records.

1. `declaredAction` required a leading subject such as “I” or the selected character's name. The exact “Attack with my shortsword” imperative returned null. `combatTurn` therefore returned null, and `AIService.run` could call ordinary narration without any pending engine attack. That explains how the GM could appear to accept the action while the saved roll had no action to bind to.
2. A generic Melee roll and an `Attack: <weapon>` roll were not interchangeable in the old verifier. Attacks required the matching saved weapon index/snapshot. A skill-only pool could therefore also fail after a declaration. For generic Melee submitted with no pending action, the old claim guard allowed it to be marked Submitted before returning an unbound-roll message. This made a workflow rejection look like a completed submission.
3. General gameplay narration could independently ask for a roll, while the Combat panel and submission verifier used `combatWorkflow`. There was no output synchronization boundary on that ordinary narration path. The engine's “No combat action is waiting” was accurate for its state; the preceding AI instruction could be inaccurate. The isolated adversarial-provider test reproduces and now rejects this disagreement, including streamed text before display.
4. `eligibleCombatRolls` silently discarded invalid records, returned several matching outcomes and considered only Pending delivery status. It did not explain early-roll failures, prevent choosing a later compatible known result, or recover a failed pre-binding submission already marked Submitted.
5. A published Bandit template selects Broadsword and Sling. At NEAR, `enemyChoices` excludes the melee weapon and can select Sling. The explicit “armed with a sword” declaration was saved as narrative intent but did not constrain those equipment choices. The sling can thus originate from actual template/selection code rather than invented prose. That does not establish which weapon was used in the unmounted live record.

## Declaration and prompt flow

The existing recognizer now accepts bounded attack imperatives as well as subject-led declarations. It still excludes questions, negations and reported outcomes such as “I hit for 3 damage.” Actual character selection and authorization remain unchanged.

`combatTurn` resolves the recorded weapon and target, verifies official equipment, resources, range, initiative and action allowance, and then uses `beginPlayerAttack`. No attack is announced as mechanically underway unless it exists in authoritative state. A weapon supporting both Slash and Stab needs that genuine choice because its defensive modifiers differ. An optional `actionDraft` on the existing encounter retains the selected character, weapon and target while asking the question. A concise Slash/Stab answer resumes it after refresh without repeating those fields. The preview validates legality on a clone and spends no live actions. Cancellation/end-turn clears an uncommitted draft; an attack with committed pre-roll decisions cannot be replaced by repeating a declaration.

An explicitly requested Draw and Attack also survives the Slash/Stab choice and spends its fast and slow actions only when committed. A plain attack does not invent a Draw action. The existing engine declares the enemy reaction before asking for the player attack roll. `combatWorkflow` supplies the expected responder, skill and step. The Combat panel and final narration prompt use that workflow. The existing pure enemy-choice function is shared by execution and workflow status; when no supported action is in range, both request positioning and the panel omits an ineffective Continue GM turn button. Narration beats cannot add their own roll instructions or unsupported posture changes. Ordinary active-combat gameplay dialogue is buffered, checked for unsupported mechanical prompts/outcomes and followed by the authoritative workflow prompt. Rules-reference retrieval remains available. Unsupported non-attack maneuvers continue to require adjudication.

Player-reported successes/damage are treated as unverified information. They do not change enemy Strength or substitute for the original saved roll. The existing result, defense, armor and damage engine still resolves actual submissions; no replacement combat engine or automatic player damage system was added.

## Saved-roll eligibility and recovery

`executeDice` attaches server-derived optional `combatContext` to a new roll: encounter ID, pending action ID, round, active turn and ready response step. This is not a client-supplied field on the create command. It is preserved through push and included in the shared saved-roll fingerprint. Existing records without it retain their original fingerprint serialization.

Eligibility checks the verified character, saved dice/fingerprint, pending action, weapon or defensive skill, current encounter/turn/round, consumption, and the response step that was ready when the roll was saved. A generic Melee/Marksmanship attack pool can use the already-bound weapon only when it includes that weapon's verified Gear Bonus and appropriate attribute. No weapon or dice total is invented. Armor continues to require its recorded, unpushed pool. Legacy records require conservative timestamp evidence; defensive/armor rolls must follow the recorded prerequisite rolls.

An “earlier” usable result means earlier than the latest chat message or panel opening, **after** the actual action and required pre-roll choices were already committed. For example, declare and establish Slash, roll on the sheet, refresh, repeat the declaration, then submit the same roll. A roll made while Slash/Stab or a mandatory defense decision was still unresolved is rejected without being consumed. A roll predating any actual action cannot be repaired by declaring a favorable action retrospectively.

For every ready step the first compatible roll in server save order is the only selectable outcome, including a zero-success result. Later higher results cannot replace it; the first can still be pushed before initial submission. Invalid skills, weapon pools, contexts and early records are explained separately. The earliest compatible candidate remains discoverable even beyond the recent-roll display window. There is no automatic roll consumption merely from finding a match.

The same full verifier runs before marking combat attack/defense/armor delivery Submitted. Failed validation preserves Pending status and permits a later legal recovery if the original record already established the required timing. If API execution fails after claiming but before binding, the original action stays pending and a failed Submitted record is offered again through Combat using its stable request ID. A real-sourcebook test and browser test temporarily make the Guide unavailable to exercise this path, then restore it and retry without repeating the action. A failure after mechanical resolution continues to use the existing immutable command/narration receipts. Completed submissions for another purpose and already-consumed rolls are not offered.

## Equipment, injuries and position

`applyDeclaredLoadout` restricts an explicitly described single enemy to matching weapons already in its verified template. “Sword” uniquely selects the Bandit's published Broadsword; Sling is excluded. Unsupported equipment and ambiguous multi-enemy assignments return a limitation before initiative rather than inventing statistics or substituting a weapon. A sword-only bandit at NEAR pauses for positioning when it has no supported action; no movement is inferred.

The real Handbook table verifies Shortsword Gear Bonus +2, Damage 1 and Edged/Pointed/Parrying features on physical PDF page 105. Ordinary two-success Slash therefore has 2 damage before defense/armor; final damage depends on actual recorded defense and armor results. The browser's controlled armor/defense dice produce 2 applied enemy damage and saved Strength 1. The integration suite also verifies Strength against the actual armor roll rather than assuming armor always fails.

The default official Dodge falls prone regardless of whether its later roll succeeds (Handbook physical PDF page 96, printed page 92). Existing `declareDefense` records that posture separately from damage; Stand checks actual prone state and an available action. The browser rejects Stand while standing, records Dodge/prone, resolves a failed pushed Move defense, then spends the available fast action on Stand and rejects another Stand while standing. This makes Stand mechanically justified for that verified sequence. It does not prove the unmounted live sequence had the same saved state or allowance.

Push consequences are copied from the saved card, never re-applied by narration. The new browser/unit case records 2 Agility damage and 1 Willpower gained because the fixture starts with 9 Willpower and the existing dice system caps it at 10. Enemy attack damage is separately calculated and remains player-managed on the sheet. This is one verified way the reported values can occur, not a claim that the live character was at 9 Willpower. Push damage does not establish an enemy wound, cause prone by itself, or automatically apply enemy damage to the player sheet.

## Changed files

| Area | Files under `ravenland/` |
| --- | --- |
| Natural action parsing | `src/lib/rules/action-declaration.ts` |
| Existing encounter state/workflow | `src/lib/combat/types.ts`; `src/server/combat/service.ts`, `workflow.ts`, `engine.ts`, `enemy-choices.ts`, `orchestrator.ts` |
| Narration and equipment safeguards | `src/server/combat/conversation.ts`, `loadout.ts`, `narrative.ts`; `src/server/ai/service.ts` |
| Saved-roll provenance/fingerprint | `src/lib/dice/schema.ts`, `gm-submission.ts`; `src/server/dice/service.ts`, `gm-submission.ts` |
| Roll discovery and compact panel | `src/server/combat/eligible-rolls.ts`; `src/app/api/combat/route.ts`; `src/components/combat-panel.tsx` |
| Regression tests | `tests/roll-timing.test.ts`, `roll-timing-browser.cjs`, `combat-real.ts`, `fixtures/combat-workflow-setup.ts` |
| Commands/documentation | `package.json`, `README.md`, this report |

All persisted additions are optional fields in existing JSON records. There is no new migration, parallel character record, authentication bypass, model switch, or sourcebook permission change. Tests do not rewrite the live campaign.

## Verification

The baseline required real-sourcebook suite passed **60 tests** with both actual private fifth-printing PDFs. Final `npm run test:retrieval-check` passed **322 unit tests and 66 real-sourcebook integration tests**, with none skipped. Both actual books were extracted/indexed: Player's Handbook (212 PDF pages) and Gamemaster's Guide (268 PDF pages). The final production build and TypeScript check passed.

All **14 browser suites** passed using `npm run test:<name>`: `roll-timing`, `pending-encounter`, `combat-narrative`, `encounter-fidelity`, `combat-workflow`, `combat`, `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation`, and `windows`. The first six index both actual PDFs. The six affected combat suites were rerun after the final status synchronization repair; older synthetic-fixture suites provide additional coverage. The final retrieval gate also verifies explicit Draw/Attack intent and action costs across the saved Slash/Stab choice.

The new integrated browser test uses both indexed original books, controlled SDK responses/dice and real character-sheet controls. It covers the exact imperative, saved Slash/Stab choice, declaration → roll → optional push → submission, refresh, legal earlier-roll reuse, defense timing, invalid early records, first-outcome policy, duplicate replay, reported-damage rejection, failed pre-binding submission recovery, source-backed loadout, persisted enemy damage, separate push facts and Dodge/Stand. It verifies unchanged campaign time/location and player-managed damage and checks desktop/mobile panel visibility.

The six added real-sourcebook cases cover that same parser/service/verifier path, database reopen, generic bound Melee, actual defense/armor, first-roll policy, recovery, equipment and posture. An adversarial provider test verifies invented roll/wound/prone instructions never reach streamed display or saved narration. The new unit tests add direct boundary coverage. Old assertion updates preserve the original safeguards while allowing the newly persisted choice and requiring unbound rolls to fail before submission status changes.

All databases, original books, extracted bodies and uploads used for tests are temporary/private and excluded from Git. Browser/provider responses are controlled; no paid model calls were made.

## Remaining limits

- The original live request/roll records were unavailable; exact original armor, enemy loadout, damage, Willpower cap and Stand allowance remain unverified.
- Recognition is bounded. Ambiguous targets/weapon selection and unsupported mechanics still need clarification/adjudication. A roll made before mandatory pre-roll choices cannot be recovered legally. Unknown legacy timing is not assumed valid.
- Single-enemy explicit loadouts are supported by restriction of existing verified equipment. Arbitrary new weapons and per-enemy multi-group loadout editing require adjudication. Automatic enemy movement remains outside this repair.
- A remaining-standing Dodge variant and other previously unsupported maneuver choices are not added here. Existing default Dodge/Stand behavior and verified rule modifiers are preserved.
- Gameplay prose checks are conservative and may fall back to the engine prompt. They are not a semantic proof for every possible model phrase; the saved engine result remains authoritative. No production-model prose was paid-tested.
- Push before initial submission. A failed claimed submission is already finalized for push purposes, as in the existing delivery workflow; retrying it uses the same final saved result.
- Reload the updated app/server. No migration or campaign reset is required for this phase.
