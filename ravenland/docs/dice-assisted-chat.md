# Phase 6.3 — Dice-assisted narrative chat

## Implementation

The baseline was `916a137` on `ravenland-ai-gm-prototype`, with a clean working tree. The existing dice records, server verifier, push workflow, combat engine, command receipts, narration packet, character sheets and campaign persistence were retained. No parallel dice engine or pending-action store was added.

The player opens a sheet through The Party, clicks its weapon attack icon, chooses a legal attack type/target and prepares the attack. The application commits the same `CombatEncounter.pending` used by chat declarations and the Combat panel. Initiative, resources, weapon statistics/features, range, action allowance and enemy pre-roll reaction are validated through the existing service. Preparing is an application request, with no AI narration or model call. A matching already-pending attack stages directly with its immutable type and target. An intentionally unbound pool can still be rolled for history/practice; its presence does not authorize combat resolution.

After rolling and optional push, **Attach roll to chat** places the saved roll reference in Acting As. The composer shows a compact result and saved push effects. Narrative text remains editable. Sending uses the existing `kind: roll` protocol with a stable roll request ID, fingerprint, rolling character and narrative `action`. There are no client success/damage fields. `verifiedRollSubmission` reads the actual saved dice, original pool, final pushed faces, weapon snapshot, context and consequences. It exposes `playerExplanation` separately from authoritative values.

The existing engine binds that result, resolves the already-chosen defense, rolls/applies armor, calculates damage and updates enemy Strength/Broken/critical state before narration. Existing mechanical command and narration receipts prevent repeated consumption, damage or push effects. Player-reported damage/successes in the text remain statements; they do not override the record. Explicit changes of attack type, another recorded weapon, another combat target or the predeclared defensive response are rejected before consumption. Noncombat attachments bypass attack validation and provide their verified result with the player's explanation; they do not resolve or consume a pending attack.

The main chat contains the player's prose plus a compact roll reference, followed by GM narration. Complete dice remain in Recent Dice Rolls and the existing combat audit. The Combat panel offers the same attachment action and its instructions direct players to attach and Send. It still shows initiative, round, turn, conditions, available responses, End My Turn and collapsible history. Its legacy submission controls remain usable; ordinary attacks no longer require them.

## Authoritative attack rules

`verifiedAttackRules` reads the existing indexed original Handbook pages directly. It verifies each governing passage before exposing the summary. Numerical modifiers are extracted from the source text; missing evidence returns adjudication. Existing house-rule precedence and indexed-source checks remain. The summary and source references are stored on the existing attack, refreshed against current authorized rules before resolution, used for the engine's defense/damage/armor calculations and included in `verifiedCombat.attackRules`. Ordinary combat narration skips broad rules retrieval. Rules questions and noncombat retrieval retain their existing pipeline.

Both private fifth-printing PDFs were available and tested: Player's Handbook (212 PDF pages) and Gamemaster's Guide (268 PDF pages). The following are the exact physical source locations and governing passages used; printed page numbers are shown separately to avoid confusing the two.

| Handbook physical PDF / printed page | Passage | Verified use |
| --- | --- | --- |
| 46 / 42 | Rolling Dice / success threshold | One success establishes ordinary action success; the existing attack threshold verifier supplies this evidence. |
| 95 / 91 | Close Combat: Dodge and Parry timing | Defensive reactions are declared before the attack roll. |
| 96 / 92 | SLASH | Requires an Edged or Blunt weapon; uses Melee and Gear Bonus; base weapon damage plus one per additional success. |
| 96 / 92 | STAB | Requires Pointed; uses Melee and Gear Bonus; its own additional-success damage and defense rules are independently verified. |
| 96 / 92 | DODGE | Dodge against Slash gets +2 Skill Dice. Default Dodge establishes prone; remaining-standing variants retain existing adjudication limits. |
| 96–97 / 92–93 | PARRY and Attack & Defense table | Stab: weapon Parry −2, shield Parry +2. A weapon lacking Parrying has its separate −2 penalty. |
| 97 / 93 | STAND UP | Melee attacks against an already-prone target get +2. Existing actual Stand state/action costs remain authoritative. |
| 101 / 97 | Ranged Combat: Range | Ordinary Short −1, Long −2, Arm −3; Near is the baseline. Special defenseless-target exceptions are not assumed. |
| 102 / 98 | SHOOT | Existing source-backed ranged attack damage and defense rules remain in the combat engine. |
| 105 / 101 | Melee Weapons table: Shortsword and Blunt weapons | Shortsword: Gear +2, Damage 1, Edged/Pointed/Parrying; legal choices Slash and Stab. Verified Blunt rows such as Mace support Slash. |
| 109 / 105 | Armor | Actual armor successes reduce damage by one each; armor is not a flat reduction and cannot be pushed. |

