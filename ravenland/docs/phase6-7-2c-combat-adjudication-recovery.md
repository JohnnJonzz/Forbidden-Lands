# Phase 6.7.2c — Combat adjudication recovery and administrative abort

Based on `c1d7139`, branch `ravenland-ai-gm-prototype`. Development uses isolated databases, controlled providers/dice and the original private fifth-printing books. The live Belderand database was not inspected or changed. The supplied encounter and attack IDs are diagnostic references only.

## 1. Root cause of the remaining deadlock

Phase 6.7.2b correctly refused to reopen a reaction after a real attack result, but its `rolled` flag combined attack/defense/Armor maps, any pending result, every `playerRolls` reference and any bound sheet card. That label did not explain which evidence caused the restriction. Its UI then hid all correction controls when `rolled` was true. Normal `/combat end` correctly retained the pending attack, while the only administrative interruption also required all pending mechanics to finish. Thus a malformed *rolled* range adjudication had no reviewed exit.

The generic range note also failed to state the actual Near/Arm mismatch. Worse, the public combat projection could label an adjudication as a defense-roll phase based on saved successes, despite the underlying phase still blocking defensive decisions.

The new fixtures reproduce Round 1, Nightwarg Rending, Near, fast available, slow spent, range adjudication, rejected Dodge and blocked normal closure. One has only the actual source-backed table selection; another has actual saved attack dice and an inconsistent range hold. Additional fixtures exercise bound/legacy defensive results, completed defense, pending Armor, damage, mandatory injury, stale previews and absent rule evidence. These are controlled reproductions of saved-state characteristics, not access to the user's actual rows or evidence of the historical model's internal decisions.

## 2. Saved-evidence classification

`recovery-evidence.ts` distinguishes:

- Initiative history, preserved separately from the pending action.
- Monster table selection and utility cards; these do not establish an attack hit or damage.
- Actual attack, defense, Armor and movement dice.
- Declared defensive choices and defense dice still pending.
- Bound, unsubmitted sheet cards, including legacy references without a modern context.
- Independent Survival/Scouting cards with no requested combat step; these remain independent evidence.
- Missing saved-roll references and recorded results/effects.

Unknown, missing or genuinely combat-bound results remain conservative timing barriers. A saved known Dodge result cannot retroactively establish a defensive decision. Typed “two successes” is not a verified saved card. Even zero-damage recorded outcomes are retained as outcomes rather than treated as a fresh unrolled action.

The review shows the evidence categories, IDs, statuses, current phase, current actor, target, required range, actual range and permitted operations. The public projection preserves **adjudication** until its real transition; it no longer disguises a range hold as an available Dodge request.

## 3. Range and phase correction

A source-backed unrolled range hold can use **Confirm legal movement and reopen defense**. The controller records the reviewed positioning and reason. The existing engine verifies ordinary clear Near → Arm movement, current actor, available action slot and source-supported attack. It spends the fast action (or an available slow slot for that fast action), retains the original attack ID and table selection, and restores the legal pre-roll window. Existing genuine defensive decisions are retained.

A demonstrably unrolled, incorrectly closed reaction phase can also be restored through this reviewed path. **Restore legal pre-roll phase** changes no range and requires that the already recorded range is legal. A verbal confirmation alone never moves a monster or PC.

Attack/defense dice, bound defensive cards, missing references or recorded outcomes prevent retroactive reopening. Published special procedures, blocked/rough routes, missing evidence and unsupported positioning remain held. Every unavailable correction has a displayed reason. Invalid unrolled, undefended declarations can still be superseded with an audit; no spent action or table draw is refunded.

## 4. Administratively Abort Encounter

The new local-controller recovery API implements a separate administrative transition. It is not normal combat completion and does not use victory, defeat, surrender or withdrawal as a substitute.

The visible control requires two stages:

1. **Preview administrative abort**: inspect encounter/round/action, dice categories, original pending declaration, current sheets, push consequences, injuries, conditions, equipment, spent actions, linked expedition, actual position and proposed preservation effects.
2. Choose **Malformed historical state** or explicitly **Intentionally discarded test encounter**, enter a specific reason, review each unresolved obligation with evidence, type **ABORT ENCOUNTER**, and press **Administratively Abort Encounter**.

Ordinary valid gameplay is not silently classified as malformed. A deliberately discarded test encounter requires that explicit administrative scope. The UI warns against using recovery to evade an unfavorable legitimate roll. Hosted player sessions cannot inspect private recovery snapshots or perform these controller operations.

