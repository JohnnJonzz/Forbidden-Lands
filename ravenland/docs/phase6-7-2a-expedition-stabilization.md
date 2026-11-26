# Phase 6.7.2a — Expedition stabilization

Base: `5dd5a72`, branch `ravenland-ai-gm-prototype`. All development and tests use isolated databases. No live Belderand quarter, position, history, supplies or reset state is changed.

## 1. Journey/appointment interference

The old proposal union accepted `propose_event` with an arbitrary string `eventId`; that action belongs to appointments. The client and saved-action dispatcher selected logistics by this discriminator, without establishing that the ID belonged to a saved appointment. Logistics looked in `campaign_arrangements`, so a valid submitted journey ID produced “Appointment changed…” even though the activity itself had not changed.

A regression reproduces that exact error by passing the saved Belderand-like Day submission ID through the former event-command mapping. It then injects the same typed action into an isolated saved AI reply and verifies that confirmation stops at the new journey/appointment domain boundary. The user's actual live saved payload is unavailable, so this establishes a reproduced failure path, not a claim that every production occurrence used that precise ID.

`proposalDisposition` now checks actual identities. A quarter-day request becomes superseded when its corresponding activity is already submitted. An appointment proposal targeting a journey, or a travel proposal without an actual appointment target, cannot reach logistics. Saved obsolete proposals display why and offer **Open current activity**. Genuine appointment revisions remain appointment concerns; they are not silently converted into movement. Quarter-day reviews cannot dispatch appointment actions. A second regression supplies a real but stale appointment ID with travel intent and confirms that it is rejected before logistics; explicit meeting operations in ordinary chat remain available.

## 2. Submission-to-resolution handoff

The submitted form and immutable Day Tracker entry remain the authoritative pending record. Saved Lead the Way and Keep Watch cards/outcomes remain visible. **Review submitted activities** reads that exact record. **Request AI narrative review** remains an awaited request with visible feedback. The submitted journey now contains the route, per-hex entry and encounter-review controls beside the existing completion controls.

No proposal or review automatically arrives, advances the clock, or creates another quarter. Structured continuation guidance resumes the current entry and identifies its next navigation, route-extension or interruption step.

## 3. Official travel distances

The runtime verifies the indexed original Handbook before approving a per-hex expedition. The classification follows printed p. 145: Plains, Forest and Hills are Open; Dark Forest, Mountains, Quagmire and Ruins are Difficult. High Mountains block ordinary travel. Lake/River and Marshlands require water travel/access procedures and cannot be entered by merely asserting an ordinary land route.

Uniform Open routes allow up to **2 entered hexes on foot or 3 mounted** per quarter. Uniform Difficult routes allow **1**. Mounted approval requires a recorded named mount for every participant; no horse or capacity is inferred. Each route step must be an actual map edge. The normal maximum is an allowance, not guaranteed progress.

Mixed Open/Difficult entered terrain requires an explicit scoped human allowance review. Leaving a Difficult starting hex for an otherwise Open route also requires that review. No fractional-cost formula is invented. The decision is stored in the existing GM ruling system with its exact route, source/rule fingerprint and reasoning. Relevant house rules block silent default approval. Changing sources or invalidating a scoped ruling prevents further entry until review.

Recorded waterways along the route require explicit crossing/access evidence. A claim of a boat, raft or mount does not implement its unsupported procedure. Conditions, stops, weather, lighting and modifiers are reviewed explicitly. Night's printed pathfinder penalty cannot be omitted without recorded night-vision evidence. Third/fourth hiking quarters are held for the forced-march procedure rather than being treated as ordinary travel.

## 4. Per-hex navigation and saved dice

A route is attached to the existing submission through append-only quarter-day updates. Each new hex has a distinct check identity containing the activity, route revision, step, target hex, pathfinder, skill and reviewed modifier. Existing first-hex dice references are preserved; explicit route adoption binds the eligible original first card instead of rerolling it or inventing a success.

New navigation cards receive their context on the server. Their pool must match established current Wits, Survival and the reviewed modifier. Unknown skill values require review. Unsupported gear/artifact navigation bonuses are not invented. A check cannot be rolled again simply to fish for success; legal pushing uses the existing dice engine. Entered cards lock, and the same card cannot authorize the next hex. Step and route IDs reject stale requests.

The visited-hex exception uses actual recorded positions, entered receipts, completed journeys and explicitly Visited location records. Fog reveal and Rumored markers do not establish a visit. A genuine return can enter without another navigation roll.

The quarter retains its assigned pathfinder/watch roles. Changing pathfinder mid-quarter, exceptional pools, complex mount/load rules and unsupported movement modes still require a supported adjudication path; the application does not fabricate those capabilities.

