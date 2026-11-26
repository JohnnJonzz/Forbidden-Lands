# Phase 6.8c — Persistent Campsites and Historical Consumption

## 1. Root cause

Phase 6.8b reconstructed shelter by searching resolved Make Camp activity rows at the same hex. There was no occupied campsite record. A completed legacy Day Tracker assignment could be absent from that newer activity projection, while an old native camp could incorrectly qualify after the party left and returned. Hex equality also could not distinguish two named sites in one hex.

The food problem is a separate missing transaction: a Foraging outcome does not itself prove that inventory was awarded or that someone ate it. Narration and a manual Success cannot safely substitute for those records.

Development used isolated synthetic campaigns. No live Ravenland Mysteries/Belderand campaign was inspected or modified; these are controlled reproductions, not claims about unseen live timestamps or inventory.

## 2. Authoritative campsite model

Optional `session.campsites` stores a stable campsite ID, campaign and current-party association, actual hex and site identity, establishing character/date/quarter, original entry/assignment/saved-roll references, shelter, availability, generic reviewed effects, source citations, provenance, revision and append-only audit events. Quantities remain exclusively in existing character gear; campsites introduce no inventory.

Only one camp may be occupied. A named location ID, or the actual hex/location-name pair, identifies its site. A second site at the same hex is distinct. Leaving either the hex or that site invalidates the camp. Returning does not reactivate it. Explicit break-camp/destruction/unusable operations also invalidate it.

## 3. Sourcebook evidence

The original private fifth-printing PDFs supplied by the user are indexed in temporary fixtures. Handbook printed pp155–156 (physical PDF pages159–160) establish Make Camp, shared shelter, Sleep and bare-ground Sleep. Relevant supporting rules remain Handbook pp38 (consumables), 108/111 (recovery/conditions), 145/151–153 (terrain and gathering), and 155–156 (camp/sleep). The original Guide is also included in the required full sourcebook suite. No PDF, full extracted text or private campaign database is committed.

One person makes the camp roll. Successful shelter carries into later quarters while occupied. It does not confer permanent weather immunity, cure Cold, or erase genuine camp mishaps, encounters or interruption. Existing printed follow-ups remain required. Applicable scoped House Rules require explicit review rather than silent printed-default application.

## 4. Native Make Camp persistence

A saved typed Make Camp result creates one stable campsite linked to that assignment and actual roll. Success establishes shelter; the saved failed-camp procedure creates a compromised camp pending the existing GM-private mishap workflow. Private unrevealed numbers are not copied into public campsite state. Existing receipts prevent duplicate projection on replay.

## 5. Night Sleep integration

Sleep consults occupied campsite state, not arbitrary old rows. Eligible unrolled bare-ground requests are replaced by the shared camp reference. Three people sleeping at the same camp do not each roll to establish another sleeping spot. A compromised camp becomes a shared shelter review issue.

Recovery still happens only at explicit quarter completion. Cold, Broken attributes, injuries, encounter interruption, daily-needs gates and other existing obligations continue to apply. Reconciliation itself changes no attributes or clock.

## 6. Historical reconciliation

`GET /api/continuity` presents completed Make Camp/Forage evidence for authorized review. `POST /api/continuity` validates the real authenticated Table GM and actor, selected source, optimistic revision and exact intent inside an immediate SQLite transaction.

A referenced saved positive Survival result must match its character and activity/quarter scope and cannot be an unrelated combat, creature, utility, journey or narrative request. Conflicts, unresolved original procedures, a different site, recorded departure and an explicitly abandoned campsite hold reconciliation. A manual Success remains a manual/incomplete result and needs an explicit historical ruling with a reason; no missing die is fabricated.

The operation appends campsite/provenance, a continuity audit event and Journal entry, and refreshes current unrolled Sleep. Original completed Day Tracker/form/completion records, saved dice, time, needs and recovery are preserved.

## 7. Conversational operations

Authenticated Table GM declarations such as “Use the camp Edrus made during Evening for Night Sleep” invoke the same validated operation when a unique verified event supports it. Questions, speculative wording, claimed GM titles and ordinary players do not authorize it. Ambiguous/manual/conflicting evidence routes to the review control.

“Grogahx and Elyanna already ate the vegetables we foraged” can allocate actual eligible recorded portions through that controller when the source and consumers are unambiguous. Missing awards/deductions require the explicit reviewed choice; the AI does not narrate a successful correction without committing it. Model-only campsite/controller claims are held when no authoritative camp exists.

## 8. Location sidebar

