# Phase 6.7.2b — GM preparation, scene progression and combat recovery

Based on commit `2003ae4`, on `ravenland-ai-gm-prototype`. All development and browser playtests use isolated databases. No live Belderand record, historical die, position, injury or clock was repaired or replaced.

## 1. Root causes and controlled reproductions

The existing monster catalog already retrieves Nightwargs from the original indexed Guide. Ordinary investigation dialogue did not invoke private preparation, so a conversational monster identity could remain unverified. A player's later suggestion could then dominate the dialogue without a linked encounter plan. This phase adds a private candidate before revelation; it does not claim to reproduce the internals of the historical live model.

Scene context held recent prose but lacked a deterministic distinction between a committed investigation, a continuation and an options question. Repeated declarations could produce the same choice again. Recent-intent context and a repeated-question guard now retain the investigation and cautious approach, without granting an automatic discovery or imposing a turn count before combat.

The reproducible combat dead end is precise: `beginEnemyAttack` can save an out-of-range monster attack in **adjudication**. `declareDefense` requires **declaration**. The existing `/combat resume` only handled missing armor; a verbal range confirmation neither moved the monster nor reopened the defensive window. A subsequent Dodge correctly failed its phase check, while encounter closure correctly refused the unresolved action. There was no supported bridge between those protections.

The real-PDF regression creates Nightwarg → Rending Attack at Near → adjudication, demonstrates rejected Dodge and blocked closure, then records a legal fast approach and reopens the same attack's pre-roll window. The table draw, attack ID, spent slow action and correction reason survive. Natural Grogahx Dodge then reaches the existing dispatcher.

Other reproduced boundaries include an attack declaration before initialization, narration asserting initiative without a real encounter, repeated Dodge while its roll is pending, an unsubmitted sheet roll blocking supersession, and activation at an unentered/different scene. Existing Phase 6.7.2a tests preserve the distinction between intended U06, saved navigation and committed entry.

## 2–3. Architecture, persistence and visibility

`combat/preparation.ts` stores typed encounter preparation as metadata on existing **GM Only / Secret** campaign memories, using the existing `memory_history` audit. This is planning, not a second canon or a new combat engine. It records concept, verified catalog identity, source references/fingerprint, intended local scene, terrain, trigger, motives, conditions, proposed participants/range, possible outcomes, provenance and unresolved questions.

States distinguish concept, source-verified preparation, foreshadowing, explicit revelation, activation and resolution/cancellation. Activation links the original memory ID into the canonical encounter; a concluded linked encounter projects as resolved. Revisions use the same preparation ID, current revision and a specific controller reason. Cancellation retains history. Automatic preparation does not duplicate an already open threat, including when the party changes hex.

Preparation alone writes no player Journal, exploration, combatants, dice, movement or time. Foreshadowing remains private. **Reveal identity without combat** is an explicit controller operation that writes only that discovery to the Journal; it grants no encounter, damage or movement. Hidden metadata is stripped from public memory views. The dedicated preparation API requires the trusted local GM controller. Up to three relevant private preparations are supplied only to server-side generation, not saved public AI context or party-known retrieval. The narration guard withholds an unrevealed prepared name.

## 4. Monster selection and source retrieval

An explicit investigation of a creature/threat can prepare a private creative candidate from established recent reports and actual terrain. The bounded current policy considers a source-verified Gray Bear for woodland tracks. Nightwarg is considered only at night without track evidence. A player's speculative name does not force this choice. This is labeled **GM creative preparation**, never a fabricated random-encounter roll.

If required source material or an applicable rule is unavailable, the record remains a concept with verification questions; it cannot activate mechanically. The GM controller can review another supported catalog identity with a reason. Activation rereads the actual indexed entry and checks the fingerprint; changed evidence requires renewed review. Existing scoped combat house rules still block silent official defaults.

The original Nightwarg entry contradicts the reported daytime track-following scene: Nightwargs appear only at night and leave no tracks. New official Nightwarg activation checks the current Night quarter. This restriction does not rewrite or delete an existing daytime encounter. Any deliberate exception requires an explicit source/house-rule review; it is not inferred from old AI prose.

