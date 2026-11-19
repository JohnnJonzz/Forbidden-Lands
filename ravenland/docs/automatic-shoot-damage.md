# Phase 5.3: automatic ordinary SHOOT damage

November 10, 2026 (America/Chicago).

## Cause and correction

Phase 5.2 incorrectly carried the earlier “do not automatically spend optional successes” instruction into ordinary SHOOT damage. `interpretAttack` selected `manual.damageSuccesses`, entered `damage_options` when no choice existed, and asked how many additional successes to spend. The reference calculator also used that input and described damage as spending successes. The official source was already being extracted correctly; this was an interpretation/policy error, not a missing-table problem.

The fifth-printing Player's Handbook SHOOT passage on **printed page 98 / physical PDF page 102** establishes automatic extra damage. The existing source-backed threshold, weapon row and additional-success rule remain required; no missing statistic or coefficient is invented.

For an ordinary successful SHOOT:

```text
remaining successes = saved final attack successes − successes canceled by a legal predeclared defense
additional successes = max(0, remaining successes − evidenced hit threshold)
damage before armor = verified weapon damage + additional successes × evidenced extra-damage increment
```

With the official threshold/increment both 1, this is `Weapon Damage + max(0, remaining successes - 1)`. If remaining successes do not meet the hit requirement, the result is a miss with zero damage.

Edrus's recorded/official Longbow Damage 1 therefore produces 1, 2 or 3 damage before armor for 1, 2 or 3 uncanceled successes. Three successes reduced by one legal defensive success leave two successes and two damage before armor. There is no allocation, confirmation, maximum-damage-choice stage or additional-success prompt. Armor/cover are then processed from their actual reported facts and rolls; unknown armor and target Strength remain unknown. The application does not infer injuries, death or Broken status for the target.

## Defense must actually precede the roll

A later message claiming “Defense was declared before the attack roll” was previously enough to qualify a defense. That is no longer accepted as timing proof.

Use the existing chat and saved request snapshots:

1. Declare the player attack. The existing character-aware guard requests the sheet roll and reminds players that reactions must precede it.
2. If a reaction is intended, record it **before rolling**, for example: `Target attempts to dodge. A defensive action is available.` Wait for the application's acknowledgment.
3. Roll/push on the character sheet, then use Recent Dice Rolls → Submit to GM normally.
4. Report the actual already-declared defensive result, for example `Defense roll: one success.`, plus any required known protection facts.

The declaration receipt is bound to one unconsumed pending attack and character. Its completed server timestamp must precede the saved roll's creation timestamp. The submission snapshots that receipt for stable retries. A new declaration after the dice were rolled is rejected even when it arrives before Submit to GM. Changing the proposed reaction after seeing the result does not replace the predeclared response.

With **no pre-roll declaration**, no reaction is applied. The hit and automatic damage proceed to armor without asking whether the enemy now wants to Dodge or Parry. This does not assert that the enemy lacked the ability or actions; it records that no timely reaction was declared through this workflow. No NPC decision, defensive roll or action-budget mutation is generated.

The existing source-backed Parry shield/qualifying-weapon-talent exception and actual cancellation result remain in effect. Eligibility facts and NPC roll results remain explicit player/GM reports; a future NPC engine must independently track them. Unsupported house effects remain subject to review rather than silent official fallback.

## Exact code paths changed

| Path relative to `ravenland/` | Change |
| --- | --- |
| `src/server/dice/attack-interpretation.ts` → `interpretAttack`, `attackReply` | Replaces allocation-based damage with automatic damage after legal cancellation; defaults to no reaction when none was predeclared; removes choice/retroactive-defense prompts; reports mechanics before consequences |
| `src/server/dice/attack-adjudication.ts` → parser, merge, `preRollDefense` | Removes allocation values from target adjudication; tolerates old allocation-only replies without changing damage; loads only completed, correctly bound pre-roll receipts |
| `src/server/dice/attack-follow-up.ts` → `attackFollowUp` | Records a reaction against one pending attack, rejects declarations after an existing roll, and preserves actual-result/protection follow-ups |
| `src/server/dice/gm-submission.ts` → verification, pending actions, completed references, query | Snapshots timely defense evidence; retains authoritative faces/counts/identity/fingerprints; excludes obsolete allocation-based calculations from current GM references; routes MELEE queries separately |
| `src/server/sourcebooks/mechanical-facts.ts` → `mechanicalFactCoverage`, `groundedWeaponAnswer` | Ordinary ranged reference calculations use all uncanceled additional successes automatically and explain why legacy allocation text does not alter SHOOT damage |
| `src/server/ai/service.ts` | Saves the pre-roll declaration in the existing request context; preserves deterministic attack replies and removes misleading optional-success wording from the mock acknowledgment |
| `src/server/ai/action-safeguard.ts` | Adds a reminder that defensive intent must be declared before the attack roll |
| `src/server/ai/instructions-v1.ts` | Protected policy v1.10 explicitly requires automatic SHOOT damage, no retroactive reaction and separate review of other attack types |
| `src/app/api/ai/context/route.ts` | Redacts the new defense receipt with the other private actor/roll calculation fields in public snapshots |