The existing location block gains a compact collapsible **⛺ At Camp**, with maker, establishing date/quarter, site and shelter details. Compromised camps show **Camp compromised**. Inactive camps have no indicator. The detail reminds users that Cold and genuine recorded conditions still apply.

## 9. Compact review UI

“Review previous quarter’s Make Camp result” is available in the Quarter-Day form and submitted native/legacy activity panels. It shows source classification, saved-roll reference and uncertainties, with explicit ruling approval for incomplete history. Break-camp and destruction controls are inside the same disclosure.

Daily Needs retains its four-person Food/Water table. Expand one pending status, then **Resolve consumption**. Available stock and the existing sheet resource-roll workflow remain accessible. Table GM historical confirmation is another nested disclosure; there is no new consumption-management table. Ordinary sharing and unmet-needs procedures continue through existing chat/activity commands.

## 10. Transactions, audit and food addendum

Continuity operations reuse `journey_actions`, stable retry IDs and optimistic revisions. Authority is checked before replay. One transaction applies stock changes, all selected needs, ruling/audit entries and the receipt, or rolls everything back. Replaying an identical request cannot apply it twice; changing its choices is rejected. Already-satisfied needs are preserved.

For two eligible Vegetables, the Table GM can allocate exactly one portion to Grogahx and one to Elyanna, with no Food resource roll. Food and Water are independent. Six unrelated completed needs remain byte-for-byte unchanged.

Supported historical methods:

- **Deduct still-recorded portions:** validate actual ownership, source association, kind, quantity, freshness at the declared meal date/quarter and any safety procedure; deduct once.
- **Reconcile verified missing Foraging yield and meals:** inspect the original positive saved result and supported yield; reject existing, transferred, unattributed or previously allocated stock; explicitly approve the visible **+2 Vegetables / −2 meals** adjustment. Both happen in the same transaction, recorded now against the original source. No earlier acquisition receipt is invented.
- **Confirm prior deductions:** preserve zero remaining stock; check known original yield against previous allocations and remaining stock; require explicit GM testimony where an earlier consumption receipt is absent. Deduct nothing again.
- **Table GM consumption ruling:** establish a clearly labeled historical meal fact when evidence is incomplete. Do not generate a roll, Foraging result, acquisition, resource roll or backdated receipt. Selected known stock, yield, source timing and conflicts cannot be bypassed by that label. Inventory adjustment is a separate reviewed choice.

Physical transfers retain original source metadata, and new ordinary consumption/transfer operations append continuity audit entries. Pending saved consumption rolls require their exact procedure review rather than silently overwriting their references. Meals cannot predate their source, consume expired raw food at the claimed time, satisfy Water from Vegetables, or use unrelated inventory as the selected Foraging source.

## 11. Files and migrations

Core additions: `src/lib/{campsites,continuity}.ts`, `src/server/continuity/{camps,review,service,conversation}.ts`, `src/app/api/continuity/route.ts`, and `src/components/continuity-review.tsx`.

Integration changes cover session/activity schemas, SQLite validation and departure handling, activity resolution/completion/context, AI context/conversation/narration guards, the existing Quarter-Day/Daily Needs panels, sidebar, mutation authority and styles. Tests are `tests/camp-continuity-real.ts` and `tests/camp-continuity-browser.cjs`, integrated with the existing original-PDF activity/full suites. Package commands expose focused continuity checks.

No new SQL migration is required: optional additive JSON fields use existing campaign storage, private mishap table and receipt/ruling infrastructure. Existing databases retain migration025. Old campaigns load without automatic speculative backfill. Historical reconciliation is explicit and scoped.

## 12. General regressions

| Check | Result |
| --- | --- |
| Final `npm test` | **542 / 542 passed** |
| Required `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check` | **542 general + 272 original-PDF checks passed** |
| Final `npm run test:camp-continuity` using both actual PDFs | **39 / 39 passed**, including later snapshot-copy and inflated-stock cases |
| `npm run test:camp-continuity:browser` | **Passed** |
| Existing `npm run test:quarter-activities:browser` | **Passed** |
| `npm run build` | **Passed** |
| `npm run typecheck` | **Passed** |
| `git diff --check` | **Passed** |

These suites overlap; their counts are not added into a fictitious total. General coverage includes campaign import/test copies, inventory, authorization, persistence, journey/combat/world-action flows, and creature/backstory privacy. The existing activity browser regression additionally covers staged Hunting, normal sharing and resource depletion.

## 13. Original-PDF checks