## 5. Scene progression

`sceneIntent` derives the latest committed investigation from a bounded recent player history. It distinguishes options, following tracks, investigation, continuation and stopping. It retains cautious approach and requested equipment readiness as declarations, not completed combat operations. Questions do not establish decisions; continuing does not erase the earlier intention. Current authoritative hex remains explicit.

Adapter v1.17 instructs the GM to provide new observations, justified procedures, consequences or materially new decisions. The deterministic repeated-choice guard replaces another invitation to follow the same tracks with the unresolved evidence/procedure step. It does not convert a Scouting or Survival success into a lair, exact identity, initiative or hex entry. Production-model storytelling quality is not established by controlled tests.

## 6–8. Initialization, initiative, positioning and monster actions

Prepared activation uses the existing combat service, transaction, source lookup, initiative deck, request fingerprint and replay receipt. It confirms actual PCs, actual current scene and chosen range before drawing cards. The lowest numbered saved card acts first. A preparation is not active combat. Hostile declarations point to the exact initialization controls before requesting an attack roll; narration cannot draw initiative.

The encounter controls retain their participant and range selectors. The private preparation panel offers **Activate prepared encounter**. Ambiguous starting range is established there once and persisted with the encounter. No surprise advantage is invented; special surprise adjudication remains explicit.

A controller may explicitly confirm that selected PCs share one zone with a clear ordinary approach. That reviewed formation permits a single monster's legal approach to that zone without moving PCs. Ordinary Nightwarg approach uses an available fast action before its slow attack/table operation. Unreviewed multi-character positioning, rough/blocked paths, exact Long distances and special movement stay held. Distant remains outside the supported encounter range model and requires adjudication. The shared-range model is preserved; no zone graph or second tactical engine was added.

Monster actions still pass through the legal-choice policy and deterministic engine. The printed table is rolled and saved; complex conditional entries retain their adjudication hold. No printed special attack is replaced with a generic damage roll.

## 9–10. Reactions and saved dice

`reaction-intent.ts` recognizes explicit selected-character declarations such as **Grogahx dodges.** and **I parry.** against the current pending attack. Questions, negation, another PC's name and claimed success totals are not accepted as mechanical results. The operation goes through the same typed dispatcher as the Combat buttons, with existing authorization and defense eligibility.

Once Dodge is declared, repeating it returns the same requested roll without spending another action or rolling another attack. An unavailable decision explains the actual pending phase, participant and next control instead of returning only the old generic rejection.

The existing sheet staging and submission path remains authoritative: Stage requested Dodge/Parry → roll → optional legal Push → Attach → Send. Existing checks bind encounter, round, active turn, attack, responder, defensive skill, pool and timing. The first compatible saved card remains required. Claimed success counts, stale rolls, wrong skills, Armor substitutes and retroactive reactions remain rejected. Player damage remains sheet-managed under the existing architecture; it is not silently applied by narrative text.

## 11. Bounded combat recovery

**Combat → Pending action review** shows encounter, round, actor, attack reference, targets, recorded range, phase, defense status and exact requested procedure.

For a range-only unrolled monster adjudication, the local controller can record a specific reason and:

- Confirm a legal ordinary Near → Arm approach, spending an available fast action, and reopen the pre-roll defense window.
- Recheck the already recorded range; a verbal assertion cannot change it.
- Supersede an invalid unrolled declaration when no defense has committed. The original declaration, table draw and spent actions remain in the audit; nothing is refunded.

Saved attack/defense/Armor dice, results, consequences and even a bound but unsubmitted sheet roll prohibit supersession or reopening. Existing committed pre-roll choices are preserved. Missing Armor continues through its existing recheck operation. Mandatory injury and special attack adjudications remain mandatory; there is no force-close operation.

Corrections use the existing combat command transaction and idempotent receipt. The full original pending declaration is retained in `recoveryAudit`; Combat History projects the reason and position change. An ended encounter retains that audit.

## 12–13. Journey interruption and synchronization

Encounter activation takes the actual authoritative scene; it cannot establish an unentered destination. Hex entry remains the existing quarter-day engine operation. A navigation success without an entry receipt does not move the party. Active combat suspends travel while preserving the pending quarter, original assignments, saved checks, actual position and already entered hexes.

