# Phase 6.8d — Morning, Ravenland Weather v2.0, and Quarter Transitions

## 1. Root cause

Quarter completion appended its mechanical summary and created the next draft, but never emitted a scene-transition workflow. The next AI reply therefore depended on another player action. Weather was only a saved manual/Roll20 description; the old “AI Game Master” preference did not implement generation. Named dates intentionally retained elapsed-day offsets because festival boundaries were unverified.

No live campaign was inspected or changed. The reported Belderand case was reproduced in isolated temporary databases.

## 2. Intended weather system and cadence

The user supplied **API_Weather Revised (1).txt**, titled **FORBIDDEN LANDS — RAVENLAND HEX-FLOWER WEATHER v2.0**, and explicitly selected it for this campaign. Its source SHA-256 is `8f19663ef8c8edb264dbdba8e9e735205403c70c8d45d5cfeeb5b8e8f55e3d16`.

The port preserves the three 19-cell flowers, eight seasonal phases, exact phase-specific 2D6 direction groups, doubled-row coordinates, side wrapping along the same ray, blocked north/south pole exits, persistent position/day count, warning-hex selections and daily override resets. The data was extracted as static literal data; the Roll20 script, hooks, chat commands and global `state` are never executed.

The user's confirmed cadence is **one step per new in-world Morning**. Queries and later quarters reuse the saved day's result. Activation requires the actual phase and explicit daily-transition authorization. Existing manual weather is retained unless the GM approves immediate replacement, or the authorized next Morning arrives. There is no generic substitute generator.

Seasonal temperature remains the script's **house rule**. Book mode preserves its 1D6 table transcription, separately identified as Book of Beasts p153 and requiring explicit GM approval. Wind values retain the supplied script's best-effort glyph-transcription warning.

## 3. Authoritative transition events

Migration `026_quarter_transitions.sql` adds a campaign-scoped transition ledger. An event ID derives from the campaign and actual completion receipt; its entry is unique. It references the completed entry, previous/current clock and location, actual assignments and roll IDs, interrupted Sleep/Rest, attribute recovery, conditions, resources, dated needs, actual encounter status, campsite, weather and outstanding review requirements.

The event, saved weather, fallback scene, original mechanical completion and existing clock receipt share the completion transaction. Narration cannot advance time. Activity completion passes its pre-recovery snapshot so recovery is reported from real before/after values rather than inferred from descriptive text.

## 4. Weather persistence and mechanics

Optional `session.environment` stores the reviewed hex-flower state, current weather reference, immutable prior weather results, calendar configuration and GM audit entries. Each result stores its in-world period, location, navigation dice/sum/direction/edge action, position, seasonal phase, warning result, temperature roll/override, wind/precipitation/temperature, source hash and applicable approved modifiers.

Saved daily results and `lastAdvancedDate` prevent repeated steps after replay, refresh, retry or restart. A manual same-day adjustment creates a new audited result without advancing the flower's day. A persistent manual result pauses automatic weather; resuming preserves the position and day. Phase changes reset the position to center as in v2.0. Warning redraws are explicit GM operations available only on the warning hex.

Approved v2.0 **Lead the Way** and **Make Camp** modifiers reach the actual navigation and character-sheet activity pools as **campaign weather house rules**. They are not inferred from narrative adjectives or mislabeled as core-book modifiers. Manual weather descriptions alone grant no numeric adjustment. Weather changes also invalidate an existing route-rule fingerprint for review.

Exposure warnings from the supplied Book of Beasts transcription are displayed for specific procedure review. They do not automatically cause Cold, Thirsty, damage, shelter destruction or an invented Endurance outcome. Genuine existing conditions and source-backed obligations still apply.

## 5. Calendar findings and fixes

The original Guide, printed p35 (physical p39), describes eight phases of **45 or 46 days**, with festival timing decided in-world rather than a fixed Gregorian month table. Consequently:

- Ordinary named dates now advance directly: `12th of Stillfall, 1165` → `13th of Stillfall, 1165`.
- A legacy `12th … (+1 day)` displays as `13th …`, and the next rollover becomes `14th …`, without adding the offset twice.
- Food freshness and daily checkpoints recognize the named-date arithmetic.
- Confirmed campaign phase names, order and lengths drive phase/year boundaries. Unconfirmed boundaries retain an explicit offset for review.
- ISO dates retain their explicitly civil arithmetic; JavaScript's calendar is not used to invent fantasy phase lengths.

Sidebar and Quarter-Day headings share the formatter. Original Day Tracker/completion records retain their original stored dates. Explicit equivalent-label corrections can preserve current-day needs; conflicting or genuinely reassigned dated needs require a scoped review rather than being reset.

