# Phase 6.8 — Conversational journeys and Table GM authority

Ordinary, supported journeys now run through chat and character-sheet dice. The application coordinates the existing journey engine; it does not give a model direct control over position, time, character resources or dice history. The historical Nightwarg abort no longer takes priority over a current travel declaration.

This is a bounded conversational controller, not complete autonomous handling of every wilderness encounter. The remaining limits are explicit in section 16.

## 1. Root causes of administrative friction

The former chat contract prepared or described a quarter but generally left submission, saved-card selection, route verification, encounter review, hex entry and completion to separate controls. The sheet saved independent cards without a pending journey request. Even a legal second leg therefore appeared to require further administration.

A separate recovery safeguard matched broad words including “continue,” “resume” and “what happens.” When an administratively aborted encounter belonged to the current submitted quarter, that safeguard returned the old abort notice before current travel could be handled. It did not require a new request for recovery information.

## 2. Conversational architecture

`server/narrative/journey.ts` coordinates typed intentions, current map geometry, printed travel evidence, role assignments and pending sheet requests. It invokes the existing `executeJourney` commands for submission, route planning, encounter review, mishaps, individual entries and quarter completion.

The coordination row stores intent and references. Position, exploration, the clock, Day Tracker, dice, consequences and canon remain in their existing authoritative stores. Journey commands can join an owning transaction, so a conversational command either commits its supported effects and receipt together or rolls back. Stable command IDs prevent repeated entries or clock charges.

The ordinary sequence is:

1. Declare a destination or unambiguous direction and journey roles.
2. Answer a short clarification if an essential role or route is missing.
3. Roll the requested skill directly from the relevant character sheet.
4. Let the controller associate the matching saved card and perform supported procedures.
5. Declare a further eligible leg, or say “finish the journey.”

Existing forms remain available for inspection and exceptional procedures.

## 3. Player-intent routing

Recognized declarations go through the conversational controller after the AI request is claimed and before combat/world/history safeguards. Replies still use the ordinary persisted chat request, streaming reply and replay mechanism. Known travel operations need no paid model call.

The classifier distinguishes travel, continuation, completion, keeping a result, scoped rulings, corrections and role spoofing. Questions, procedure explanations, speculation and historical descriptions do not execute travel. Names and unique first-name aliases identify roles. Missing role assignments can be supplied in a follow-up without repeating the route.

Directions are checked against calibrated map centers. Explicit intermediate hexes must be adjacent. An ambiguous shortest route asks for an intermediate hex rather than choosing one for the party. The current classifier deliberately supports bounded conversational patterns; arbitrary paraphrases still fall back to the existing GM conversation.

Recovery guidance now requires an explicit recovery/abort inquiry. Ordinary model context omits old recovery packets unless combat is active or recovery is actually requested.

## 4. Automatic roll recognition

Pending requests contain character, skill, activity, quarter, intended scope, modifier and source references. Sheet pool staging uses current recorded Wits and the relevant skill. A matching roll receives a server-bound request ID; later navigation also receives the existing route-step/hex navigation context.

The sheet’s normal skill button stages the requested pool. Saving the card triggers progression without Attach, Submit or Review controls. An unrelated card remains independent. Binding checks reject stale request IDs, extra unsupported equipment/artifact dice and incorrect pools. Active combat or mandatory consequences prevent a journey request from taking an unrelated procedure’s dice.

A failed eligible roll remains available to Push or keep. Pushing uses the existing damage/Willpower procedure. The controller never Pushes. If several failed cards need a decision, the player must identify the character. Typed success counts do not satisfy a request.

## 5. Printed rules and map verification

Validation uses the supplied original fifth-printing Handbook and Guide through the existing sourcebook library. Travel retains the existing evidence fingerprint and source-backed allowance checks. The controller adds the Guide’s actual numeric encounter-table row selection and the printed Pathfinder rank-one bonus.

Open terrain supports two hexes on foot or three with verified mounts; Difficult terrain supports one under normal rules. Named mounts must be established in the saved declaration for every traveler. Waterways, impassable terrain, missing evidence, unusual weather and unsupported modifiers remain explicit blockers.

Navigation is per new hex. A completed first-hex Survival card cannot authorize another new hex. The existing visited-hex exception remains authoritative. Watch is a detection check for a threat, not proof that an encounter exists or does not exist. A saved no-encounter table result permits omitting Watch without inventing a successful roll.