The rules explicitly describe SLASH as requiring “the EDGED or BLUNT feature” and STAB as requiring “the POINTED feature.” **BLUNT is a feature/damage classification, not a separate ordinary weapon attack action.** A verified Blunt-only weapon is presented as **SLASH (Blunt weapon)** and uses engine kind `slash`, its appropriate defense interactions, and the existing blunt critical table. Shortsword is never offered a fabricated Blunt action. Unarmed PUNCH/KICK/BITE is a distinct official action and has not been silently substituted for a weapon attack; it remains unsupported by this initial selector and requires adjudication.

The Gamemaster's Guide continues supplying the existing authoritative NPC/monster records, including the Bandit row on physical page 187 and supported monster tables. Private bodies, enemy attributes and GM-only records are not returned by the preparation endpoint or composer.

## Equipment and timing

The preparation view contains the existing weapon row index and a hash of character ID, row index and recorded row contents. This identifies the selected equipment snapshot without introducing a second inventory or item catalog. A changed row invalidates preparation. The existing immutable weapon snapshot and index on the saved roll then establish which item was rolled, including push wear. The options come from official weapon features and the verified rules, never model inference.

Attack-specific modifiers are staged before rolling. The melee prone bonus uses the target's state before the declaration; it does not invent another modifier from the enemy's newly declared reaction. Defense modifiers use the verified attack summary. Existing player modifiers/talent differences that cannot be verified still require adjudication.

An attachment does not consume a result or change its timing. The server still requires the same encounter, action, turn, ready response and first compatible saved roll. A known outcome cannot be reassigned to a new attack type or retroactive defense. Multiple known rolls cannot be selected by highest successes. A saved roll made before mandatory choices remains in history and produces a specific eligibility error; a new legally timed result may be necessary. Push remains controlled by the player and keeps its original damage/Willpower effects exactly once.

Already-declared ranged, defense and armor rolls use the attachment transport too. New sheet-driven ranged declarations pause because the current sheet does not record bow readiness or crossbow loading; the application does not assume those mandatory steps. The existing chat/combat adjudication flow remains available. No new automatic Ready/Load, inventory enforcement or resource expenditure was introduced by preparation/submission.

## Drafts, retries and security

The unsent text, character ID and roll ID are stored per campaign in browser local storage. Remove Attachment leaves the text and saved roll intact; Cancel Draft clears the local message and reference, retaining the dice record. Changing Acting As is disabled while attached so the displayed author matches the rolling character. A newly pushed saved result updates the visible facts and fingerprint. A missing, stale or closed-encounter combat result yields an error and retains the draft; it never falls through to ordinary narration.

Embedded sheets send an origin/source-checked message to their parent. Separate character windows notify campaign chat through a same-origin BroadcastChannel and persist the reference for a later refresh. The transfer contains identifiers, not trusted success totals. The receiver reloads campaign data, and the server still verifies character ownership. This works within the same browser profile; it is not multiplayer synchronization.

There is one HTTP submission and one stable logical action for the attachment and prose. The existing claim, atomic mechanical command and narration transactions remain separate to support recovery from upstream failure. No partial attack damage is committed: the mechanical resolver commits its result and receipt together. A failure after that point can leave an attempted player message and finalized roll awaiting narration; retry reuses the same verified events. If a request has already been claimed, changing its prose and reusing its stable ID is rejected. Use Retry GM Response for the original request; an invalid request rejected before claim may be edited and resubmitted. Completed-roll submission status is maintained through the existing tracking endpoint.

Preparation GET and POST reuse `gameplayPrincipal` and `requireCharacterAccess`. A client-supplied character ID, equipment hash or roll reference cannot grant ownership. The GM instruction revision is v1.14 for attachment-aware narration; the canon regression retains all original memory checks and updates only its expected instruction version. There is no new credential, public authentication bypass, model switch or source visibility change. Character-private and GM-only context boundaries remain. No paid request is made merely by staging, pushing, attaching or preparing. No automatic canon/journal promotion occurs for a submitted roll.

## Files changed