## 6. Overnight history and encounters

The scene uses the actual completed Night: three recorded sleepers, Elyanna's Watch, interruptions, eligible recovery, remaining conditions, actual position and occupied campsite. It does not infer successful recovery from a declaration alone.

A recorded no-encounter procedure, an actual ended encounter, an administrative abort and no recorded procedure remain distinct. Without a check, the scene explicitly avoids claiming a mechanically peaceful/safe night. A historical administratively aborted Nightwarg is neither reactivated nor described as defeated.

## 7. Automatic narrative delivery

Every primary Quarter-Day completion appends one stable scene message to the existing campaign conversation, immediately after the mechanical transition. Morning receives the overnight summary, new date/quarter, saved weather, actual camp/location, concise grounded atmosphere and a player decision. Other boundaries use the same event architecture with shorter time introductions.

The engine owns all factual text. When OpenAI is configured, a bounded structured request selects among grounded atmospheric alternatives; arbitrary model prose cannot replace weather, invent a victory, move the party or grant recovery. The message accurately distinguishes application fallback from AI-assisted narration. No next activity or destination is committed; the new Morning form remains a draft.

## 8. Model failure and retry

The factual fallback is already saved before any model request. Model selection has a bounded timeout and a persistent narration lease/attempt identity. Concurrent requests claim one lease. An old response cannot overwrite a newer GM weather correction or a changed clock/site. Successful usage is recorded in the existing usage ledger.

An unavailable model leaves mechanics, weather and the fallback intact. Conversational completion links its actual AI request to that same scene instead of appending a second Night summary or Morning scene. Authorized narration retry replaces the same scene slot; it never completes the quarter or rolls weather again. A server restart preserves the slot and weather. Ordinary GET requests do not generate narration or randomness.

## 9. Sidebar

The decorative “A world beyond the road” headline is removed. A compact campaign name replaces it; spacing is reduced while keeping date, quarter, location, terrain, camp, weather and party readable. Established weather uses the real saved summary. Pending weather displays a review state instead of invented conditions.

## 10. At Camp

Phase 6.8c campsite state remains authoritative. Night→Morning at the same site retains the same campsite and establishment history. Weather narration does not silently invalidate shelter or confer permanent cold/weather immunity. Actual departure, destruction and existing reviewed shelter procedures retain their controls.

## 11. Files and migration

Core additions are `src/lib/{calendar,environment,weather-hex-data,weather-hex,weather-context}.ts`, `src/server/transitions/{weather,service,commands}.ts`, `src/app/api/environment/route.ts`, and `src/components/environment-review.tsx`.

Integrations cover the existing clock, completion services, model provider, conversation delivery/context/guards, navigation/activity modifiers, session validation and authority, privacy projection, Quarter-Day controls and sidebar. New tests are `weather-transition.test.ts`, `morning-transition-real.ts` and `morning-transition-browser.cjs`.

Migration026 is additive; existing snapshots, dice, completed activity history and private sourcebook storage are preserved. No original PDF, extracted book body or private fixture database is committed.

## 12. Source verification and distinctions

The actual private fifth-printing Handbook and Guide are indexed in isolated test fixtures. Guide p35 establishes the variable phase lengths. Handbook pp155–156 supports the separate camp/Sleep procedures; existing recovery, Cold and journey checks continue through their source-backed adapters.

The hex-flower navigation, weather cells, temperature estimation and approved Lead/Camp adjustments come from the **user's campaign protocol**, not a claim that these exact tables appear in the two core books.

**The original Book of Beasts and the photographed flowers were not supplied.** Its p153 temperature/exposure transcription cannot be independently verified against that original. Book mode is therefore explicitly labeled and reviewed; exposure consequences remain review requirements. The supplied wind-glyph uncertainty is preserved rather than silently “corrected.”

## 13. Regression results

| Check | Result |
| --- | --- |
| Final general regression suite, `npm test` | **557 / 557 passed** |
| Required `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check` | **557 general + 286 original-PDF checks passed** |
| Final `npm run test:morning-transition` with both actual core PDFs | **68 / 68 passed** |
| `npm run test:morning-transition:browser` | **Passed** |
| Existing `npm run test:camp-continuity:browser` | **Passed** |
| Production build and TypeScript checks | **Passed** |
| `git diff --check` | **Passed** |

The suites overlap; these numbers are not combined into an artificial total. Focused coverage includes the complete phase/direction matrix, all 5,472 phase/tile/2D6 moves, edge behavior, cached warning/temperature results, approved wind adjustments without temperature rerolls, real navigation/camp pools, calendar aliases and boundaries, native/replayed/conversational completion, unavailable/stale model responses, weather restart persistence, reset isolation, authority, and the historical Nightwarg abort. No paid model requests were made.