Night travel and uncertain seasonal light require their proper procedures. The controller does not silently treat Evening as daylight or infer a fantasy calendar’s season from an unverified date label. Pathfinder rank one uses its printed +1; higher-rank Rest/artifact procedures require review.

## 6. Mishaps and encounters

The GM encounter D66 is drawn once for the declared quarter and saved as an immutable narrative event with terrain, source and selected entry. The actual Guide row supplies the encounter number. A zero entry records no encounter through the existing expedition review command. Watch failure alone never creates an ambush or initiative.

A positive entry pauses travel for its specific printed scene procedure. It describes the saved detection result without deciding that PCs attack, pursue or flee. This phase does not implement every encounter’s NPCs, optional choices and special mechanics.

Failed navigation asks for the actual pathfinder D66 after the player’s Push decision. The existing source-backed mishap adapter applies supported consequences. The Fog acceptance test applies Empathy damage and movement reduction exactly once. Other unsupported consequences retain their mandatory holds; no generic “lost” outcome replaces the printed table. Stopping a journey cannot discard a saved failed navigation check’s unresolved mishap.

## 7. Time, position and entries

Only existing entry commands change the actual hex and exploration. Individual entries keep the same quarter. Completing the journey advances exactly one quarter, using the actual ending hex and existing weather rather than fabricating a forecast or elapsed fractions.

The original submitted Day Tracker assignments and their saved roll IDs remain immutable. Subsequent navigation and route extensions are append-only expedition updates. Original one-hex legacy plans require an explicit Table GM extension rather than being silently widened. A player can explicitly stop at the actual position once mandatory procedures permit completion.

## 8. Table GM identity and authorization

The default role belongs to the server-established `trusted-local` controller. It is independent of the selected PC, editable names and a claim to be “Player 1.” No new Player 1 account is invented.

Campaign Settings exposes Table GM assignment to the trusted local controller. Assignments use player identity, a revision and replay-protected receipts. A configured authenticated multiplayer player can hold the role. Ordinary players cannot self-assign it through chat or the assignment endpoint.

Party travel still requires trusted local coordination or access to all participating characters. Table GM status does not itself authorize another player’s choices, credentials, dice-history edits or arbitrary database mutation.

## 9. Accept, clarify, challenge and override

Ordinary verified travel proceeds without a route form. Missing roles, ambiguous paths or conflicting direction/destination ask for only the missing detail. A five-hex ordinary Forest declaration gets a concise normal-rate explanation and alternatives.

An authorized one-journey allowance is an applied existing GM ruling with actor, reason, source fingerprint and exact journey scope. The supported adapter bounds allowances to three hexes. It does not bypass adjacency, crossings, navigation, encounters or actual consequences. A valid applicable ruling is used on continuation rather than challenged again.

Recurring Forest-on-foot allowances are saved as visible House Rules in the existing compendium and linked to typed GM-ruling effects. Only their recorded terrain/mode scope is automated. Rule revision or applicability changes invalidate reuse. Conflicting recurring allowances require resolution.

A simple no-roll wall ruling is confined to the current scene, position and quarter. It does not become a universal rule. Claiming a title or repeating a request does not grant authority.

## 10. Audit and provenance

Mechanical events retain their existing ledgers. Narrative events separately preserve declarations, GM encounter draws and verified request/card bindings; they are evidence, not a second campaign-state engine. Narrative command receipts bind the request fingerprint to the authenticated actor.

Permanent Table GM facts go through the existing memory proposal, conflict check, approval and history mechanisms, with `GM-established` provenance and the original chat source. Speculation and NPC testimony are not promoted through this route. Scene rulings use scoped GM rulings rather than permanent location facts.

The mill correction checks the actual location and accepted canon. Without a verified contradiction it acknowledges that entering the mill was not established, preserving position and time. A genuine saved-location conflict requires an authorized correction rather than rewriting movement.

## 11. Files and schema

New migration `023_narrative_gm.sql` adds Table GM settings, the current narrative coordination row, narrative receipts and immutable narrative events. Campaign restart clears adventure coordination/history along with its other adventure ledgers while retaining controller configuration.

New modules live under `src/server/narrative/` and `src/lib/narrative/`. `/api/table-gm` and its settings component configure the role. AI dispatch/context, dice binding/callbacks, sheet bridging, requested-roll types and journey adapters integrate the controller. Existing journey submission gains server-validated no-roll exceptions; old commands retain their normal validation defaults.

