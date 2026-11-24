# Phase 6.8e — Unified Campaign Calendar and Settings Reorganization

The earlier character-sheet layout is retained. This change implements the calendar/settings continuation. Development and browser acceptance use isolated temporary campaigns, databases and the user's original private PDFs. No live campaign is corrected, reconfigured or activated automatically.

## Root causes and authoritative clock

Campaign Settings previously edited current date, quarter, hex and weather. Journey Settings held a separate Foraging season. Weather activation accepted a separate weather phase. These could disagree or overwrite current state while editing campaign setup.

The current `campaign.date` and `campaign.quarter` remain the gameplay clock. The reviewed `environment.calendar` supplies phase order, lengths and scoped historical label aliases. `calendarState` adds an original clock anchor and monotonic elapsed-quarter identity; normal verified journey transactions advance that identity once. Settings and administrative label corrections do not advance it. A correction emits no synthetic time-advancement event: verified minutes within a quarter, narrative time estimates, appointments and existing deadline clock baselines are preserved. Starting conditions are separate historical metadata.

Weather, current-state views, seasonal activities and injury timelines use this shared clock. Injury countdowns prefer the elapsed-quarter identity relative to the reviewed anchor. The existing consequence/appointment time-event engine remains responsible for its supported precise units and mandatory procedures; this is not a replacement scheduler.

The original Guide's calendar section (printed p. 35) establishes eight phases, eight festivals and 45/46-day periods, with festival dates decreed in-world and varying locally. It does not prescribe a fixed distribution of the eight phase lengths for this campaign. AS means After the Shift; 1165 AS is the current era in the setting. The eight selected campaign/weather labels are Springrise, Springwane, Summerrise, Summerwane, Fallrise, Fallwane, Winterrise and Winterwane. The application requires explicit review of every 45/46-day boundary rather than inventing a festival schedule.

## Settings

**Campaign Settings** retains identity, description, tone and house rules. Starting Conditions & Campaign Calendar contains historical starting date (phase/day/year), quarter, settlement/hex/location/terrain, and the reviewed boundary configuration. Unknown legacy starting metadata stays unknown until established. New campaigns record their actual initial conditions. Editing starting metadata does not change the current world.

**Journey Settings** begins with Current Campaign State: current date, quarter, phase, official seasonal category, hex, location, terrain, weather, occupied campsite and elapsed-quarter anchor count. It retains Food/Water checkpoint, default Lead the Way/Keep Watch and Hike preferences. Current weather and protocol activation are handled through the existing Table GM weather controls, not ordinary preference saves. An editable competing season is removed.

Foraging derives Spring −1, Summer 0, Autumn +1 or Winter −2 from the campaign phase; its terrain and talent rules remain source-backed. Hunting shares the current season context but receives no invented seasonal modifier. Unreviewed legacy campaigns retain their existing season preference for compatibility. Reviewed calendar setup clears that preference; current seasonal activity context is derived from the calendar. Completed activity outcomes are not recalculated.

## Reviewed correction procedure for Ravenland Mysteries

1. Open the intended campaign and verify its current position. If it is **13th Stillfall, 1165 — Morning, U06, At Camp**, preserve those day/quarter/location facts. Resolve any submitted quarter or active combat before administrative clock review. Completed encounters, including administrative aborts, are not reopened.
2. Use the assigned Table GM identity. Trusted local play has its controller identity; selecting a PC on a hosted instance does not grant GM authority.
3. Open **Campaign Settings → Starting Conditions & Campaign Calendar → Review eight calendar boundaries**. Choose **45 or 46 days for each of the eight phases**, supply the agreed boundary source and a reason of at least 20 characters. Preview the boundaries and confirm them. Do not guess the lengths from a civil calendar or this report.
4. If the historical starting metadata is absent or wrong, select **Historical starting conditions** there. Establish **12th Springrise, 1165 AS**, with the actual starting quarter, settlement, hex/location and terrain. Preview and confirm. This edits historical metadata only; it does not move the party back to its start.
5. Open **Journey Settings → Correct Current Campaign State**. Select **Seasonal label correction — same elapsed days**. Set Original seasonal label **Stillfall**, Corrected seasonal label **Springrise**, Affected year **1165**, and explain that the original season label was erroneous rather than elapsed time being wrong.
6. Click **Preview calendar correction**. Check that the proposed current date is **13th Springrise, 1165 — Morning**, elapsed quarters are unchanged, and the affected-record counts are plausible. Then choose **Confirm reviewed calendar correction**.
7. Verify Current Campaign State, the sidebar, Day Tracker and the affected character's injury indicator. The current hex/campsite, original rolls, inventory, completed activity/consumption/recovery receipts and combat history remain intact.