No new NPC model, table, schema migration, authentication mechanism or dice UI was added. The existing campaign database, dice records, request contexts and idempotency receipts are reused. No player sheet, inventory, clock, location, condition or approved canon is changed by interpretation. Already-applied push consequences are not repeated.

## MELEE review is separate

The actual handbook's **physical PDF page 96** was reviewed independently. STAB requires a Pointed weapon and a MELEE roll, has its own defensive modifiers, and describes increased damage for additional successes. GRAPPLE instead establishes a hold with a distinct Break Free/GRAPPLE ATTACK procedure. These are not interchangeable generic attack effects.

The ordinary SHOOT calculator remains gated to ranged attacks. An actual saved `Attack: Dagger` with a MELEE weapon is tested to bypass it, and its retrieval query asks for the close-combat procedures. This correction does not implement a new MELEE execution engine or assume all MELEE actions have identical additional-success mechanics.

## Existing campaigns and saved results

Archived messages and completed request receipts are not rewritten. Their original replay behavior remains idempotent. Current GM references label older allocation-based calculations as superseded rather than recycling an incorrect old damage value. A new follow-up, such as an actual armor report, reuses and reverifies the saved roll, drops legacy allocation fields, applies only timely defense evidence and calculates the correct automatic damage without creating another roll.

Legacy allocation wording is still recognized as user text for compatibility. It cannot reduce/increase ordinary SHOOT damage, replace actual rolled successes, or cause another allocation prompt. Standalone numerical-reference tests preserve the player's original message and success count, including word/digit/sixes reports, while checking the corrected automatic result. Ambiguous actual attack-success counts still require clarification; the validator was not relaxed to invent them.

## Verification

Executed checks:

- `npm run test:retrieval-check`: **231 unit tests and 34 real-sourcebook tests passed**, zero failures or skips. Before the correction, the real-sourcebook suite passed 31 tests.
- `npm run typecheck` and `npm run build`: passed.
- Nine browser suites passed: `test:submitted-attacks`, `test:action-safeguards`, `test:gm-situation`, `test:character-awareness`, `test:roll-gm`, `test:character-preparation`, `test:retrieval-planner`, `test:ai`, and `test:dice-repair`.

Both actual supplied fifth-printing PDFs were indexed and tested privately, outside Git: Player's Handbook (212 pages, 243 chunks, Public Rules) and Gamemaster's Guide (268 pages, 373 chunks, GM Only). The real-file checks verified the SHOOT passage at physical PDF page 102 and its printed-page label 98, weapon ratings at physical page 107, and the hit threshold at physical page 46. The separate MELEE review retrieved physical page 96. Source permissions, house-rule precedence, exact player success counts, bounded missing-evidence retrieval and evidence citations remain covered.

Tests use disposable stores and controlled providers, not paid model calls or a live campaign database. No live-model narration claim is made; the application-controlled attack results and browser workflow were exercised end to end.

Regression coverage includes Longbow 0/1/2/3 successes; automatic damage with unknown armor; actual cancellation from a server-recorded pre-roll defense; illegal/zero-result defenses; late intent both after submission and between rolling/submission; no allocation/retroactive-defense prompts; unknown target Strength; ignored legacy allocation text; older saved calculations; distinct crossbow damage; MELEE separation; no duplicate submissions/dice; and unchanged character/campaign mechanics.

## Remaining limits

This is ordinary ranged-attack interpretation, not autonomous NPC combat. Target equipment, eligibility and NPC rolls still require actual reported facts/results. No automatic target Strength, armor, injuries or enemy dice are supplied. Conditional talents/house effects and full tactical action budgets require separate adjudication. A reaction must be entered through the supported pre-roll workflow and acknowledged before rolling; unstructured earlier narration is not silently treated as a defense receipt. The default narration model/configuration, character sheets, push controls and compact composer remain unchanged.
