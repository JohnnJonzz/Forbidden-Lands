# Phase 6.2 — Narrative-first combat

## Reused architecture

The existing encounter engine remains authoritative: numbered-card initiative, action allowances, enemy templates loaded from the two actual fifth-printing PDFs, cryptographic enemy dice, pre-roll defenses, success cancellation, damage, armor, enemy Strength, Broken and critical procedures. Existing SQLite encounter/command records, character grants/local development identity, saved player dice, push handling, roll fingerprint verification, Recent Dice Rolls and AI request leases/usage tracking remain in use. No new database, dice engine, authentication mechanism or independent combat history was introduced.

## Orchestration and narration

`src/server/combat/orchestrator.ts` wraps the existing command service in single-step mode. It executes a supported declaration, then continues GM-controlled actions until a player choice, sheet roll, player initiative turn, unsupported procedure or other genuine blocker. It never ends a player turn or chooses a player's reaction/push. It automatically concludes an encounter only after all enemy combatants are Broken/withdrawn and no attack remains pending. Manual conclusion remains available for negotiation or other table-adjudicated endings; Broken never implies death.

Each subcommand uses a deterministic request ID in the existing `combat_commands` table. An immutable narration packet is saved before calling the model. Retries reuse resolved attacks, armor, critical dice and actual push consequences. Revision checks stop a resumed partial request from operating on an encounter changed by another action. Engine progress is capped at one initial command plus 24 follow-up commands, and model choices at two per attempt. Replayed successful decisions also consume that budget. Remaining choices use the existing first-legal-action policy. Choice calls allow up to 15 seconds each, followed by one narration call of up to 90 seconds; the configured model is retained.

`src/server/combat/narrative.ts` projects verified completed events into narration inputs. Unknown enemy attributes, full attack tables and GM-only source bodies are excluded. Current scene, approved memories and authorized character context come from the existing AI context builder; bystanders are separate from initiative. The model returns short beats keyed to verified event IDs. Output is buffered and checked for unknown/repeated references and common unverified injury, defeat, numerical-mechanics and reinforcement claims. Unsupported prose falls back to application narration, and the application supplies the next precise player prompt. These checks complement protected instructions; they are not a general semantic proof of all possible generated prose.

`src/server/ai/service.ts` now uses that separate narration path after authoritative combat resolution. It suppresses combat memory/action proposals as before. Model choice usage is recorded immediately after each newly committed choice; replaying a receipt does not bill it again. Narration failures retain their safe error categories and can be retried without re-resolving combat. No live paid-model test was necessary or performed.

## Natural declarations and roll usability

The existing action recognizer now accepts the previously broken singular “I slash.” Natural Dodge (including “I try to dodge his attack”), Parry, no defense, Stand and End My Turn use the same engine commands. One recorded weapon/one remaining target can be inferred when unnamed. Explicitly named unknown equipment is not silently replaced. Ambiguous Slash/Stab or equipment/target choices produce one concise clarification without spending an action. Unsupported SHOVE, retreat and other unimplemented maneuvers request adjudication without being converted into attacks.

Explicit Draw plus attack, or Stand plus Draw, spends the verified fast actions and preserves slow-action rules. It does not force drawing at the beginning of combat or alter equipment records. Ordinary attacks use recorded weapons and source-verified statistics. Saved, verified push wear can establish a reduced current Gear Bonus for later attacks without applying gear damage again. Unexplained weapon modifiers still require adjudication.

`src/server/combat/eligible-rolls.ts` reuses the actual saved-roll verifier and combat pending-step checker. Only the authorized actor's current, matching, unconsumed saved rolls are returned. The Combat panel offers **Submit this roll** and a sheet shortcut for optional pushing. Both the panel and Recent Dice Rolls use the same stable request-ID/fingerprint helper. Nothing is silently submitted, and stale/missing/wrong rolls still fail explicitly.

A browser regression also found that the sheet's global input handler saved character fields when a temporary pool adjustment was edited. The small fix in root `index.html` excludes dice-panel controls from that handler; generated embedded assets are updated. Actual sheet edits and existing saved push effects continue normally.

## Round history