## 5. Encounters, interruptions and mishaps

One reviewed encounter disposition ordinarily covers the hiking quarter; the application does not automatically roll once per hex. Keep Watch is evidence for detecting a threat, not proof that no encounter occurred. A real combat encounter at an entered position blocks further movement and completion. Actual encounters started during the route must be reviewed as resolved before continuation; a “no encounter” selection cannot erase one.

Interruption is stored at the last verified position. No intended-final-hex teleport occurs. Actual encounter state is also included in structured journey context and survives restart. A stop can reduce the remaining movement allowance. A reviewed extension can use remaining allowance in this same quarter, preserving the entered prefix and requiring another check.

Failed navigation requires the pathfinder's actual saved D66 result. **Fog** applies the printed one-hex reduction and one Empathy damage per traveler atomically; retry cannot repeat damage. No-progress mishaps hold further movement. Complex injuries, cold, escape rolls, swarms and other unsupported effects create a mandatory obligation linked to the actual mishap Journal entry, using the existing consequence system. They do not invent successful escape, healing, damage or encounter resolution. After the required procedure is actually resolved, interruption review can permit only the remaining legal movement.

An overloaded Hike uses the existing source-backed Endurance procedure for all traveling PCs, including the pathfinder and watcher. Its scope stays anchored to this quarter's origin, so entering the first hex does not spuriously require a second check for the same quarter. Equipment changes still invalidate a load-specific permit.

## 6. Verified map synchronization

Each entered hex has an append-only receipt recording source/destination, step, navigation card or visited exception, modifier and adjudication. The existing journey transaction saves that receipt, actual campaign position, exploration changes and an entry Journal record together. It leaves date/quarter unchanged.

Final completion accepts only the actual entered position and coordinates the existing completion receipt, Journal, clock observer and fresh quarter form in one transaction. The original submitted entry is preserved byte-for-byte. Both intermediate and final hexes stay explored; a failed operation rolls back. Exact retries replay rather than repeat movement or time.

The existing map reacts to campaign position/exploration revisions. Browser tests keep a second map window open and verify its party marker changes from T05 to U06 and V05 without a reload. Rumored markers retain their original status/provenance even when their hex becomes visited.

## 7. Other activity

**Other** is a stationary social/town category with an optional per-character description. It needs no automatic roll, grants no Rest recovery or Sleep benefit, replenishes nothing and initiates no travel. Independent shopping, negotiations, checks and transactions remain separate supported operations. It uses the normal one-quarter completion operation. Travel assignment validation prevents combining Other with a hiking role. Historical Rest entries are not rewritten.

## 8. Collapsible notebook

Clicking a closed tab opens it; clicking the selected tab closes it. All four tabs may be closed. Components remain mounted, preserving inputs/previews and combat/dice state. Selected/expanded ARIA state, keyboard arrows/Home/End and per-campaign storage remain available. Counts and urgent badges remain visible while content is closed.

## 9. Collapsible Quarter-Day Activities

The entire separate quarter panel has a toggle header with quarter, status and review/blocked indicator. Its contents remain mounted when closed. It does not repeatedly expand on ordinary record refreshes. During actual combat or a mandatory consequence, the header remains visible and the saved form is retained, with mechanical controls disabled until the blocking procedure is resolved. Completed history starts collapsed.

## 10. AI workflow integration

Context includes the reviewed route, allowance, entry receipts, next hex/check, actual encounters, interruption state and next permitted action. Continuation requests resume this record, including the option to extend a one-hex reviewed route when allowance remains. Charter 1.1.3 and adapter guidance distinguish appointment operations from journey operations, new entry from final completion, and Watch detection from encounter absence.

Narration remains bounded by recorded position/time, with unentered-coordinate arrival claims withheld. These language checks supplement deterministic state, not replace it; they are not a universal semantic proof.

## 11. Sourcebook verification

Original fifth-printing books are privately indexed by the application in the tests. Printed Handbook **145** (physical 149) provides terrain classes/activity combinations; **146** (150) hiking rates, mounts and forced march; **147** (151) per-hex Survival, Pathfinder/darkness, return exception and daylight; **148–149** (152–153) navigation mishaps and Watch; **150** (154) encounter frequency and detection. The frequency paragraph continues beyond the requested pp. 145–149 and was checked there rather than attributed to the wrong page. Existing carrying/overload checks use printed pp. 37–38 as before.

No licensed PDF, extracted book body, private database or source-body snapshot is committed. Test output uses counts, metadata and page references.

## 12. Files and migration

New files: expedition schemas/derived progress, quarter-day expedition command helper, source-backed travel review/mishap/encounter/proposal helpers, expedition UI, focused/real-PDF/browser tests, this report and screenshot.

