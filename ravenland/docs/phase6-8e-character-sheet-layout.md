# Phase 6.8e — targeted character sheet layout

This implements the requested character-sheet portion of Phase 6.8e. It does not implement the broader calendar/settings reorganization in the attached phase plan. No reference screenshot was present with this request; placement follows its written instructions.

- Resources & Coin contains the original Food, Water, Arrows, Torches, Copper, Silver and Gold controls, beside Gear on desktop and above it on mobile.
- Critical Injuries occupies the former resources slot beside Talents. The existing injury notes and effects remain editable and are preserved verbatim.
- Skills and Talents use natural panel heights. Other sheet sections, visual styling and mechanics are retained.
- Optional dated injury records contain a stable ID, sustained fantasy date and quarter, established duration/unit, permanent/manual recovery status, rule/roll/ruling reference, treatment/correction notes and original record-creation timestamp. Creation time is explicitly not the injury date.
- The live campaign date and quarter drive read-only healing estimates; reload/retry/restart never establish new injury dates or reroll durations. Unknown legacy dates, unknown durations and unconfigured cross-phase boundaries require review. Permanent injuries have no countdown. Reaching zero requests recovery confirmation and leaves effects, attributes and lethal deadlines untouched.
- These estimates have the existing campaign clock's quarter-day resolution. Exact sub-quarter elapsed time, automatic combat-to-timeline migration, treatment adjudication, a unified calendar migration and an audited Table GM correction workflow remain outside this layout change. Treatment/correction references can be recorded manually; no treatment roll or official duration is invented.
- Dated records use existing character save/ownership checks, optimistic conflict handling, imports/exports and draft recovery. Other players do not receive these records through campaign responses, even if a character's backstory is public. No new injury data is added to shared GM narration.

## Rule check

Validated against the user's original fifth-printing Player's Handbook, printed pp. 108–109: critical-injury effects persist during their stated healing period (days); care halves remaining healing time only after a separate successful Healing roll; attribute recovery alone does not heal the injury. The new controls record established results and do not implement a replacement for these procedures. The existing source-backed lethal-injury engine is unchanged.

## Verification

- General regression suite: 561 tests passed before the additional privacy test; focused injury suite: all 5 tests passed, including owner/GM visibility, unknown/permanent states, verified calendar boundaries, quarter-day progress and no automatic healing.
- Browser regression: isolated temporary campaign/database; desktop 1440×1000 and mobile 390×844; panel positions, natural heights, no page overflow, original notes, all resource selectors and coin values, gear/talent additions and removals, mobile Gear notes, skill-roll staging, carrying totals, saved resource die depletion, quarter advancement, reload and server restart.
- Every original static sheet field/control ID remains present exactly once, with its original type and event handlers. A standalone new-character check also confirms injury records are not inherited from the previous character.
- Production build and TypeScript checks passed.
- Original private sourcebook regression suite: 289 tests passed, zero failures/skips. This includes exact critical-table results, lethal deadlines, successful/failed/self treatment, lasting injury preservation, carrying/resources, replay and privacy checks. No private PDF or extracted source text is included in this commit.

[Desktop screenshot](phase-6.8e/sheet-desktop.png) · [Mobile screenshot](phase-6.8e/sheet-mobile.png)
