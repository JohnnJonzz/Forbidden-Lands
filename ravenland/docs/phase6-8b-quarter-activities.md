# Phase 6.8b — Quarter-day activities and daily needs

Baseline: `727eb5f957cb2a60c6c30955b496f36acc357998`, branch `ravenland-ai-gm-prototype`.

## 1. Evening camp misrouting

The Phase 6.8a assumption matcher accepted “We're … quarter-day” before distinguishing a camp plan. The exact declaration includes both expressions and no excluded travel verb, so it could produce a remaining-travel-allowance response. A stationary activity intent now takes precedence over that assumption path. It directs players to the existing menu without silently applying chat assignments. The regression recreates the completed T05→U06 Day journey and administratively aborted Nightwarg, then changes the menu assignment from the earlier chat's Cook to Forage. Old Day Tracker and encounter JSON remain unchanged.

This is a controlled reproduction, not a forensic claim about unseen live timestamps. The live database was not inspected or changed. Consequently, the earlier live sequence of manual assignment edits cannot be conclusively reconstructed; the implementation does not attribute those edits to AI invention.

## 2. Missing Make Camp and Foraging rolls

Changing the old menu activity set its skill to `Manual review`. The saved-card dropdown compared a Make Camp/Forage card's skill directly with that value, excluding `Survival`. Keep Watch had a separate explicit `Scouting` mapping, explaining the different behavior. The dropdown also excluded Submitted cards and did not carry enough step/date provenance to safely broaden its filter.

Routine assignments now create typed requests with character, activity/assignment, date, quarter, resolution step, pool/modifiers, evidence and request ID. A matching sheet result binds automatically. Context, ownership, exact pool, existing binding and replay checks prevent reuse. Failure pauses for a legal Push or an explicit Keep. Historical cards have explicit eligibility reasons; an unused same-quarter card can be linked through the review control. Older/finalized cards require an authenticated, specific GM association; already bound/used cards and incorrect pools remain rejected.

## 3. Existing menu and availability

Quarter-Day Activities remains the organizer. Stationary quarters use **Assign quarter-day activities**, followed by compact per-character statuses, required procedures, saved outcomes, historical review and **Complete quarter-day**. Travel retains the Phase 6.8 controller.

A separate browser defect emerged: an initial menu-form request that lost a revision race never retried. It now retries conflicts and offers **Open Quarter-Day Activities** when no form exists. Daily-settings writes tolerate that initialization race; inventory/activity choices retain revision checks. The trusted local controller can manage the actual party; hosted players still require relevant character grants.

## 4. Hunting and printed evidence

Original Handbook pp145 and 151–153 establish terrain, equipment, search, prey, kill and yield. Hunting requires an actual recorded ranged weapon or trap. Search uses Survival and the terrain/Master of the Hunt modifier. A successful search requests the actual prey D6; extra successes allow optional replacement rolls without recovering an earlier result. A kept prey requests Marksmanship with a weapon or Survival with a trap, using the animal's difficulty and trap eligibility. Master of the Hunt rank 3 offers both actual prey dice and an explicit choice between them. Bow shots require the current Arrows resource procedure before awarding the outcome.

Successful kills add the printed Meat and Pelts to the hunter's existing gear inventory. The engine verifies the supported prey rows against the indexed original table. A missed kill gives no provisions; a failed boar kill requires the actual encounter. A failed search requests the hunting mishap D6. Trap damage/Move escape and sick-prey identification have supported stages; critical injuries, gear selection, cold exposure, encounters and disease resolution use specific review holds rather than invented results.

## 5. Foraging and the reported two Food

Original Handbook pp145, 150–151 provides Survival, terrain and season modifiers, food versus water choice, yield and mishaps. The in-world season is explicitly configured; the computer calendar is not used. Gatherer modifies the roll, grants eligible Rest at rank 2, and doubles Vegetables at rank 3.

Two verified successes yield **two units of fresh Vegetables** before applicable talent adjustments. These are edible raw within one day. They are not automatically two Food-die increases or two prepared Food units. The regression awards two Vegetables once, records them on the correct character and leaves the existing Food die unchanged.

Successful water foraging fills recorded waterskins to D12; it does not fabricate containers or mark anyone as having drunk. Failures request the actual D6 mishap. Leeches apply their supported damage/removal sequence; a persistent animal records its complication without inventing an attack. Other specific consequences remain reviewable. A suspect meal requires a recipient-specific GM review after its actual printed procedure; that review never decontaminates the remaining stack or authorizes another recipient.

## 6. Camp, Watch, Cook, Rest and Sleep