Extended: quarter/chat schemas and engine, saved dice schema/service, journey service/review/status, repository pending-position guard, AI action validation/context/adapter/Charter, notebook, whole-quarter UI, Hike scope, CSS, scripts and relevant browser fixtures.

No SQL migration is required. New optional context and append-only update fields fit the existing validated snapshot/backup architecture. Old campaigns remain readable. Reset continues to clear scene workflow while preserving the existing character/library policy.

## 13–14. Validation

Validation passed: 525 regression tests and 196 checks using the actual private fifth-printing PDFs, including ten expedition sourcebook scenarios. The eight focused expedition regression tests also passed. All six selected browser workflows passed: expedition, previous journey workflow, supplies/commitments, campaign genesis, library/weapons, and legacy quarter-day handling. Production build, TypeScript checking and whitespace checks passed. All checks use isolated databases, controlled faces/providers and no paid model calls.

The required browser scenario uses four characters at actual Open Terrain T05, selects U06 and V05 from real map edges, assigns Lead the Way/Keep Watch/Hike, uses two separately saved navigation cards, records the quarter encounter review, enters both hexes, completes once, and verifies the next Evening quarter. It checks an open map window, Journal, sidebar, exploration, original entry identity, Rumored status, refresh/restart and completion replay.

A separate scenario creates a real encounter after entry into U06. Continuation is rejected, the actual position stays U06, V05 remains unvisited, Day stays pending, and restart retains the interruption. The browser also covers all-tabs-closed/input retention, keyboard use, whole-quarter collapse, urgent badges, responsive width and an Other quarter with a wounded character receiving no recovery.

## 15. Existing-campaign compatibility

The live pending Belderand Day record is not completed or extended during development. Its original activity and dice references are retained. Old completed one-hex quarters cannot be adopted or expanded retroactively. A pending old submission keeps its intended first hex; any new per-hex route or extension requires an explicit review/confirmation. No supplies, encounters or prior movement are mined from old prose as completed mechanics.

## 16. Manual Belderand procedure

1. Update/restart the application and export a backup. Prefer an isolated copy first. Do not reapply historical supplies or reset Belderand.
2. Open the existing **Day · Awaiting GM Resolution** header. Confirm T05, intended U06 and the original Grogahx/Rose saved successes; Edrus/Elyanna remain hikers without an automatic roll.
3. Use **Review submitted activities**. Ignore any superseded old proposal; **Open current activity** returns to this same record.
4. Review the per-hex route. Keep just U06 if that is the agreed journey, or explicitly append another actual adjacent eligible hex. T05 → U06 → V05 is an example of two source-map Forest entries, not an instruction to move the live party there. Verify actual destination/conditions before selecting it.
5. Confirm terrain/mode, established mounts if applicable, waterways, weather/light, modifier evidence, stops and any scoped mixed/house ruling. No unrecorded capability is assumed.
6. Review and confirm the first entry using its existing eligible saved Survival card. Check position and exploration update without advancing Day.
7. Review the actual quarter encounter procedure. If a threat occurs, resolve it at the entered hex through Combat/Unresolved Actions. Do not declare arrival elsewhere. Watch success determines detection, not encounter absence.
8. If continuing to another new hex in this same quarter, roll the current pathfinder's Survival with the reviewed modifier on the character sheet and select the card bound to that step. Resolve any actual D66 mishap before entry. Do not submit another Day activity merely for the second hex.
9. Finish at the actual entered position after all required consequences. Confirm the existing quarter completion, then compare map, sidebar, Journal and the fresh next-quarter header. Retry must not repeat movement, damage or time.
10. Toggle each notebook tab closed; close/reopen the quarter panel with an unsaved review. Check values and urgent indicators remain. For future town business choose Other and describe it; check no recovery, supplies or movement is inferred.

## 17. Known limits

Ordinary route execution supports at most the official three entered hexes, verified land terrain and one quarter. Mixed costs remain a scoped GM decision, not a fabricated fractional formula. Water travel, unsupported crossings, unusual gear/artifact pools, changes of pathfinder, exceptional mount/load capabilities, and forced-march procedures require their supported adapters/adjudication. Known unsupported terrain and third/fourth ordinary hiking attempts are blocked rather than silently granted. Complex mishap consequences remain held until their actual procedures are reviewed; only supported effects such as Fog are applied automatically. Numeric modifiers/scene eligibility are explicitly reviewed, not inferred from vague prose. Narrative safeguards are bounded. Hosted player privileges are not expanded into GM authority. Saving this code to GitHub does not update a running installation by itself.

[Browser evidence: expedition and compact interface](phase6-7-2a-expedition.png)
