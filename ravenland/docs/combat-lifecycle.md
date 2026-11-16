# Broken combatants and encounter conclusion (Phase 6.4.2)

The encounter controller can progress even when a character cannot perform a voluntary action. It never spends an action, restores an attribute, or discards an attack to escape a Broken state.

## Root cause

`executePlayerIntent` checked `actor.broken || actor.withdrawn` before handling `end_turn`. This rejected End My Turn as an illegal character action. Separately, the workflow's “no active player combatant remains” blocker stopped bounded enemy orchestration without producing a terminal outcome. Only defeated/withdrawn enemies had an automatic conclusion route. Legacy `/combat end` blindly set `status=ended`, even with pending attacks or critical procedures; it did not produce a structured narrative handoff. Ended combat dialogue was excluded from ordinary current-scene context, so surviving enemies and defeat consequences were not reliably carried forward.

## Authoritative rules consulted

Both actual fifth-printing PDFs were available and used in integration/browser testing. This feature's Broken procedures come from the Player's Handbook:

| Printed page | Physical PDF page | Verified subject |
| --- | --- | --- |
| 105 | 109 | Helmet protection for slash 65, stab 64, blunt 64–66: actual helmet Gear roll; successful protection substitutes blunt 11–12 and reduces helmet rating to zero. |
| 107 | 111 | Attribute-specific Broken effects: Strength permits crawling/mumbling; Agility crawling/wheezing; Wits permits running to safety if conscious; Empathy is uncommunicative until recovery. Other normal actions/skill rolls are restricted. |
| 108–109 | 112–113 | Defenselessness, Healing/Performance, D6-hour initial recovery, later rest, lasting critical injuries and lethal deadlines. Broken alone does not establish death; a coup de grace has its own requirements. |
| 110 | 114 | No critical injury for condition damage or breaking oneself by pushing; pushing cannot kill the character. NPC Broken guidance. |
| 196–200 | 200–204 | Slash, blunt, stab, other-damage and horror critical tables, including immediate-death entries and lasting effects. |

The verifier checks actual indexed rule text, not catalog defaults or model memory. Critical results use the exact official row. Shared row lookup also serves the existing NPC critical resolver. Missing/ambiguous evidence and scoped combat house rules remain blockers.

## Persistence and progression

- Existing character sheets remain the source of player attributes. The engine still does **not** apply attack damage to a player's attributes. Apply recorded attack damage through the sheet as before.
- Sheet saves and server-authoritative pushes reconcile the existing encounter in the caller's SQLite transaction. Opening Combat also reconciles legacy saves once; unchanged projections do not write or reload the books.
- A zero transition creates one Broken procedure per attribute episode. An actual push records its cause automatically; healing ends that episode without erasing the injury. A later new zero transition gets a new identity.
- Unknown Strength/Wits causes require confirmation in Combat. The application does not infer a slash wound, a fear injury, or a push exemption from a zero value alone. Already recorded history is retained.
- Mandatory pending attacks/defenses/Armor finish first, including a previously declared defense whose push caused Broken. The recorded pre-push pool remains authoritative.
- Ineligible initiative turns are skipped at no action cost. One Broken PC does not end a fight while another PC and an opponent can still fight. If a whole side cannot continue, the encounter concludes once mandatory procedures finish. Surviving active NPCs are retained after player defeat.
- Completion stores an immutable `outcome` in the existing combat JSON, with conditions, survivors, injury procedures, location and recent completed events. No new character model, replacement combat store or database migration is needed.

## Player critical workflow

1. Finish the recorded attack and Armor, then update damage on the sheet.
2. For an unknown Strength/Wits cause, select the actual confirmed cause in Combat. A Wits injury uses the horror procedure unless an exemption applies.
3. When requested, open the character sheet and use its existing **D66** button. Attach the saved result and Send (or submit the eligible roll in Combat). The first compatible saved result is required; it cannot be replaced with a later favorable result.
4. If the source row permits helmet protection, use **Stage requested Helmet**, roll its actual recorded Gear Dice, attach and Send. This cannot be pushed. No helmet result is invented.
5. The resolved injury is appended to the existing Critical Injuries field using a stable procedure marker. It does not overwrite existing notes. A successful helmet save changes its recorded rating to zero according to the verified rule; it does not apply attribute damage.

