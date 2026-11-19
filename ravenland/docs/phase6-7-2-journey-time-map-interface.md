# Phase 6.7.2 — Journey, time, map and interface

Base: `7b36535`, branch `ravenland-ai-gm-prototype`. Development uses isolated databases and the uploaded original fifth-printing books. No live Belderand state, historical journal or manually entered supplies are altered.

## 1. Review-button investigation

The old button fetched AI settings, required OpenAI, dispatched a window event, and showed no inline loading, result or failure state. The receiving listener could drop the request while another request was busy or when panel closure was refused. Its request ID was the entry ID (or last response ID). The server correctly caches completed requests: reusing that ID returns the old response and creates no new chat message. A controlled regression reproduces that replay, then verifies that a fresh review request observes the same pending entry without creating a second activity.

A separate browser regression found that travel submission could be enabled while the required destination select was still loading after reload. Native validation then blocked the click without any submit event or API request. Submission now waits for the actual adjacent options and reports loading/invalid destination state.

The existing completion engine was present, but hidden behind “development GM controls.” An AI review or proposal never called completion. Thus a submitted no-roll Rest activity could remain pending while narration implied completion. The user's live database/provider logs are unavailable; the code paths above are reproduced defects, not a claim to conclusively diagnose every original first-click failure.

The primary button is now **Review submitted activities**. It awaits a read of the exact saved entry and displays reviewing, required review, or actionable failure inline. It works without paid AI calls. **Request AI narrative review** is separate, awaited, uses a fresh request ID, and reports failure. Neither button creates another activity or advances time.

## 2. Activity transitions

Existing drafts, immutable submitted records and append-only completion updates remain authoritative. UI states distinguish planning, reviewing, required adjudication, saving resolution and completed. Required outcomes remain separate from the resolution review. Old pending entries retain their original entry/form IDs; no migration blindly marks them complete.

## 3. Atomic completion, journal and clock

The existing `executeJourney` transaction coordinates reviewed recovery, actual ending hex, completion update, a completed Journal entry, next-quarter form, campaign revision and the existing shared clock observer. The original Day Tracker submission remains immutable. Completion receipts include Rest attribute before/after values when recovery is selected. Existing request fingerprints replay exact requests and reject changed payloads. A second completion under a different ID is rejected. Failed validation rolls back all related writes.

Only confirmed completion advances one quarter. Active encounters and urgent mandatory consequences block completion. Linked roll outcomes are revalidated. Old AI quarter proposals become obsolete after completion, with disabled controls and domain-specific feedback. Appointment errors now identify appointments; an appointment wait cannot bypass a submitted quarter's resolution.

## 4. Structured GM context and narration

`journeyWorkflow` supplies the current clock/location, active form and entry, status, participants/activities, missing outcomes, adjudication guidance, saved results, recent completion receipts, verified time events, pending intentions, rumors and calibrated neighboring coordinates. Every new GM request reassembles context. Campaign revisions refresh review/action UI state.

Provider narration is buffered until validation. Common false completion/arrival claims are withheld when the saved activity remains pending, including the reported Morning-to-Day wording. Charter 1.1.2 reinforces engine-owned time/movement, pending-action resumption and map evidence. These text checks are bounded safeguards, not a universal proof of narrative semantics.

## 5. Persistent travel intentions

Optional `journey.workflow` data stores intention identity, origin clock, direction, optional verified destination, requested preceding quarter, reason, stage and associated form/entry. Explicit declarations such as “After Morning, we travel east” can record an intention without movement. Other interpretations use a reviewed typed proposal or the manual intention control.

Only one active intention is recorded at a time. Preparation waits for the current submitted quarter to finish, requires a selected authoritative adjacent hex and fills the existing quarter-day draft. It does not charge time. A prepared intention resumes its existing form rather than creating another journey. Successful arrival completes it; a reviewed stay keeps the intention pending for a later quarter.

## 6. Journey preparation and resolution

The existing chat-quarter journey engine remains in use. The player selects an adjacent destination, assigns Lead the Way, Keep Watch and Hike, and supplies outcomes. Saved matching Survival/Scouting/Endurance cards can be selected; the engine rejects wrong-character, wrong-skill, reused or contradictory roll references. Referenced cards are locked on submission so subsequent pushes cannot invalidate the immutable activity. Manual outcomes remain an explicit existing adjudication path.

