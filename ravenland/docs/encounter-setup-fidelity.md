# Phase 6.2.1 — Encounter setup fidelity and narrative verification

## Findings and evidence limits

The checked-out baseline was `5f95b43` on `ravenland-ai-gm-prototype`; the working tree was clean. Both actual private fifth-printing PDFs were available. No production campaign database, configured database path, or default `data/ravenland.sqlite` was present. Private development/test databases are not evidence of the live campaign. Consequently, the precise live request payload, original four-combatant record, and later roll cannot be certified from this workspace.

The enemy duplication defect is nevertheless reproducible in the application parser. The old `parseEncounterSetup` used `matchAll` over every occurrence of an enemy noun and mapped every match into another `bandit x1` entry. The exact quoted request has three bandit mentions and produces `bandit x1; bandit x1; bandit x1` on that baseline. Four mentions produce four entries. This is an important distinction: the supplied quote reproduces three, not exactly the reported four. It would be inaccurate to claim the exact production count was reconstructed without the original records.

The complete code path is deterministic: `AIService.run` → `combatTurn` → `parseEncounterSetup` → `/combat start` parameters → one source-backed lookup/expansion per semicolon-separated entry → `createEncounter` → `saveCombat` → `combatNarrative`. There is no model-generated setup parameter step in this path. Repeated mentions can therefore create actual persisted enemies; this is not solely a narration defect. Start narration enumerates the saved combatants. No default of four, or four-enemy expansion inside a single Bandit template, is needed to explain the duplication mechanism.

The location defect is separate. `createEncounter` takes `sceneLocation` and `sceneHex` from the saved campaign. The old setup parser did not inspect the newly described road or detect a conflict. Start narration used that encounter location, so a campaign saved at The Hollow Watch would be narrated there. That is a missing scene-confirmation boundary, rather than proof that the model independently chose a stale location. Existing active encounters also previously could bypass fresh natural setup and reach general narration; the new explicit guard reports the existing encounter instead.

## Changes

- `setup-enemies.ts` extracts one final count per enemy type, ignores definite repeat references, recognizes lone/single forms, preserves exact multi-type counts, and asks about conflicting/vague/out-of-bounds quantities. It never clips a number or substitutes another group. The existing six-per-type and ten-total initiative limits remain.
- `setup-participants.ts` uses actual campaign character IDs, honors explicit “only” and solo selections, processes exclusions and absence clauses, and preserves the existing full-party presence safeguards. Unselected roster membership does not add combatants. Explicit absences are saved for narration without deleting party members.
- `setup-scene.ts` separates a proposed local description from the authoritative campaign location/hex. An incompatible description requires one clarification before initiative. Confirmation is scoped to the location/hex that was asked about; a stale Yes does not confirm an unrelated changed location. Users can instead update the campaign normally or say “Use the current campaign location.” No travel, time or discovery mutation is introduced.
- `setup.ts` composes those helpers and reuses server-persisted clarification context. Fresh declarations start with fresh fields. The range in the actual Begin/Start clause takes priority over earlier narrative range references and adjectives such as a “long forest road.”
- `service.ts` retains the existing engine/orchestrator and authorization. It stores the confirmed optional scene description/absences on new encounters, refuses to replace an active encounter silently, and prevents an unbound generic Melee/Marksmanship/Shield Parry result from being treated as a resolved combat attack. Ordinary noncombat roll submissions remain in place.
- `engine.ts` adds an audit to the existing canonical attack result: actual enemy Strength before/after and the applied loss, including zero and clamped overkill. Damage, dice, action economy and character-sheet mutation behavior are unchanged. Private before/after enemy values are not added to the public combat projection or narration packet.
- `narrative.ts` projects the actual saved weapon, attack/defense/armor roll IDs and successes, damage before/after armor, and applied loss. Legacy results without an applied-loss audit remain labeled as legacy/unverified for that particular fact. Push facts copy the verified saved record and identify the rolling character and damaged attribute. Prose checks reject contradictory weapon references, absent companions and unsupported Willpower claims; existing numeric guards and safe fallback remain.
- `provider.ts` tells the existing configured model to use the confirmed encounter scene and structured weapon/result facts rather than stale scene text or a generic Melee label. No model change, paid-call chain, new authentication or parallel dice system was introduced.