The authoritative encounter changes from SQL status `active` to `ended`, with outcome `administratively_aborted` and an explicit abort record. Its original `pending` object remains byte-for-byte equivalent to its saved JSON, including the original phase, references, dice and notes. The abort record marks unresolved action identities as **administratively terminated**; it does not rewrite them to completed attacks.

## 5. Consequences and uncertainty

Abort preserves original dice/cards, initiative, action declarations, combat history, spent actions, character sheets, inventory, resource dice, conditions and critical records. No healing, damage reversal, Armor result, successful Dodge, hit, miss, monster defeat or escape is generated.

Each pending action needs its own reviewed disposition. Known player damage after Armor needs evidence that it is already recorded on the manually managed sheet, or a deferred mandatory review. Pending Armor never becomes zero damage. Required injuries and true existing lethal obligations stay protected. Current equipment and saved push wear/damage are shown; missing historical “before” values are not reconstructed from narration.

Deferred uncertainty creates linked mandatory-review records through the existing consequence store. **Deferred administrative uncertainty** in Combat recovery allows a separate, fingerprinted, local-controller disposition of those specific administrative records. It preserves the original encounter and values and explicitly closes only the administrative uncertainty. It cannot clear a true lethal-injury record or grant healing. Existing supported injury/deadline procedures continue through Unresolved Actions. New encounters are blocked while deferred administrative reviews remain open, and Continue points to the actual recovery control.

## 6. Transactions, audit and retry

Corrections and aborts use the existing combat command ledger. The confirmation carries an encounter revision and a SHA-256 preview fingerprint over the encounter, campaign revision/session and consequences. Changes to sheets, dice, position, journey, time or obligations invalidate the preview.

The entire mutation, Journal entry and command receipt commit together under `BEGIN IMMEDIATE`. Reusing a request with different parameters is rejected. Exact retries replay the original receipt before consulting today's active-combat state, including after a restart. Retry cannot spend another action, reroll initiative, duplicate damage or append another abort Journal entry.

The abort records controller, timestamp, reason, administrative scope, preview hash, terminated action IDs and individual dispositions. The original pending data stays in the encounter; Combat History and Journal record the administrative transition. Follow-up administrative review is separately receipted and audited. Saved cards from the aborted encounter cannot be newly pushed or submitted as current attacks/reactions. Previously completed request receipts retain their normal replay behavior.

## 7. Combat-to-journey resumption

Abort releases only the active-combat lock. It does not enter U06, advance Day, complete an activity, restore resources or generate another encounter. The existing quarter-day, assignments, saved Survival/Scouting cards, entry receipts and reviewed allowance remain intact.

An abort records its link to the pending expedition. A historical encounter placed in intended-but-unentered U06 is flagged against actual T05. The journey review picker includes that specific linked aborted encounter even when its recorded scene differs, so the controller can review the administrative closure without pretending the party moved. Other unrelated remote encounters do not gain this exception.

**Review administratively aborted encounter** guides the player back to the same quarter. Recording the linked workflow as closed is not a monster defeat. The player may then confirm a genuinely legal next entry using the original saved navigation, review an alternate unentered route, or finish at the actual position through the existing quarter resolution. Actual movement and time still require their own operations.

## 8–9. UI and AI guidance

**Combat → Pending action review** now states the precise blocker and evidence. **Combat recovery and administrative abort** exposes allowed corrections, disabled reasons, inspection, two-stage abort, explicit dispositions and completion feedback. An aborted encounter is clearly labeled as administratively stopped; its old range hold is labeled historical, not a current active-combat lock.

Successful operations refresh Combat, Continue, the campaign/Journal and quarter controls through the existing refresh and cross-window mechanisms. The notebook and complete Quarter-Day Activities panel remain collapsible.

Adapter v1.18 and structured `combatRecovery` context provide the actual mismatch, classifications and legal options. Deterministic administrative continuation guidance states that the original attack is terminated and returns to the actual pending quarter. Aborted encounters do not generate a normal fictional aftermath or autonomously resume NPC combat/world actions. Linked preparation projects as administratively aborted, not a defeated threat. No paid-model prose quality is inferred from controlled tests.

## 10. Fifth-printing verification

The original indexed Guide establishes Nightwarg Rending's eight Base Dice, Weapon Damage 1, default Arm's Length reach, Dodge eligibility and no general Parry permission. The monster table draw is a selection, separate from the attack pool. Guide printed pp. 73–74 (physical 77–78) establish monster action/range, damage, no Push and defensive exceptions; Nightwarg printed pp. 114–115 (physical 118–119) supplies its actual entry/table.