The correction records actor, category, reason, original/proposed state, affected records and receipt ID. Confirmation is atomic, revision-checked and idempotent. Edited or stale previews must be reviewed again. Non-GM participants cannot apply it. Labels are scoped to the affected year and cannot form ambiguous alias chains. A collision between existing daily-needs records blocks confirmation.

Original mechanical dates are retained in saved evidence. Corrected displays and equivalent-day lookups recognize the year-scoped alias; a label change does not create another food/water date, age food twice, consume more resources, heal a character or reroll weather. Daily-needs and provision operations, including continuity/sharing and same-day Sleep checks, use the same equivalence. Existing healer access, pending travel intentions, narrative journey scopes and overloaded Hike permits also retain their physical date/quarter/location scope; different actual days, locations and combat turns remain distinct.

## Activate Ravenland Weather v2.0 afterward

1. In Journey Settings, open **Weather & quarter transition** and enter the Table GM's environment-review reason.
2. Expand **Ravenland hex-flower v2.0 · Table GM**. The seasonal phase is now read from the corrected calendar, **Springrise** in this example. It cannot be selected independently.
3. Choose the **Temperature procedure**. Seasonal house rule and the supplied Book of Beasts p. 153 transcription remain distinct. The latter still requires explicit approval and is not represented as verified against an original Book of Beasts PDF.
4. Decide whether to approve the v2.0 Lead the Way / Make Camp modifiers as campaign house rules.
5. Check **Authorize one hex-flower step at each new in-world Morning**.
6. Leave **Approve replacing current weather now** unchecked to keep the existing manually established weather until the next new Morning. Check it only when explicitly authorizing an immediate reviewed replacement. Original weather history remains saved in either case.
7. Click **Activate Ravenland hex-flower**. If activated at the already-established Morning of the 13th without replacement, that day's weather remains unchanged; normal Night-to-Morning progression produces the next authorized step on the 14th. Refreshing or retrying cannot produce another daily result.

If the protocol is already enabled, correction updates its future seasonal phase without redrawing the current day's result or resetting the saved position. At phase boundaries the next daily step derives the new phase from the calendar and preserves a valid flower position. An incompatible position requires a Table GM position review instead of a silent reset. Ordinary journey-preference saves cannot reactivate a paused protocol or replace weather.

## Injury and timed-event integration

The completed sheet panels remain in place. Actual newly recorded combat injuries now capture the real campaign date/quarter and original procedure reference. Unknown healing durations remain unresolved; no die or healing time is invented from a name. Existing undated notes are not assigned an import/restart date.

The sheet receives the shared calendar and elapsed-quarter anchor. Relabeled sustained dates display correctly without rewriting their original injury receipt. A countdown reaching zero means **Healing due · confirm recovery**, not injury removal. Lethal deadlines, treatment attempts, attributes and permanent effects are not changed by calendar metadata.

Once the unified calendar is established, dates/durations are reviewed in **Journey Settings → Correct Current Campaign State → Injury timeline metadata**. Select the original injury, enter the proposed date/quarter/duration/unit and reason, review the old/new timing, then confirm. Direct sheet saves cannot bypass that audit for existing timeline metadata. Owner/GM-private timeline context is bounded; unrelated players do not receive these records, and shared narration is guarded against quoting private injury names.