| Area | Files under `ravenland/` |
| --- | --- |
| Existing request/verification contract | `src/lib/ai/schema.ts`, `src/lib/dice/gm-submission.ts`, `src/server/dice/gm-submission.ts`, `src/server/ai/service.ts`, `src/hooks/use-gm.ts` |
| Composer and attachment transfer | `src/components/campaign-app.tsx`, `composer-roll.tsx`, `recent-dice-rolls.tsx`, `combat-panel.tsx`; `src/lib/dice/attachment.ts`; `src/app/globals.css` |
| Sheet preparation and bridge | `src/components/sheet-embed.tsx`, `sheet-attack-preparation.tsx`; `scripts/sheet-bridge.js`; generated `src/lib/sheet-version.ts` |
| Verified rule/preparation service | `src/lib/combat/attack-rules.ts`, `types.ts`; `src/server/combat/attack-rules.ts`, `prepare-attack.ts`, `attachment.ts`; `src/app/api/combat/prepare/route.ts` |
| Existing mechanical/narration integration | `src/server/combat/service.ts`, `engine.ts`, `narrative.ts`, `workflow.ts`; `src/server/ai/provider.ts`, `instructions-v1.ts` |
| Tests and commands | `tests/dice-chat-browser.cjs`, `combat-real.ts`, `roll-gm.test.ts`, `ai-canon.test.ts`, `roll-timing.test.ts`, `roll-timing-browser.cjs`; `package.json` |
| Documentation | `README.md`, this report |

The persisted additions use optional fields in existing JSON records. No migration, database reset, dependency installation, full book copy or user upload is included.

## Verification

The required baseline real-sourcebook suite passed all **66 tests** before changes. The completed retrieval gate passed **325 unit tests and 70 actual-PDF integration tests**, with no failures or skipped tests. Both original fifth-printing PDFs were available, extracted and indexed by the tests. TypeScript checking and the production build also passed.

All **15 browser suites** passed: `dice-chat`, `pending-encounter`, `combat-narrative`, `encounter-fidelity`, `combat-workflow`, `combat`, `roll-timing`, `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation` and `windows`. The first seven use the actual private sourcebooks; the other suites retain their existing isolated fixtures and were run against a fresh production build. The new attachment suite also passed a final development-server run after the instruction-version and workflow wording updates.

Commands executed from `ravenland/` included:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:dice-chat
npm run build
npm run typecheck
```

The remaining browser scripts were executed with their `npm run test:<suite>` commands and the same private-sourcebook directory where required. Screenshots were inspected in temporary storage, including the compact attached result; the browser suite checks a 390-pixel viewport for visibility and horizontal overflow.

The new browser test uses the actual indexed books, real character-sheet controls, saved server dice and controlled SDK/RNG responses. It checks sheet-only Shortsword preparation, legal Slash/Stab choices, pre-roll defense, roll/push, attachment, edited narrative, refresh/detach/reattach, one combined message, defense/armor/Strength, stable retry, stale/type rejection and retained draft, noncombat attachment from a separate character window, End My Turn and desktop/mobile usability. It asserts that combat narration receives the verified attack summary and no broad retrieval passages, that full dice cards are not copied into narrative chat, and that campaign time/location and player-managed damage remain unchanged.

Four new real-PDF cases verify original source options/modifiers and missing-evidence rejection, preparation and combined prose/dice resolution, early/stale/unauthorized/type-change prevention, and noncombat attachment during a pending attack without modifying that attack. Unit additions check editable prose versus verified totals, immutable attack weapon/target/type, and predeclared defense protection. The previous forged numeric-field rejection remains; free-form prose is now allowed and verified independently. The earlier timing browser suite explicitly selects an unbound pool when deliberately testing an illegal early roll, while the new browser suite exercises the complete preparation interface.

All tests use isolated temporary databases and private PDF storage. They do not modify the live campaign. Original books, full extracted text, upload files, fixture databases and source-body snapshots are excluded from Git. Controlled test providers do not establish production-model prose quality; no paid OpenAI calls were made.

## Remaining limits

- The initial new declaration selector completes ordinary weapon melee attacks. New ranged readiness/loading, unarmed maneuvers, complex talents, arbitrary loadouts and unsupported movement still require existing adjudication. Attaching an already-established supported roll remains available.
- Recognition of conflicting prose is bounded; free-form text remains intent rather than a mechanical command. The engine's verified result and narration safeguards remain authoritative.
- Draft restoration depends on browser storage. Cross-device drafts, multiplayer identity/synchronization and attachments across separate browser profiles are outside this phase.
- A failed claimed submission is finalized for push purposes. Retry its saved final result; do not change the prose or attempt another push after claim.
- No existing campaign records were rewritten speculatively. Restart/reload the application after updating; production builds regenerate the embedded-sheet asset version so client and iframe code agree.