The original Handbook verifies fast Run, the Near/Arm transition, action allowance, defense decisions before attack dice, saved defensive pools, Push, Armor, damage, Broken and critical procedures through the existing source-backed adapters and retained chunk/page references. Scoped combat house rules still block silent official defaults. Missing rule evidence prevents an official mechanical correction; it does not prevent an explicitly reviewed administrative abort.

The historical Day Nightwarg is deliberately reproduced as historical data. Recovery does not change the creature identity or clock to resolve its separate night-only/no-tracks source discrepancy. New prepared official Nightwarg activation retains Phase 6.7.2b's condition checks.

## 11–12. Files and schema

New implementation: `combat/recovery-evidence.ts`, `combat/administrative-recovery.ts`, `combat/administrative-cards.ts`, `/api/combat/recovery`, `CombatRecoveryReview` and the read-only operator inspector.

Extended: combat recovery/workflow/public projection/history/handoff/preparation, AI context/adapter/continuation guidance, protected saved-roll submission/Push, consequence/world aftermath boundaries, journey encounter review/status, Continue and the existing Combat/expedition UI. Tests add pure evidence classification, original-PDF recovery cases and the browser acceptance flow.

No SQL migration is needed. The existing encounter JSON gains optional `administrativeAbort`; the outcome kind adds `administratively_aborted`. The existing SQL `ended` status releases its active lock. Journal, consequence and command tables remain their established owners. Old encounters remain readable; no migration rewrites historical dice or attacks.

## 13–14. Regression and browser results

Validation passed: **534 regression tests**, **214 original-PDF checks**, the **5 focused evidence tests** and **10 focused original-PDF recovery checks**, with zero failures/skips. All **8 browser workflows** passed: new recovery acceptance, prior GM preparation/journey, defensive sequencing, combat lifecycle/injuries, expedition, contextual logistics/encumbrance, Genesis and library/weapon corrections. Production build, TypeScript and whitespace checks passed. Tests use isolated fixtures, controlled providers/dice and the actual original PDFs, without paid model calls. The older lifecycle fixture now explicitly opens its collapsible Combat tab and uses a rules question for its ordinary handoff assertion; NPC world-action choices retain their separate existing tests.

The acceptance browser runs four PCs with a submitted Day expedition from T05 toward U06. It loads the historical Near/Rending hold, inspects its table-only evidence, applies the legal approach, declares Grogahx's Dodge, stages and submits a bound result from the actual character sheet, resolves the attack and concludes combat through an explicitly established fixture surrender. The original expedition then accepts a real entry without another quarter.

A separate malformed case contains actual saved attack dice and a narrated U06 encounter while the authoritative party remains T05. The browser verifies disabled reopening with reasons, previews preservation, reviews the specific disposition, types confirmation and aborts. It compares original pending data, rolls, initiative, actions, character sheets, saved journey cards and Day submission; verifies unchanged T05/Day, a single Journal receipt and no fictional result; restarts; replays the exact abort; and explicitly resumes the same expedition before committing a new U06 entry. Mobile layout and client exceptions are checked.

The prior private preparation/scene progression, defense/Armor/Push, combat lifecycle/critical, multi-hex expedition, contextual supplies/encumbrance/appointments, Genesis and library/weapon browser workflows are included in the release regressions. The source-backed suite also covers genuine injury obligations that an administrative uncertainty review cannot erase.

## 15. Existing-campaign compatibility

The supplied live IDs were not used to create fixtures, find a live file or authorize a write. Existing Day submissions, completed movement and original rolls are not regenerated. Old rolled malformed actions gain the reviewed administrative path; valid ordinary attacks retain their normal timing and consequences.

**The normal campaign JSON export does not include the complete combat/administrative tables. Back up the entire SQLite data directory before live recovery.** Keep any separately configured sourcebook directory as well. Close the application before making a filesystem copy, including any SQLite WAL/SHM files present. Keep that private backup outside GitHub.

## 16. Specific Belderand recovery instructions

Diagnostic encounter: `920d9aa6-fc73-46c1-b865-a1e0ce856edf`.
Diagnostic pending attack: `6c991ffc-4440-4678-a362-9c863b072ba2`.