All new persisted fields are optional additions to existing JSON records. Existing encounters and history are preserved; there is no migration that rewrites their counts, location, damage or push effects.

## The reported damage and Willpower

The original live “2 Strength damage” and “2 Willpower” cannot be verified without its saved roll, pending/resolved attack and push records. The phrase also needs a subject: Strength damage suffered by Edrus from pushing is different from damage dealt to the bandit. A pushed flag or one attack success alone establishes neither value.

Real-sourcebook regressions exercise both possibilities using the actual official equipment entries and existing dice engine:

| Verified case | Attack successes | Enemy defense / armor successes | Damage dealt after armor | Edrus's saved push damage | Willpower actually gained |
|---|---:|---:|---:|---:|---:|
| Dagger | 1 | 0 / 0 | 1 | 2 Strength | 2 |
| Broadsword | 1 | 0 / 0 | 2 | 2 Strength | 2 |

The two locked Base ones in those controlled pushed rolls generate the saved character damage and Willpower; Skill and Gear dice do not contribute invented Willpower. The tests compare the new attack audit with the enemy's actual persisted Strength reduction, and compare push facts with the saved dice and post-push character snapshot. Replaying submission changes neither record and does not apply consequences twice.

Thus, for an ordinary unmodified Dagger attack with one uncanceled success, two damage to the bandit would not follow from the verified weapon rating. Two Strength damage to Edrus from the push could be correct. Neither interpretation is asserted as the actual live result.

## Verification

The pre-change required real-sourcebook suite passed all 52 tests. Final post-change `npm run test:retrieval-check` passed **300 unit tests and 57 real-sourcebook integration tests**; none were skipped. `npm run build` and `npm run typecheck` also passed.

All **12 browser suites** passed: `encounter-fidelity`, `combat-narrative`, `combat-workflow`, `combat`, `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation`, and `windows` (each run using `npm run test:<name>`). The first four upload/index both actual books. Older suites that use their original synthetic fixtures remain additional regression coverage, not replacements for the real-sourcebook gate. Tests use isolated temporary databases and private file storage, never the live campaign. Books, extracted source bodies, fixture databases and uploads are not committed. Controlled SDK responses and dice are used for browser determinism; no paid production-model request was made.

New coverage lives in `tests/encounter-fidelity.test.ts`, `tests/combat-narrative.test.ts`, additions to `tests/combat-real.ts`, and `tests/encounter-fidelity-browser.cjs`. The browser uploads and indexes both actual books, sends the exact quoted request through the main composer, refreshes the pending clarification, confirms a local scene, checks the actual saved range/count/absence data, retries setup, rejects replacement of an active encounter, ends four enemies then starts one, and tests an explicit manual location edit. It then uses the actual character-sheet Dagger roller and push control, submits from Combat, verifies one success/one enemy damage/two saved Willpower, and retries without duplicate effects.

Supporting test-only changes are in `fixtures/combat-workflow-setup.ts` and `fixtures/ai-provider-preload.mjs`; `package.json` adds `test:encounter-fidelity`. README documents the local-scene confirmation workflow.

## Remaining limits

- The exact original live count of four and the original damage/Willpower claims remain unverified because those production records were not provided or mounted. No existing campaign records were corrected speculatively.
- Natural setup remains a bounded recognizer. Uncertain quantities or multiple incompatible scene descriptions ask for clarification; arbitrary enemy templates, complex loadout editing and unimplemented combat maneuvers are not invented.
- A scene confirmation establishes a local description within the saved location. A genuinely different location still requires the existing campaign/travel controls; setup does not move the party.
- Narration checks are conservative safeguards, not a semantic proof of arbitrary generated prose. The mechanical engine and saved records remain authoritative, and no player statistics are changed by narration.