New attacks and every new roll, including critical dice, retain their round. `src/server/combat/history.ts` projects initiative, rolls, attacks, defenses, armor, damage, push consequences, Broken, turn transitions and conclusion from existing encounter data and command receipts. It orders entries by existing timestamps and groups them in a collapsed **Combat History** view. Previous rounds remain available. Legacy records lacking round data are explicitly grouped as “Round unrecorded”; no round is fabricated.

## Verification

Final verification: 277 unit tests and 52 actual-sourcebook integration tests passed. Both official PDFs were available and exercised before and after implementation. The final `test:retrieval-check` gate, `npm run typecheck` and `npm run build` all completed successfully.

All 11 browser suites passed: `combat-narrative`, `combat-workflow`, `combat`, `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation`, and `windows` (each invoked as `npm run test:<name>`). The first three use both actual books; some older suites use their existing original synthetic fixtures and are additional coverage, not substitutes for the real-PDF gate. The dedicated browser command is:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/sourcebooks npm run test:combat-narrative
```

It uploads and indexes the actual Player's Handbook (212 pages) and Gamemaster's Guide (268 pages) in isolated temporary storage. Controlled SDK responses and server/sheet dice make the run reproducible without paid API calls. It covers a full melee encounter with only selected participants, a nearby noncombatant, automatic enemy turns, pre-roll Dodge, actual sheet attack/defense/armor/push rolls, Combat-panel submission, enemy armor and persisted Strength, Broken/critical/conclusion, a miss, gear-only pushed consequences, idempotent replay, multiple enemies, previous rounds, pending refresh, unknown-armor recovery, no automatic player damage, no dice cards in narrative chat and no repeated Continue commands.

The existing combat and workflow browser suites remain in place. The real-PDF suite adds automatic turn/defense resolution, multiple enemies, unknown armor, full armor/Strength/Broken/conclusion persistence, narration-error retry, melee clarification/explicit draw, bounded choices and saved push wear. Unit tests cover prose safeguards, numbered NPC names, legacy round handling, privacy, actual nonzero push consequences, stable IDs and the singular Slash parser.

## Limits

- This is orchestration of the existing supported procedures, not new tactical movement, autonomous combat breadth, SHOVE, retreat, grappling or conditional monster effects. Genuine unsupported procedures remain pending for adjudication.
- Player combat damage/status remains player-managed; the GM cannot overwrite sheets. Existing push consequences remain authoritative and are applied once by the dice system.
- Current enemy choices retain the existing legal-target/action policy. Richer tactics, surrender logic and new stat blocks are not invented.
- Standard source permissions, scoped house-rule checks, current scene boundaries and existing player authorization remain unchanged. No new public-hosting bypass is provided.
- No paid production-model quality/load test was run. Integrated tests use the real SDK with a controlled transport, plus actual indexed PDFs.

An ordinary round now consists of a natural action, a sheet roll, explicit submission and the player's eventual end-turn choice. Enemy turns and supported attack-resolution steps no longer require repeated Continue GM Turn/Next commands or player calculations of enemy damage.

## Changed files

- Orchestration and verified narration: `src/server/combat/orchestrator.ts`, `narrative.ts`, `src/server/ai/service.ts`, `provider.ts`, `instructions-v1.ts`.
- Existing combat projection and bounded commands: `src/server/combat/service.ts`, `engine.ts`, `critical.ts`, `workflow.ts`, `store.ts`, `history.ts`, `equipment.ts`, `src/lib/combat/types.ts`.
- Roll eligibility/submission: `src/server/combat/eligible-rolls.ts`, `src/app/api/combat/route.ts`, `src/components/combat-panel.tsx`, `recent-dice-rolls.tsx`, `src/lib/dice/gm-submission.ts`.
- Declaration/sheet fixes: `src/lib/rules/action-declaration.ts`, repository-root `index.html`, generated `src/lib/sheet-version.ts` (the embedded HTML is generated locally/build time).
- Regression coverage: `tests/combat-narrative.test.ts`, `combat-real.ts`, `narrative-combat-browser.cjs`, existing `combat-browser.cjs`, `combat-workflow-browser.cjs`, `ai-canon.test.ts`, and test-only `fixtures/ai-provider-preload.mjs`, `combat-workflow-setup.ts`, `combat-narrative-random.mjs`.
- Documentation and command: `README.md`, this report, and `package.json`.