Review displays actual destination terrain, recorded waterways/routes and the required terrain/rate, crossing, weather, visibility, encumbrance, encounter and mishap considerations. It does not invent modifiers or resolve a mishap from narration. Existing overloaded-Hike checks remain enforced for all traveling PCs, including the pathfinder and watcher who are also hiking. Normal travel cannot enter High Mountains. Arrival is committed only with reviewed completion; exploration updates through the existing repository normalization. A Rumored marker remains Rumored even when its hex is visited.

The supported procedure is still one reviewed adjacent hex per completed travel quarter. Fractional travel, multi-hex rates, automatic encounter/mishap tables, boats and forced marches are not newly implemented. The controller must review those circumstances and use a supported route/procedure rather than assuming a uniform rate.

## 7. Narrative time

Reviewed scene estimates store the starting campaign clock, evidence message, description, optional approximate minutes and confidence. They never call the time service or advance the calendar. Existing verified minute/hour events are read from the shared time ledger, anchored after the latest calendar transition. Estimates are not added to verified intervals as if they were precise.

Upcoming appointments remain separate records. Attendance without adequate verified time is surfaced for reconciliation; no fixed duration is assigned to an ordinary exchange. Shared waits and calendar completions retain their existing authority and idempotency. New calendar reconciliation must use the current activity/time controls, not a second clock.

## 8. Sidebar indicator

A thin muted-gold indicator sits immediately below Quarter Day. Its label distinguishes verified elapsed minutes, an approximate narrative estimate and **Time uncertain**. Details show evidence, appointments and conflicts. This is informational; it adds no clock controls. A quarter fraction is not guessed from chat counts or an unverified hours-to-quarter conversion. The visual distinguishes evidence confidence; it does not promise an exact percentage where none is established.

## 9. Map directions

Neighbors come from the imported map's actual directed edges; directions come from calibrated hex centers. At T05, the current source map gives T03 (North), U04 (Northeast), U06 (Southeast), T07 (South), S06 (Southwest), S04 (Northwest). T06 is not an adjacent destination. An output guard also replaces nonexistent coordinate claims (including T06 on this map) with an unverified-position notice and corrects recognized contradictory directional claims. Unknown terrain remains concealed in ordinary player context. Privileged resolution review can inspect the actual intended terrain.

## 10. Rumored Locations

Typed GM proposals or explicit reviewed controls can save an unplaced clue with name, description, natural direction and actual testimony source. `hex: null` is supported for the clue; no precise coordinate is invented. A player must separately select a canonical hex and approve marker creation. The existing location service records a native **Rumored** marker and linked Journal entry, with clue/source provenance in its notes. Existing location identity, retry and history protections remain in force. Recording a clue does not reveal terrain or move the party.

## 11. Notebook

One notebook contains Recent Die Rolls, Combat, Supplies & Commitments and Unresolved Actions in that order. Inactive panels remain mounted and are hidden, preserving forms, previews and pending state. Tabs support arrows, Home/End, ARIA selection and per-campaign session storage. Dice counts and combat/urgent indicators remain visible; explicit urgent links open the correct tab. Quarter-Day Activities remains separate immediately below the notebook, with blocking submissions visible. Draft planning can collapse; focus opens it even when a fresh form is still being created. The central column scrolls rather than clipping controls beneath an expanded activity form.

## 12. Existing-campaign recovery

After updating, open the existing pending quarter. Select **Review submitted activities**; confirm the original entry, activities and clock. Review Rest changes and any missing conditions. Confirm uninterrupted eligible Rest only if established, then confirm the resolution. The original ID/history is retained; the application opens the next quarter exactly once. Restore missing source evidence or resolve the named condition rather than manually incrementing the date/quarter. Unknown orphaned or internally inconsistent historical records require explicit review/backup recovery; this change does not silently synthesize history.

## 13. Files and storage

New: journey workflow schema/helpers, review/status services and routes, notebook, travel/timing/rumor controls, sidebar time component, focused/real-book/browser tests and this report. Extended: chat-quarter schemas/engine/UI, journey service, AI schema/context/service/Charter/adapter guidance, stale proposal handling, appointment feedback, repository workflow protection, sidebar, CSS and test scripts.

No SQL migration is required. Optional versioned snapshot fields preserve old campaigns and export/import through the existing schema. Reset clears these scene intentions/estimates/clues by constructing the existing fresh campaign snapshot; libraries and character inventory remain preserved. Historical completed entries are not rewritten.