The final 39 focused checks use the actual two PDFs, real indexed evidence and existing Dice/Activity/Journey services. They cover the exact Evening assignments, three Night sleepers, both meals, six untouched needs, no resource-roll replacement, original history, idempotency, reopening persistence, missing awards, manual rulings, false authority, insufficient/expired stock, source scope, shared transfers, invalidation and Cold.

## 14. Browser acceptance

The dedicated Playwright test uses an isolated database, both original PDFs, actual character-sheet camp/forage rolls, the real Quarter-Day menu and continuity controls. It tests native Evening→Night shelter; deliberately missing legacy projections; shared **+2/−2** food repair; unchanged dice/history/clock/unrelated needs; desktop/mobile; server restart; and real journey departure/return. No paid model calls are used. Both the dedicated continuity acceptance and the existing quarter-activity browser regression passed; tracked JavaScript exception lists stayed empty. Browser journeys explicitly declare daylight after Night advances to Morning, preserving the existing daylight gate.

Screenshots: [Evening](phase6-8c-evening-activities.png), [historical review](phase6-8c-historical-review.png), [Night mobile](phase6-8c-night-mobile.png).

## 15. Existing campaign compatibility

No automatic time advance, reroll, historical edit, inventory grant, need reset or recovery is performed on load. Current ordinary food, sharing, failed camp, Cold, journey, combat and creature paths remain the existing controllers. Fresh campaigns start without a campsite. Explicit campaign imports and AI test copies preserve their snapshot shelter while assigning new independent campaign/campsite identities and appending a copy audit event. Changing the copy cannot alter the original. Updating an existing campaign with a foreign campsite association is rejected.

## 16. Exact Belderand recovery instructions

After updating the application, open **Ravenland Mysteries**, at **U06 — Forest**, **12th Stillfall, 1165, Night**, as the assigned Table GM.

1. Open the current **Quarter-Day Activities** panel. Expand **Review previous quarter’s Make Camp result**. Select **Evening — Edrus — U06**. Inspect the classification, saved Survival reference and any warnings. Enter a review reason and choose **Use reviewed campsite for current Sleep**. If only manual Success exists, explicitly approve the historical campsite ruling; missing dice remain missing. If evidence conflicts, resolve that discrepancy instead of forcing it.
2. Confirm **⛺ At Camp** appears and the unrolled Grogahx/Edrus/Rose Sleep rows use the established camp. Elyanna remains Keep Watch. Do not reopen Evening or roll another Make Camp.
3. Expand **Daily Needs**, Grogahx’s **Food: Pending**, **Resolve consumption**, then **Confirm food or water already consumed**. Select Grogahx’s original Evening Foraging event and inspect the actual two-success/yield evidence and stock.
4. Select both **Grogahx** and **Elyanna**, one Food portion each, current in-world date, meal quarter **Evening**, and confirm that it occurred earlier. Enter the actual historical explanation.
5. If two portions still exist, select their actual stock and **Deduct still-recorded portions**. If the verified yield was never awarded, choose **Reconcile verified missing Foraging yield and meals**, review **+2 / −2**, and check its approval. If inventory was already deducted, use **Confirm prior deductions**, with explicit testimony and sufficient unallocated original yield. If the evidence is only a manual declaration, use the clearly labeled **Table GM consumption ruling** and explain uncertainty; do not invent an acquisition or roll.
6. Choose **Confirm reviewed consumption**. Verify Grogahx/Elyanna Food is Satisfied, all four Water results remain Satisfied, and Edrus/Rose Food stays unchanged. Inspect the expanded provenance/Journal audit. No Food die roll is needed for those portions.
7. Complete Night only after every genuine outstanding obligation is resolved. The repairs themselves do not advance time or grant recovery.

If Evening has several ambiguous sources, a departure, a different site, an unresolved saved roll or an incompatible inventory record, the review explains the hold. Do not delete history to clear it.

## 17. Known limitations

Historical evidence cannot prove facts that were never saved. Independent copies preserve the public campsite snapshot; unresolved GM-private procedures remain subject to their existing server/private-record recovery controls. Explicit Table GM rulings remain testimony with uncertainty, not recovered dice or old receipts. Ambiguous stock/transfer history blocks automatic re-award. The UI targets meals earlier in the current in-world day; the backend additionally validates known historical dates without retroactively curing current-day conditions. Existing already-saved bare-ground/consumption procedures are preserved for specific review rather than erased.

The implementation models one current party/occupied campsite, not split-party camps or an inventory of reusable abandoned shelters. Arbitrary narrated weather/destruction does not mutate camp state; use the explicit invalidation operation or actual departure. No live campaign correction has been applied during development.