1. Start with a full backup and **read-only inspection**, preferably on the copied database. In the `ravenland` directory, the operator can run:

   ```sh
   npm run combat:inspect -- --db data/ravenland.sqlite --encounter 920d9aa6-fc73-46c1-b865-a1e0ce856edf --attack 6c991ffc-4440-4678-a362-9c863b072ba2
   ```

   Replace `data/ravenland.sqlite` if `RAVENLAND_DB_PATH` points elsewhere. This command opens SQLite read-only, runs no migrations and refuses a different pending attack. It reports actual range/phase, evidence categories, obligations, location mismatch and original quarter record. It neither creates a missing encounter nor fixes it.
2. Check which evidence really exists. **Table/utility selection only, with no committed attack/defense/outcome**, may permit a reviewed legal Near → Arm approach. A real attack result or known bound Dodge card prevents a retroactive reaction. The screenshot's generic “saved dice or consequences” message alone cannot determine which branch applies.
3. In trusted local play, open **Combat → Pending action review → Combat recovery and administrative abort → Inspect saved recovery state**. Confirm the exact IDs, Grogahx, Round 1, the actual Near range, published Arm reach, actual fast-action availability and saved evidence. Do not assume typed “two successes” is a saved Dodge card.
4. If movement/phase restoration is offered, review actual positioning and the displayed cost, enter the specific reason, then confirm it. The engine retains the attack/table and spends the action once. Declare Dodge only in the resulting legal window. Use an existing eligible card or stage the newly requested roll on Grogahx's sheet, attach and Send; never regenerate an original result.
5. If a real committed result makes restoration unsafe, resolve its supported defense, Armor, damage and injury obligations normally when possible. If the historical sequence cannot be repaired, choose **Preview administrative abort**. Inspect all preserved damage, current sheets, conditions, gear, spent actions and source references. Record a specific reason such as the Phase 6.7.2b Rending range deadlock.
6. Choose the appropriate administrative scope. For every obligation, record whether an unresolved invalid action is administratively terminated without a result, actual damage is already recorded with evidence, a true injury obligation is retained, or uncertainty requires mandatory review. Do not claim Dodge succeeded, damage was zero, the creature was defeated or the party escaped.
7. Type **ABORT ENCOUNTER** and confirm **Administratively Abort Encounter**. Verify its status/Journal record and the original pending attack/dice remain. If delivery is interrupted, use **Retry reviewed recovery request** rather than inventing a new correction.
8. Resolve any **Deferred administrative uncertainty** through the displayed reviewed-disposition control. This does not clear true lethal injury records or alter sheets. True existing lethal/injury procedures remain in Unresolved Actions. Continue will prioritize the remaining obligation.
9. Compare the actual map/sidebar with the encounter's recorded scene. **If the inspection still says T05, abort leaves the party at T05 and Day remains pending.** If a verified U06 entry already exists, it remains the actual position. The two IDs and old narration cannot establish arrival on their own.
10. Use **Continue → Review administratively aborted encounter** to return to the original Day submission. Select that linked encounter and record that its administrative workflow is closed. A mismatched narrated U06 scene is now selectable only through the recorded abort-to-expedition link; this does not move the party.
11. Review the original Grogahx Lead the Way and Rose Keep Watch cards, actual route and remaining allowance. Continue with a real first-hex entry if appropriate, review a different unentered destination, or finish at the actual position through the existing quarter controls. Finish Day explicitly once; administrative abort itself advances neither time nor movement.

The actual live records were unavailable in development, so this report cannot say whether those precise rows need restoration or abort, which damage is already on the sheets, or whether the live party is currently T05. The read-only output and preview decide those facts; the UI does not force an outcome.

## 17. Remaining limits

- Automatic repair restores only proven unrolled, source-supported timing/range states. Actual attack/defense results, uncertain references, exceptional movement and published special effects are not rewritten or rerolled.
- Administrative review records explicit GM authority and evidence. It does not infer missing historical sheet baselines or prove that a typed historical success count was a roll.
- Deferred administrative uncertainties can be reviewed without deleting the original records. Genuine lethal deadlines, injuries and committed character values remain protected; they are not cleared by the administrative review control.
- Trusted local controller authority is required. Hosted player access is unchanged. Completely corrupt/unparseable database rows require backup restoration/operator diagnosis, not guessed reconstruction.
- The existing shared-range model, source/house-rule holds and sheet-managed player damage policy remain in effect. Preparation and scene narration are not new mechanical authorities.

Screenshot: [administrative recovery and unchanged pending Day](phase6-7-2c-administrative-abort.png).