Handbook pp154–156 verifies camp and Sleep. Make Camp uses Survival with Quartermaster's supported modifier and optional rank-3 D8. A successful saved roll establishes shelter. A failure retains a less pleasant camp and a server-private mishap. The GM chooses when to reveal it. Supported resource spoilage and campsite consequences apply once; complex effects require their actual follow-up.

Keep Watch requests no Scouting simply because a character is on watch. The GM can identify an actual threat and request its detection procedure. Success does not prove that no encounter exists. Quartermaster's recorded camp benefit is considered for a supported watch request.

Chef on p74 supplies a cooking-capacity D6 with a confirmed fire, or capacity 12 in a proper kitchen. Rank 2 adds its extra unit; rank 3's supported discrete prepared meal benefit is recorded. Only existing fresh ingredients are consumed. Raw Vegetables, Meat and Fish remain edible within their freshness window without Chef. Prepared Food can be explicitly stowed into the carried Food die under p38's unit conversion; it is never converted silently.

Rest and Sleep apply at explicit quarter completion, using pp108, 111 and 155–156. No arbitrary skill check is requested. Bare-ground Sleep requires its printed Survival/cold procedure. Interrupted activities, bad camps, active conditions, Broken attributes and mandatory obligations constrain recovery. Critical injuries are preserved. An encounter beginning during the quarter prevents claiming uninterrupted Rest/Sleep without review.

## 7. Daily Food & Water settings

Journey Settings includes the checkpoint (Morning, Day, Evening, Night; default Night) and season. Settings persist per campaign in validated session data, including ordinary backup serialization. Restart preserves them. Adventure reset preserves preferences while clearing old needs/activity history and setting a fresh effective date.

A passed checkpoint starts on the next appropriate in-world date. Changes do not charge older dates or repeat satisfied needs. Daily accounting is activated by configuration or adoption of the new activity workflow; old campaigns are not backfilled with guessed consumption history.

## 8. Conversational consumption and sharing

Examples: “I eat fresh Vegetables,” “I roll my Food die,” “I drink Water from my carried supplies,” and “I share Food with Edrus.” Use Acting As for one consumer at a time. Ambiguous stacks, compound allocations and another character's supplies are not guessed. Questions and speculation are not transactions.

Fresh-food sharing moves the actual portion/stack with its identity and acquisition metadata. Receiving it does not force eating. Consuming an eligible portion deducts one unit and clears the applicable Hungry/Thirsty condition. Resource consumption requests a sheet roll. A direct appropriate Food/Water sheet roll can also account for that actor's daily need without a redundant chat attachment.

## 9. Resource dice and the sharing distinction

Handbook p38 establishes D6/D8/D10/D12, depletion on 1–2, the last D6's depletion, unit conversion and sharing. These rolls use their faces and current sides, not the skill-success counter.

The explicit printed sharing rule transfers die steps: decrease the source as much as the recipient increases. The recipient then rolls their own current die to consume. The implementation does **not** assert an unsupported rule that one supplier rolls its own die repeatedly to satisfy other characters. The mixed acceptance test uses sequential legitimate transfers and recipient rolls, preserving the source's changed die after each transfer. A different supplier-roll arrangement requires an explicit supported GM procedure; it is not silently assumed.

Transactions record source, recipient, date, item or roll, depletion and command receipt. Unique daily requirements and saved contexts prevent double satisfaction, reuse across recipients and stale rolls. An unrolled consumption request can be cancelled without refunding or charging resources. Sharing alone is not consumption.

## 10. Daily Needs display

A compact expandable Food/Water table shows Not yet due, Pending, Awaiting a specific roll, Satisfied, Unmet, or Needs GM review. Each status expands to its explanation/source. It is reporting, not two compulsory assignment rows. The configured checkpoint produces a shared prompt describing choices, without selecting another character's supplies.

## 11. Completion and blockers

Routine mechanics resolve as their real steps finish. The panel shows readiness and specific blockers: a required roll, Keep/Push choice, prey/food allocation, mishap, active encounter, due unmet decision, or mandatory consequence.

**Complete quarter-day** verifies the current submission, needs and eligibility, applies supported recovery, records one completion and advances through the existing clock. It preserves the submitted Day Tracker snapshot and attaches outcomes to the same entry. The old raw completion path cannot bypass a routine activity's checks. Retries replay the completion receipt; a new request cannot complete the same quarter again. There is no required free-form resolution paragraph.

## 12. Narration and continuity

The engine emits a natural factual summary from committed assignments: the actual camp maker, forager, hunter, cook, lookout and Sleep result. The AI context contains those authoritative records and daily transactions, with explicit provenance policy. Pattern guards withhold unsupported camp/gathering/Sleep/clock claims and incorrect character assignments in emitted and persisted narration. These guards are bounded checks, not a proof of every possible model sentence.

## 13. Files and migration

