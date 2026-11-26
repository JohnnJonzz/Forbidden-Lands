# Phase 6.4.1: defensive roll sequencing and attachments

The existing combat engine now verifies the defensive sequence from saved roll identities before accepting the next attachment. Dodge/Parry pools are captured before push effects change the character sheet. Armor has a direct staging control, and mismatched rolls identify the current phase and next action.

## Investigation and confirmed defects

The live campaign database/request records were not present in this workspace. The supplied transcript alone cannot establish exactly which record caused the historical Round 4 rejection. The normal single-target zero-success Dodge path does consume its Move result before requesting Armor; that path now passes through rounds 2 and 4 in the actual chat-and-sheet browser test. No claim is made that the historical incident was definitively a race, duplicate, or multi-target attack.

The following code defects were reproduced:

1. **Shared phase could advance ahead of another required defense.** `resolveAttack` processed targets in order and returned as soon as one needed Armor. A later target could still owe Dodge/Parry. `combatWorkflow` then gated all responses on the one mutable `pending.phase`, concealing that defense. A stale Armor phase also masked a missing defense in a single-target state. The reverse stale projection could leave a verified defense with no next Armor response.
2. **Custom Roll escaped combat validation.** `combatRollIntended` recognized combat labels and Armor metadata, but ignored a Custom Roll's saved pending-attack context. The result could go to ordinary AI interpretation while the real Armor step remained pending. A player's later explanation could not legitimately repair the record's type. This routing was wrong; metadata must determine compatibility.
3. **Required defensive pool was not enforced.** `checkCombatRoll` checked Move/Melee labels and context, but not the declared attributes, Gear Bonus or verified modifier. An earlier sourcebook test even supplied two Base and one Skill die despite a character with Agility 3, Move 2 and the verified +2 against Slash. Such a roll could displace the correctly prepared result.
4. **The rejection wording contradicted prior consumption.** Every `checkCombatRoll` failure appended “The roll was not consumed,” including an already-consumed roll. A different late Move also lacked the identity of the defense that had already moved the attack to Armor.
5. **Narration and controls obscured the sequence.** An existing pending attack was emitted as another declaration on each response. The sheet did not show a direct, current defensive/Armor request, and generic pool controls made an incorrect Custom Roll easy to produce.

Four targeted tests were run against the unchanged `0cc79ea` worktree: all four failed. The corresponding tests pass after repair. Additional tests cover inverse stale projection and inconsistent records. Original real-PDF checks passed before changes: 370 unit tests and 127 sourcebook integration tests, using both supplied original books.

## Authoritative progression

| Stage | Required evidence and behavior |
| --- | --- |
| Attack declaration | Existing encounter, initiative, target, weapon, action budget and pre-roll defense choice remain authoritative |
| Attack dice | Actual saved enemy attack record; missing attack dice cannot become an assumed zero |
| Required defense | Every required player defense is resolved before any player Armor request; zero successes still count as a recorded defense |
| Attack resolution | Actual attack minus actual defense successes; existing verified weapon damage rules |
| Armor | Proper unpushed Armor record, correct character/attack/phase and recorded protection rating |
| Completion | Existing damage calculation, audit and bounded turn continuation; player sheet damage remains manual |

`needsPlayerDefense` checks the actual attack/defense records, their action IDs and owners. The workflow and public pending view derive their request from this evidence. A stale phase flag alone cannot skip Dodge or demand another Move after a verified defense.

Validated bindings normalize the phase inside the existing transaction. The existing resolver recomputes results from saved dice, rather than trusting a stale cached damage row. The legitimate pending attack, enemy dice, initiative and action budget are retained. No enemy attack or action cost is repeated.

If an attack/defense reference is missing or inconsistent, or Armor is already recorded while a required defense is missing, the workflow stops for audit/adjudication. It does not erase records, invent a defense, invite a favorable replacement roll, or guess a final outcome. Restoring consistent evidence is a manual recovery step for such damaged data.