After combat and mandatory consequences, record the linked encounter as resolved in the same expedition. Continue with the next eligible hex's navigation, or stop at the actual position. Finishing advances exactly one quarter. Map, exploration, sidebar and AI journey context use the same saved position and refresh events.

The travel progress element uses confirmed entry receipts divided by reviewed allowance: e.g. **1 of 2 eligible hexes entered · 50%**. It represents distance allowance, not exact elapsed time. The separate narrative elapsed-time indicator remains unchanged. Zero allowance is displayed without dividing by zero.

## 14. One next-action control

A compact **Continue · …** control sits with the existing active gameplay controls. Its server-derived priority is campaign setup, life/mandatory consequences, active combat, then the existing submitted quarter and ordinary conversation. It points to the actual reaction, requested roll, blocked-action review, GM turn, navigation/entry, encounter review or quarter completion.

The control opens the relevant notebook/quarter control or sheet, and switches responder context where needed. It never chooses a PC action, rolls dice, approves a ruling or runs an uncontrolled AI sequence. All four notebook tabs and the complete quarter panel retain their collapsible behavior and mounted input state.

## 15. Sourcebook validation

Both original uploaded fifth-printing PDFs are indexed in isolated fixtures; the Guide remains GM-only. Nightwarg identity, attributes, armor, movement and all six attacks are retrieved from the actual entry, not a synthetic stat block or previous AI prose.

| Evidence | Printed pages | Physical PDF pages |
| --- | --- | --- |
| Guide monster action, range, extra damage, no Push, defensive exceptions | 73–74 | 77–78 |
| Guide Nightwarg identity, restrictions, statistics and attack table | 114–115 | 118–119 |
| Handbook combat rounds, numbered initiative, movement/range, actions and defenses | Combat chapter, checked through indexed rule references | Exact chunk/page citations retained by the engine |
| Handbook pools, Push, Armor, damage, Broken and critical procedures | Existing original-source regression fixtures | Exact chunk/page citations retained by the engine |

The Nightwarg regression checks Rending's actual pool and damage, Dodge eligibility, its lack of Parry permission, the bite's printed Parry exception and the held conditional follow-on attack. Full existing real-PDF regressions cover weapon distinctions, defense timing/pools, legal Push, Armor, damage, Broken, critical injuries and source/house-rule priority.

## 16. Schema and migrations

No SQL migration is needed. Preparation metadata and history use existing memory records. `CombatEncounter` adds optional preparation linkage, reviewed group positioning and correction audit fields. Old saved encounters remain readable, and no migration rewrites existing attacks or historical rolls. New APIs are `/api/combat/preparation` (private controller only) and `/api/next-action` (authorized gameplay context). Existing combat API adds its bounded recovery preview.

## 17–18. Validation and browser results

Validation passed: **529 regression tests** and **205 original-PDF checks**, with zero failures or skips. The focused source-backed expedition rerun passed **11 checks**, including a failed-navigation next-action assertion; the final AI/progression rerun passed **16 checks**. The final preparation/recovery rerun passed **10 original-PDF checks**, including a premature attack-roll narration guard. Production build, TypeScript checks and whitespace checks passed. The new GM/journey browser flow and the existing defense/Armor/Push and expedition browser regressions passed. Commands use isolated databases, original private PDFs, controlled providers/dice and no paid model calls. The older defense browser fixture was updated to open its Combat tab explicitly after refresh, preserving Phase 6.7.2a’s all-tabs-collapsible behavior.

The required browser fixture has four PCs traveling at night over actual adjacent Forest hexes T05 → U06 → V05. Night is deliberate so the original Nightwarg scene is valid; its navigation review applies the verified darkness modifier. It confirms the first entry, an already open map window, private preparation without a public discovery, source-backed activation, five saved initiative cards, lowest-first order, the legal monster approach and the pending Rending reference. Grogahx declares Dodge naturally, rolls the staged pool on the actual sheet, attaches the bound two-success result and resolves the attack. A specifically controller-established surrender concludes the fixture without dropping any pending attack; no surrender was inferred from a Dodge. The same pending expedition records that encounter resolved, continues to V05, completes once and replays without another movement/clock advance. The fixture also checks original record identity, Rumored status, urgent badges, collapse/input retention, Other without recovery, interrupted restart and mobile width.