Shared typed state lives in `src/lib/activities.ts`. Server modules under `src/server/activities/` cover source verification, state/requests, dice binding, resolution, commands, context and conversation. `/api/activities`, the quarter menu, Journey Settings and sheet bridge integrate them. Existing dice, journey, AI, authority, lifecycle and SQLite validation boundaries are extended.

Migration `025_activity_private.sql` adds GM-private camp/meal procedure state, outside shared campaign JSON. Activity receipts reuse `journey_actions`; time still uses the existing quarter completion. Physical provisions remain existing gear rows; new records contain provenance/freshness, not a second quantity inventory. No sourcebook or private campaign database is committed.

## 14. Regression results

Verification passed:

- `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`: **542/542 general tests and 256/256 original-PDF checks**.
- The expanded Phase 6.8b unit/original-book suite: **24/24**, including the final fully recorded sleepless-day case and recipient-specific meal review.
- Phase 6.8b browser acceptance: **PASS**, including the expanded Night Daily Needs display and the separate Hunting variant.
- Existing Phase 6.8 conversational journey, Phase 6.8a Backstory/creatures and combat lifecycle browsers: **PASS**.
- Production build, TypeScript and whitespace checks: **PASS**.

Tests use isolated databases and controlled providers/dice, with no paid model calls. General coverage includes authorization, inventory/encumbrance, persistence, journeys, combat and existing creature behavior.

## 15. Original-PDF validation

The actual private fifth-printing Handbook and Guide are indexed in temporary fixtures. The new original-book suite checks the exact Evening history, two-unit Foraging, typed association, Push/Keep/mishaps, staged trap and bow hunting, arrow use, fresh/prepared Food, Chef, sharing, daily depletion, checkpoints, ownership, history, interruption and replay. Table constants are checked against the actual printed rows; missing/conflicting evidence produces a hold.

## 16. Browser acceptance

The Phase 6.8b browser test uses the existing menu and sheets for Camp/Forage, staged trap Hunting, explicit Evening→Night completion, fresh-food sharing, own and shared Food/Water, depletion, Daily Needs, responsive layout and restart persistence. No manual roll attachment is needed for a unique typed request. Historical-card review remains a safe manual fallback to the same resolution service.

Screenshots: [Evening activities](phase6-8b-evening-activities.png), [Hunting](phase6-8b-hunting.png), [Daily Needs on mobile](phase6-8b-daily-needs-mobile.png).

Existing conversational journey, Backstory/creature and combat lifecycle browser suites passed separately. No existing campaign was used as a test fixture.

## 17. Existing campaign compatibility

New session fields and roll context are optional. Existing manual records, dice, Day Tracker history, journey rules, combat history, inventory and portraits retain their formats. Old untyped submissions remain reviewable; their typed success text is not promoted into a verified automatic yield. New menu submissions use the typed workflow. Existing legacy cards are never automatically reassigned across characters, quarters or procedures.

## 18. Known limits and manual procedures

- Fish, Explore and unusual activities retain specific review paths. This phase does not claim complete automation of those procedures.
- Critical injuries, cold attacks, disease/poison at meals, actual gear selection/loss and unusual encounters require their printed supported procedure or a specific Table GM review. Camp mishaps remain private until revealed. A public backup intentionally does not export private GM procedure state; missing private state requires explicit review.
- Unimplemented assistance adapters, Hunter/Hunting Instincts exceptions and unusual equipment bonuses require their specific review. Ordinary staged Hunting is automated; those optional benefits are not advertised as automatic.
- Inn services, cooking equipment variants and special food sources need recorded source-specific support. Chef rank-3 meal provenance is supported for discrete prepared Food; it is not inferred after mixing Food into a resource die.
- Fresh stock receives an ordinary inventory row, but cargo weight must be confirmed in the existing inventory controls. No universal unit weight was guessed. Retrieve creature-carried provisions through the existing inventory transfer before consuming them.
- Unmet needs require an explicit final choice after sharing/acquisition is considered. Condition onset is recorded; continuing known daily Thirst and weekly Hunger use tracked consecutive days. Unknown prior onset, Broken states and death deadlines require review rather than retrospective damage or invented death.
- A fully recorded four-quarter day without Sleep applies Sleepy. Missing earlier history is not treated as evidence of sleeplessness. Continuing Sleepy damage/collapse and unknown prior condition onset retain their specific review procedures. Unknown shelter/cold/condition procedures remain reviewable. Recovery does not erase injuries or resolve mandatory obligations.
- Compound meal plans are not automatically allocated. Select the consuming character, transfer supplies when needed, and roll their current die. This preserves ownership and the printed sharing rule.
- Natural-language guards cover concrete supported forms. Neither free text nor AI narration can replace a saved die, transaction, source check or explicit clock command.