The original Handbook's printed pp. 108–109 distinguish lasting injury effects, ordinary attribute recovery, and care's separate Healing roll that halves remaining healing time. This phase preserves those distinctions and the existing source-backed lethal-injury procedures.

## Compatibility and limits

- Migration `027_campaign_calendar.sql` adds a correction receipt table. It does not rewrite saved campaign snapshots. Campaign reset clears these receipts for the reset campaign.
- Existing campaigns initialize elapsed identity only through reviewed calendar setup. If no historical anchor can be established, the verified current clock becomes the anchor; the application does not fabricate unrecorded past time.
- Non-equivalent date jumps and wholesale changes to established historical phase lengths are deliberately blocked. They require an additional chronology/obligation migration, or normal verified gameplay advancement. This workflow supports equivalent date notation and reviewed seasonal-label corrections without bypassing timed obligations.
- Reviewed boundary lengths repeat as the campaign's chosen convention. No unsupported festival dates or annual religious decrees are generated.
- Campaign export/import retains the calendar, aliases, elapsed anchor, starting conditions, injury metadata and brief audit provenance in the session. As in the existing backup format, external SQL encounter/consequence/AI records are not reconstructed by an import; full calendar preview receipts remain in the original campaign database.
- Countdown resolution remains quarter-days. Unknown or non-convertible exact deadlines require their existing verified procedure. There is no new general scheduler, automatic treatment or automatic healing.

## Files and validation

Shared calendar/starting schemas and helpers live in `src/lib/campaign-calendar.ts`, `calendar.ts`, `environment.ts` and `injury-timeline.ts`. `src/server/calendar/` owns authorized previews, atomic confirmations and bounded injury context; `/api/calendar` exposes that workflow. The settings components, weather adapter, seasonal activity/continuity lookups, character metadata boundary and SQLite clock adapter use these shared definitions.

- Required `test:retrieval-check`: **572 general regression tests and 289 original-private-PDF integration tests passed**, zero failures/skips.
- `test:calendar`: **15 focused calendar/injury tests passed**. Coverage includes 45/46-day and year boundaries, legacy offsets, starting/current separation, permission checks, stale previews, idempotency, source history, freshness/daily-needs continuity, weather activation/phase transitions, injury correction, lethal clock preservation, unknown legacy anchors, precise within-quarter time and movement scopes.
- `test:calendar:real`: **2 additional original-PDF checks passed**, covering the official calendar/AS/festival statements and Handbook seasonal/healing distinctions.
- `test:calendar:browser`: **passed** using both private original PDFs and a temporary campaign. Four PCs complete Morning Rest at T05, Day travel to U06, Evening Make Camp/Forage, Night Sleep/Watch and the new Morning. Reviewed configuration and relabeling preserve the original mechanical state at **13th Springrise — Morning**, with **4 elapsed quarters**. A subsequent intentional normal Rest quarter advances the unified clock to **Day / 5 elapsed quarters** and the injury estimate from **5 to 4.75 days**, without healing or redrawing weather. Preference saves, mobile rendering, reload and server restart pass. No paid model calls.
- `test:sheet-layout`: **passed**, preserving the earlier desktop/mobile layout, original fields and resource/coin controls, gear/talent controls, carrying totals, saved depletion, injury metadata, reload and restart behavior.
- TypeScript (`tsc --noEmit`), production build (47 routes), and whitespace/diff checks passed.

[Reviewed current state on desktop](phase6-8e-calendar-review-desktop.png) · [Evening activities](phase6-8e-evening-activities.png) · [Original Morning before relabeling](phase6-8e-morning-desktop.png) · [Mobile after the additional verified Rest quarter](phase6-8e-sidebar-mobile.png)

All sourcebooks, complete extracted text, test databases and private source-body logs remain outside the commit.