The generated sheet asset version changes to refresh cached bridge code. Tests and this report are included. Private PDFs, full extracted source text and temporary campaign databases are excluded.

## 12. Automated validation

Validation passed: **536 general regression tests**, **228 real-PDF integration checks**, and a separate **33-test focused journey run** covering the final visited-hex and failure-completion changes. Production build and TypeScript checks passed. The three browser suites described below passed. Commands:

- `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`
- `npm run test:narrative-journey:real`
- `npm run test:narrative-journey:browser`
- `npm run build`
- `npm run typecheck`

The real-PDF integration includes normal travel, actual mixed terrain, saved-card scope and replay, Push/keep, a positive encounter and failed Watch, Fog, scoped/recurring rules, canon provenance, mounted travel, Pathfinder, legacy scope and the historical Nightwarg continuation. SDK-controlled provider regressions also preserve normal rules questions and conversation. No paid-model calls are part of the suite.

## 13. Browser validation

The new isolated four-PC browser flow uses ordinary chat and actual sheet buttons: declare travel, answer role clarification, roll Survival, enter U06, declare V05, roll its new Survival, finish at Evening. It opens no route, attachment, expedition-administration or recovery controls. It checks saved entries, exploration, Journal, dice scope and completion. No Watch roll is made for the saved no-encounter result.

A separate flow accepts a local Table GM allowance and permanent mill fact. After switching to the hosted runtime with an actual configured ordinary-player credential, the same requests and the GM-spoof claim are rejected. Restart preserves the earlier journey. The existing combat-recovery and GM-progression browser suites are also run.

[Conversational journey screenshot](phase6-8-conversational-journey.png)

## 14. Existing campaign compatibility

Migration is additive. No live campaign was used as a test fixture or corrected in place. Existing forms, submitted activities, cards, journal, combat recovery and manual GM tools remain available. Legacy journeys with a verified route can be adopted from their actual checkpoint. Missing plans or unresolved obligations require their real reconciliation; the controller does not manufacture the missing evidence.

A surviving one-hex plan is preserved and explicitly challenged before extension. A subsequent scoped Table GM allowance permits the supported continuation. Historical administrative aborts retain their original classification and attack records.

## 15. Belderand-specific results

The imported workbook verifies T05 → U06 → V07 adjacency. **V07 is Dark Forest**, so this is a mixed Forest/Dark Forest route. It is not automatically a normal two-Forest-hex journey. The ordinary all-Forest happy path uses T05 → U06 → V05.

The isolated recovered acceptance fixture preserves an explicit pre-existing two-hex mixed-terrain GM review. It creates and administratively aborts an actual source-backed Nightwarg pending attack, acknowledges its administrative closure and makes a verified first entry into U06 during Day. Chat then receives:

> We're not pursuing the creature. We continue southeast toward V07.

The response requests only the genuinely missing per-hex Survival check. It does not repeat Campaign Records instructions, request another Watch roll or initiative, force pursuit, or invent a successful Dodge, escape or victory. Saving the new Survival enters V07 while still in Day. The aborted encounter JSON, original attack/table/initiative history and original Day Tracker remain unchanged. Finishing advances to Evening once.

## 16. Remaining limits

This delivery automates the ordinary supported journey path and bounded rulings. It does not claim complete general-purpose autonomous GM behavior.

- Positive encounter entries are selected and persisted correctly, but their specific scenes still need existing GM/preparation/combat procedures. The controller does not yet narrate and resolve all 43 Guide encounters autonomously.
- Only the existing supported mishap effects execute automatically. Unsupported injury, cold, obstruction or encounter consequences keep their mandatory review.
- Water crossings, forced marches, unusual weather, darkness/group Scouting, higher Pathfinder ranks, extra equipment/artifact bonuses and complex travel modes retain reviewed procedures.
- Automatic recurring travel rules currently support explicit Forest-on-foot allowances up to three hexes. Other house rules remain in the existing compendium/review system.
- Natural-language handling is bounded. It is not a new unrestricted model tool-calling planner; unusual paraphrases may need a clearer declaration.
- No live paid-model journey was run. Repeatable AI-service, controlled SDK and browser integration checks establish application behavior, not production-model storytelling quality.
- Browser evidence covers the ordinary journey and role distinction; the exact recovered V07 scenario is covered by real-PDF service integration plus the existing real-browser recovery suite, rather than a new combined recovered-scenario browser test.