This is a controlled engine/UI reproduction, not evidence that a paid live model will always make the same narrative or tactical choice.

## 19. Remaining limitations

- Automatic creative preparation currently uses a small supported catalog policy; it is not a complete terrain-specific random-encounter generator. Unsupported monsters or missing evidence remain concepts. The controller can review supported identities; no statistics are invented.
- Starting range, actual participants, group positioning, genuine surprise and ambiguous scene conditions still need explicit review. The tactical model retains one shared range. It does not infer multi-enemy relative zones or exact Long movement.
- Complex monster follow-ons, grapples, forced displacement, conditional targeting, exceptional abilities and scoped house rules retain adjudication holds. Recovery does not automatically resolve those effects or delete rolled malformed states.
- The lightweight pacing guard prevents repeated investigation choices; it does not guarantee rich production-model prose or automatically grant clues from every success. Extra successes and specific skill effects retain source-backed GM adjudication.
- Private preparation and recovery corrections use trusted local controller authority. Hosted player sessions cannot read those private records or make controller corrections until an explicit GM identity is implemented.
- Existing per-hex movement limits, exceptional travel restrictions and sheet-managed player damage remain as documented in Phase 6.7.2a and the combat workflow.

## 20. Manual Belderand recovery

1. Update/restart the application and export a campaign backup. Test a copy first. Do not reset the campaign or regenerate dice.
2. Read **Continue**, **Combat → Pending action review**, Combat History and the existing submitted Day expedition. Compare actual encounter location with the authoritative map/sidebar. Old narration claiming U06 is not an entry receipt.
3. Preserve the original Grogahx Lead the Way, Rose Keep Watch, Day entry and unfinished Nightwarg action. Inspect the actual attack ID, phase, range, reaction and saved cards. Do not substitute this document's fixture outcomes for live outcomes.
4. If the saved action is range-only adjudication with no attack/result already rolled, establish the actual relative positions. For a legal clear Near → Arm approach with an available fast action, record the specific reason and use **Confirm legal approach and reopen defense**. Otherwise review positioning or explicitly supersede only an invalid unrolled, undefended declaration. No action or table draw is refunded.
5. If the attack already has saved dice or consequences, retain them and complete the exact requested defense, Armor or adjudication. The correction controls intentionally refuse to discard it. A damaged/missing historical result needs evidence restoration and explicit adjudication, not a reroll.
6. Select Acting As the attacked PC. Declare Dodge only in its legal pre-roll window. If Dodge is already declared, proceed to **Stage requested Dodge**, use the existing eligible saved result or roll when genuinely requested, optionally Push when legal, Attach and Send. A typed success count is not a saved result.
7. Resolve the remaining attack, Armor, damage and mandatory injuries through their existing controls. Record any player-sheet damage under the current damage-authority policy. End combat only when its obligations are complete or an established withdrawal/surrender permits conclusion.
8. Separately review the source inconsistency: the official Nightwarg appears at night and leaves no tracks. Do not change the live Day clock, monster identity or past fiction automatically. Record an intentional exception through the established ruling/house-rule review process, or adjudicate the contradiction in the backed-up campaign before further mechanical play.
9. Return to the original pending expedition. If its authoritative position is still T05, do not pretend that U06 was entered or move a historical fight by editing prose. Review its original navigation, route, encounter location and required consequences explicitly. After the existing encounter is concluded, use the actual first-hex entry operation if legally appropriate; it is a new confirmed operation, not invented historical movement.
10. When the encounter and location are reconciled, record the linked encounter resolved, review remaining travel allowance/conditions, then continue the same quarter or finish at the actual position. Confirm the map, sidebar, Journal and next quarter agree. Retry must not duplicate dice, damage, entries or time.

Screenshots: [pending reaction](phase6-7-2b-combat-reaction.png) and [completed journey](phase6-7-2b-gm-progression.png).