## Pools and attachment compatibility

New source-backed declarations store `defensePools` inside the existing `CombatAttack` JSON. This is a per-decision snapshot, not a parallel character or pending-action store. It records the attribute, current Base dice, skill, Gear dice and modifier before a push changes the character.

Dodge uses the actual Move pool and the verified Slash modifier. Parry uses the actual shield or held weapon, applicable source-backed Stab/unarmed/non-Parrying modifiers, and the existing recorded shield modifier. The source summary still comes from authorized indexed original Handbook passages. No new sourcebook parser, invented talent modifier or permission change was introduced.

Validation checks the original pool and its sign/counts; a valid push preserves that pool. Original roll IDs, saved fingerprints, pre-roll gates and first-compatible-result ordering remain in force. Missing required modifiers are rejected. They cannot silently consume the defense or make a later correct result ineligible. Extra situational modifiers that are not established in the recorded request still require adjudication before rolling.

Armor requires the Armor label and Armor metadata, no attribute/skill/weapon binding, no push, and the recorded armor/helmet rating. One shared rating calculation now agrees with the existing sheet's worn/carried pieces and recorded modifiers, including supported ignored armor. Existing selected artifact dice are retained by reusing sheet controls. Custom Roll and Move cannot be relabeled by narrative text.

Bound Custom/unknown rolls enter combat validation. Ordinary noncombat skills such as Survival retain their existing independent submission path. Resource and D66 behavior is unchanged.

New directly staged requests carry `expectedCombatContext` through the existing create command. If the attack, round, actor or required step changed before saving, the server rejects the save transaction instead of silently binding those faces to a new phase. Legacy generic rolls retain their existing saved context/ordering checks.

An already-consumed roll says so. A different Move submitted during Armor identifies the defensive roll already recorded, states that this Move was not consumed, and directs the player to proper Armor. No generic AI interpretation fallback handles these errors.

## Character sheet, Recent Dice Rolls and narration

The sheet shows **Pending Dodge / Parry / Armor**, the requested pool or rating, and **Stage requested …**. Staging fetches the current protected server request. Ordinary sheet dice retain the existing fallback when that protected combat view is unavailable; no separate player credential was added. Server-side combat ownership, preparation and submission checks remain mandatory. Matching native Move/Melee, shield Parry and Armor controls use that request too. Rolling, optional pushing, attaching and sending remain player-controlled.

Attachment preflight gives a visible error before closing the sheet when a result is incompatible. The main composer also checks incoming attachments. Recent Dice Rolls shows the saved combat step, round and attack reference, the current request and specific eligibility reasons. Ineligible selected-character combat results are disabled there; server validation remains authoritative for direct requests and other controls. Detailed dice and recorded push consequences remain in dice history.

Combat checkpoints now retain the pending attack ID. The narrator receives progress on the same attack instead of another declaration. After failed Dodge, the compact canonical progress states the recorded successes and pending damage before Armor. After Armor, a canonical line states the actual remaining damage for the player to apply. The model cannot replace the requested phase or its verified result. No expanded dice card is inserted into chat.

## Persistence, retries and data safety

Existing `combat_encounters`, `combat_commands`, dice records, `ai_requests` and SQLite transactions are reused. No migration, reset, live campaign edit or automatic inventory/ammunition/character-damage change is required.

A mechanics receipt commits before narration. Retrying a failed narrator reuses that receipt, the exact defense/Armor IDs and existing roll request identifier. A lost browser response can replay the completed reply. Neither path consumes the roll twice or generates another enemy attack. Push effects remain owned by the existing dice engine and are never reapplied by submission.

A saved pending request and its pool survive refresh and SQLite reopen/server restart. Existing pending records without a pre-push pool snapshot retain their prior checks; the application cannot retrospectively prove a missing historical pool. New declarations persist the stronger snapshot. Existing immutable legacy narration receipts are replayed as saved; old chat text is not rewritten.

## Changed paths