## 14. Browser acceptance

The dedicated Playwright fixture indexes both actual books, makes Evening Camp/Forage rolls through real character sheets, assigns three Night sleepers and Elyanna Watch, satisfies dated needs through actual resource procedures, and activates v2.0 through the real review UI while retaining the current manual weather.

It then checks automatic Morning weather/scene delivery, the direct new date, U06/At Camp, unchanged original dice/history/needs, no assigned Morning entry, reload and server restart without duplicate weather, time or narration. Its model has no API key, exercising the genuine unavailable-model fallback without paid calls. Desktop/mobile screenshots verify the compact sidebar.

Screenshots: [Evening source-backed activities](phase6-8d-evening-activities.png), [Morning desktop](phase6-8d-morning-desktop.png), [mobile sidebar](phase6-8d-sidebar-mobile.png).

## 15. Exact Belderand fixture

The isolated source-backed scenario starts at U06 Forest on 12th Stillfall, 1165. Edrus establishes the Evening camp with a saved Survival result. At Night, Grogahx/Edrus/Rose Sleep, Elyanna keeps Watch, and all Food/Water needs are already satisfied.

Completing Night yields **13th Stillfall, 1165 — Morning**, one new weather step and one scene. U06, camp identity, completed assignments, original dice and prior daily needs remain unchanged. Verified eligible recovery applies once; Watch grants no Sleep recovery. A separate fixture includes an actually administratively aborted historical Nightwarg and verifies that its saved encounter remains ended.

## 16. Existing campaigns

Legacy manual weather remains authoritative until reviewed activation/adjustment. Existing offset dates are understood without rewriting their histories. Fresh campaigns have no assumed phase/protocol. A new-adventure reset clears the old transition ledger and narration leases along with weather and workflow state. Imported/test-copy session weather state is independent; copied existing scene messages are retained rather than replayed as new events. A missing scene for an already completed current quarter can be reviewed explicitly using its original receipt, without rerunning completion.

The existing weather-mode/manual controls remain connected to the new service: a persistent manual setting pauses the flower; the previously reviewed protocol can be resumed without inventing a new starting position.

## 17. Known limitations

Original BoB/table-photo verification remains unavailable as described above. Exposure warnings require the specific reviewed procedure; this phase does not invent an automated BoB Endurance/condition adapter from unverified evidence. The core-book camp, recovery and condition safeguards remain active.

The supplied eight-phase flower changes are explicit GM controls. Unknown festival timing and custom labels such as Stillfall are not guessed from the computer date. Configure the actual phase calendar and select the intended weather phase at festival changes. The port cannot recover an old Roll20 position that was never imported; set its known coordinate explicitly rather than fabricating prior days.

Narration is deliberately bounded and grounded, not an unrestricted model-written account. The event ledger does not retroactively manufacture encounter checks or recovery evidence missing from a legacy completion.

## 18. Settings and live-campaign steps

1. Update the application to this commit and restart once to apply migration026. This development task has not changed your live campaign.
2. As the assigned Table GM, open **Quarter-Day Activities → Weather & quarter transition**. Enter a review reason, open **Ravenland hex-flower v2.0**, and choose the actual seasonal phase. Do not infer it from the word Stillfall alone.
3. Choose **Seasonal house rule** or explicitly approve the supplied **Book of Beasts p153 transcription**. The latter remains unverified against the original BoB.
4. Approve v2.0 Lead/Camp adjustments if those are the campaign house rules you want applied. The wind glyphs remain the supplied best-effort transcription.
5. Authorize one step at each new Morning. Leave **Approve replacing current weather now** unchecked to preserve current manual weather until the authorized next daily transition. Check it only when deliberately adopting the current flower result immediately. Activate the protocol.
6. If you know an existing Roll20 weather coordinate, use the reviewed position control to set it. Phase changes reset to center; this is explicit and audited.
7. Complete Night normally once all genuine obligations are resolved. The clock, saved weather, sidebar and Morning scene update together. Do not reroll camp, meals or old dice.
8. If the campaign is already in Morning from an older completion, choose **Review latest completed quarter for missing scene**. This uses the original completion and applies no clock, consumption or recovery again.
9. If model narration fails, the factual scene is already present. **Retry transition narration only** can recover AI-assisted phrasing without another weather roll. **Confirm current weather** provides a separate audited GM override; an “until explicitly replaced” result pauses automatic weather.
10. At a calendar boundary, configure actual ordered phase lengths (45/46 when following the printed calendar), source and review reason. Preserve historical records; do not invent a fixed Gregorian month length.