Receipts, fingerprints, phase/encounter binding and consumed-roll IDs are reused. Narration failure can retry the frozen result after the encounter has ended; it cannot reroll the critical, duplicate the injury or advance initiative again.

## End Encounter and administrative controls

**End encounter** checks mandatory procedures and explains what remains. Broken itself is not a reason to reject closure. If both sides can still fight, it explains that this is not a normal conclusion.

In trusted local development, **Encounter controller** provides explicitly confirmed established withdrawal/surrender records and **Administrative interruption**, which requires a reason. These are controller adjudications, not free fleeing maneuvers. Even administrative interruption cannot bypass an attack, required roll or critical injury. They remain unavailable to ordinary hosted player credentials until a GM role is implemented. Repeated End after conclusion is harmless.

## Narrative handoff and boundaries

The next ordinary GM request receives `context.encounterOutcome` only for the latest concluded encounter at the current location. A newer encounter or another location prevents revival of old combatants. The frozen outcome is distinguished from current sheet values, which take precedence for current conditions. Exact character details are filtered through existing character grants; public Combat projections omit private attribute snapshots and injury fields. No GM-only memories are included.

The handoff includes the confirmed original setup and approved party-known memories for the involved NPCs. A robbery motive is carried forward when actually established; it is not a default for all bandits. Instructions preserve Broken awareness and player decisions and permit narrative continuation without establishing theft, captivity, death, rescue, departure, recovery or inventory changes automatically. Skill-dependent declarations while Broken no longer demand a prohibited fresh roll. Existing authorized operations remain required for mechanical changes.

## Checks

From `ravenland/`, with the legitimate PDFs outside Git:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:combat-lifecycle
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:defense-sequencing
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:action-interface
npm run typecheck
npm run build
```

`combat-lifecycle.test.ts` covers deterministic eligibility, pending-mechanics gates, multiple players, push episodes, hostile withdrawal and no implicit healing. `combat-lifecycle-real.ts` uses actual indexed books for source verification, saved D66/helmet rolls, replay, missing evidence/retry, Broken defeat, multiple characters and SQLite reopen. `combat-lifecycle-browser.cjs` uses main chat, Combat, sheet damage skulls, Armor/D66 attachment, refresh, server restart and post-defeat context inspection. Browser/API model and random adapters are controlled fixtures; no paid model call is made or claimed. Earlier scene-boundary tests now finish their actual pending rolls before a specifically labeled administrative interruption; they no longer rely on End discarding mechanics.

## Remaining limits

Healing/Performance checks, injury healing durations and lethal timers (including the extra D6 rolls), coup de grace, recovery and death bookkeeping remain manual. The exact injury row and any unrolled deadline requirement are retained in the sheet/outcome; ending combat does not resolve those later obligations. This is not an automatic recovery/death scheduler. Unknown legacy injury causes require confirmation and legacy free-text injuries cannot be certified as already rolled without supporting saved evidence. NPC withdrawal/surrender is a confirmed local-controller record, not an autonomous morale system. Live paid-model narrative quality requires a separate playtest; automated tests verify the contract and guarded combat narration with controlled responses. GM authentication for hosted administrative controls is still future work.

## Completed verification for this repair

- Before changes: 377 unit tests and 135 actual-PDF tests passed.
- Final unit run: 387 passed, 0 failed, 0 skipped.
- Final actual-sourcebook run: 146 passed, 0 failed, 0 skipped; both original PDFs were extracted/indexed in isolated databases. The final retrieval gate's unit leg had 386 tests; the separately rerun final unit suite includes the additional resource-utility isolation regression.
- Browser suites passed: new combat lifecycle, existing defensive sequencing, existing AI action interface, production campaign persistence, and production dice repair/pushing.
- TypeScript and the optimized production build passed. No paid AI requests were made; browser and narrative tests used controlled SDK responses and dice adapters.
- No live campaign or private source files were modified, and no PDFs, database fixtures or extracted book bodies are included in the commit.