| Area | Files |
| --- | --- |
| Evidence, pool and rating helpers | `src/server/combat/defensive-rolls.ts`, `requested-roll.ts`; `src/lib/combat/requested-roll.ts` |
| Resolution and projections | `engine.ts`, `workflow.ts`, `store.ts`, `eligible-rolls.ts`, `attachment.ts`, `narrative.ts` under `src/server/combat/` |
| Existing checkpoint/type extensions | `src/server/combat/service.ts`, `action-dispatcher.ts`, `src/lib/combat/types.ts` |
| Staging race validation | `src/lib/dice/schema.ts`, `src/server/dice/service.ts`, `src/app/api/combat/route.ts` |
| Sheet and attachment UI | `src/components/sheet-embed.tsx`, `campaign-app.tsx`, `recent-dice-rolls.tsx`, `combat-panel.tsx`; `scripts/sheet-bridge.js`, generated `src/lib/sheet-version.ts` |
| Tests and instructions | `tests/defense-sequencing.test.ts`, `defense-sequencing-real.ts`, `defense-sequencing-browser.cjs`, existing combat fixtures/browser assertions, `package.json`, README |

Existing fixtures now use the actual declared Move pool and correct Armor metadata. A previous manual +2 in a browser test was replaced with an assertion of the automatically staged modifier, avoiding double application. The workflow test now verifies visible preflight rejection plus server rejection of an incompatible roll, rather than trying to click its correctly disabled Submit button.

## Executed verification

| Check | Result |
| --- | --- |
| Before-change full gate at `0cc79ea` | 370 unit tests and 127 actual-sourcebook tests passed |
| Targeted defect reproduction on unchanged baseline | Four tests failed, reproducing the identified phase/routing/diagnostic gaps |
| Final unit suite | 377 passed, zero failures/skips |
| Final actual-sourcebook suite | 135 passed, zero failures/skips |
| Original private PDFs | Both fifth-printing books available and tested: 212-page Handbook and 268-page GM Guide |
| Actual-PDF browser suites | All eight passed: defensive sequencing, combat workflow, narrative combat, roll timing, dice chat, action interface, mobility and equipment catalog |
| Other browser regressions | Ordinary roll-to-GM submission passed; production persistence and dice repair passed |
| TypeScript and optimized production build | Passed |
| Paid/live model calls | Not made; SDK/RNG controlled in automation |

The production dice check also caught and verified correction of an initial combat-view availability regression: signed-out/unconfigured combat access must not disable ordinary independent sheet rolls. The protected combat endpoints and authoritative submission checks were preserved.

## Run checks and verify locally

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/absolute/private/books npm run test:defense-sequencing
npm run typecheck
npm run build
npm run dev
```

The new browser test uses both original fifth-printing PDFs in an isolated temporary campaign. It exercises actual main-chat declarations and character-sheet dice attachments through rounds 1–4, with pushed Dodge in round 2 and zero-success Dodge in round 4. It checks modifier staging, explicit zero-success Armor, visible Custom/late-Move rejection, lost-response retry, refresh/server restart, exact saved IDs, one enemy attack per round, no duplicate push effect, exact final damage, no automatic player damage, compact chat and mobile width. SDK responses and RNG are controlled only in the test transport; no paid model calls occur.

For a manual check, use the actual campaign's character and enemy. Open the requested character sheet after declaring Dodge; select **Stage requested Dodge**, roll, optionally push, attach and Send. If the verified attack still causes damage, reopen the sheet and select **Stage requested Armor**. Check Recent Dice Rolls for the distinct defense and Armor IDs. Retry a failed request through its existing Retry control. Do not make a new Move roll to replace a defense already recorded.

The exact historical Round 4 cause remains unconfirmed without its campaign/request records. The repaired sequencing, compatibility and diagnostic paths are tested independently of a live model. Unsupported situational rules and genuinely damaged/missing audit evidence still require adjudication; they are not silently approximated.