## 14–16. Validation

- `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`: **517 regression tests and 186 real-PDF tests passed**, with zero skips. The real suite includes source-backed Rest recovery and overloaded pathfinder enforcement, alongside the existing supply, combat, consequence and retrieval tests.
- `npm run test:journey-workflow`: **10 focused regressions** (included in the 517), including the old cached-review behavior, exact pending Rest state, clock claims, persistent intentions, scene estimates, unplaced clues, restart/idempotency and nonexistent-map-coordinate guard.
- `npm run test:journey-workflow:browser`: **passed**. Actual four-PC Morning Rest → engine review → confirmed recovery → Day → persistent intention → map-verified U04 Forest destination → saved Survival/Scouting rolls → reviewed resolution → arrival/exploration/Journal → Evening. Also checks error/retry/loading feedback, tab keyboard/input retention, unplaced rumor versus approved Rumored marker, all three sidebar timing states, exact replay, page refresh, server restart and mobile width. No estimate advances the calendar and arrival does not confirm the rumor.
- `npm run test:context-logistics:browser`: **passed**, preserving real rendered carrying, legacy metadata, allocations, previews and persistent appointments.
- `npm run test:genesis:browser`: **passed**, preserving conversational Session Zero and one-time confirmation.
- `npm run test:library-corrections:browser`: **passed**, preserving library inheritance, source visibility and legacy sheet/weapon handling.
- `npm run test:quarter`: **passed**. Preserves the earlier failed-navigation/manual-adjudication workflow, information requests, immutable history, stationary rest, date rollover, refresh/restart and responsive display. Its fixture now seeds its own campaign, uses the supported local launcher and waits for settings persistence.
- `npm run build`, `npm run typecheck`, `git diff --check`: **passed**. Tests use controlled providers/faces, isolated databases and both original private fifth-printing books. No paid model calls are required. No book files, full extracted text, temporary databases or source-body snapshots are committed.

Source verification: printed Handbook 108 (physical 112) establishes further attribute recovery after becoming unbroken and condition restrictions. Printed 155–156 (physical 159–160) establishes Rest/Sleep and interruption. Printed 143–148 (physical 147–152) establishes map travel, blocked High Mountains, activity procedures, terrain/rate, Lead the Way and Keep Watch. Existing real-book supply/encumbrance, combat, consequence, retrieval and Genesis checks remain included.

## 17. Limits

Complex language can still require clarification. Uninterrupted Rest and environmental eligibility require explicit human review; Broken recovery, conditions, critical-injury healing, and scoped house rules are not silently replaced by a general heal. Unsupported travel rates, crossing procedures, encounters and mishaps require existing adjudication. Scene estimates do not resolve deadline conversions or establish exact quarter percentages. Unplaced clues are prospective; no historical rumor mining or retroactive campaign repair is performed. [Browser screenshot: completed journey and fresh Evening planning](phase6-7-2-journey-complete.png).

The local controller owns privileged review; hosted player permissions are not expanded. Saving code to GitHub does not update a running installation automatically.

## 18. Manual Belderand test

1. Update/restart the application and export a backup. Prefer an isolated copy first. Do not reapply historical supplies.
2. At the existing Morning submission, verify all four original Rest assignments and T05. Click Review submitted activities. Inspect recovery and missing conditions; confirm only established uninterrupted eligible Rest. Review next weather and consequences, then complete.
3. Check Day in the sidebar, Journal and fresh activity form. Retry only if needed; ensure a single completion receipt and no repeated recovery.
4. Preserve or record the future eastern travel intention. Select a destination from the actual calibrated neighbors (for example U04 only when its route is established). Prepare the journey; assign the leader/watcher/hikers and record the required rolls.
5. Review terrain/rate, crossings, daylight/weather, encumbrance, encounters and mishaps. Complete only when resolved. Check actual position, visited/explored map state, Journal and next quarter. A pending encounter must prevent premature completion.
6. Switch notebook tabs with unsaved supply inputs/preview; return and verify they remain. Check urgent indicators and the separate quarter controls.
7. Save a sourced approximate scene interval and verify the calendar stays unchanged. Record any actual wait through the existing time workflow; compare verified elapsed time and uncertainty in the sidebar details.
8. Save the farmers' lead without a hex. Check no marker/discovery appeared. Select and approve a Rumored marker separately; revisit and verify its provenance/status remain distinct from the party position.
