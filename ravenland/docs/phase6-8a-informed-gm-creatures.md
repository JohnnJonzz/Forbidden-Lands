# Phase 6.8a — Informed GM judgment, Backstory, Mount and Companion

Baseline: `e834f6024b8d064f9a88c8b36736c426691e20dc` on `ravenland-ai-gm-prototype`.

## 1. Incorrect one-time ruling classification

The classifier matched “house rule” inside “not a permanent house rule” before considering temporary scope. It also lacked a distinct assumption intent. Temporary scope now takes priority, negated recurring wording is excluded, and an authenticated GM role alone cannot make an ordinary statement a ruling. Questions and speculative statements do not authorize mutations.

## 2. Assumptions, challenges and overrides

Assertions about remaining movement are checked against the saved expedition and destination. A correct assumption can be acknowledged without moving the party. A contradiction receives a short explanation and available choices. An incomplete temporary exception stays pending; an explicit authorized follow-up can cover both route extension and difficult-ground allowance. Asking whether both constraints are covered is not consent. Rulings preserve navigation, encounters, adjacency and actual movement requirements.

## 3. Knowledge controls

Authoritative private map facts inform checks. Known terrain may be named; an unrevealed destination receives observable description rather than its hidden map classification. Public journey/context records mask unrevealed planned terrain. Generated encounter descriptions omit the private encounter-table entry number and D66 result. Private Backstory enters bounded internal GM preparation only for an authorized owner/GM request, with an explicit no-disclosure policy. Public responses strip other owners’ private Backstories.

## 4. Terrain and narration

Checks use the actual campaign map: U06 is Forest; V07 is Dark Forest. Travel narration is checked against map positions, classification visibility and recorded arrival. A route intention or temporary ruling does not itself record entry. Existing rumored-location and testimony handling remains in place.

## 5. Sheet layout

The established dark sheet remains. Talents sits on the left below the primary attributes/skills/details row; Consumables occupies the lower right. An eight-row, scrollable Backstory editor joins Personal Details alongside the preserved Pride, Dark Secret, relationships and appearance fields. Collapsible Mount and Companion sections follow Spells. Desktop and mobile screenshots are included beside this report.

## 6. Backstory persistence and AI use

Optional multiline text supports up to 20,000 characters, save/reload, portable import/export and character copies. Owner and GM is the private default; Party Known is explicit. Relevant public excerpts are bounded and ranked, labeled player-authored claims rather than canon or NPC knowledge. Private excerpts are restricted to internal preparation and are not saved in public context. An exact-sentence disclosure guard also checks emitted and persisted narration. Background claims cannot grant mechanical bonuses or automatically establish NPCs/history.

## 7. Mount model and load

A shared creature record stores identity, roles, provenance, actual attributes and damage, skills, movement, armor and armor damage, natural attack, conditions, status, accompanying/mounted state, notes, coins and physical inventory. Unknown attributes remain unknown. Handbook p35 provides Strength ×2 while ridden and ×4 when led; current recorded Strength, carried status, stack quantities, weights and coin load determine capacity. The calculator is shared between server and embedded/standalone sheet. Mounted travel rechecks actual available, accompanying, mounted animals and their capacity when creature records exist.

## 8. Companions and Path of the Beast

The same creature can fill both roles using one ID and inventory. Supported source-backed templates are Wolf, Dog, Raven, Riding Horse and Donkey, verified against the original Guide animal tables, pp126–127. Missing Wits/Empathy are preserved as absent. Listed animal Scouting uses its listed skill without inventing a Wits rating, consistent with the Handbook animal rules.

Handbook p66 gates Path of the Beast: one non-riding animal; rank 1 sends it to a named nearby place for 1 WP without inventing discoveries; rank 2 spends one WP per recovered point on an actually Broken owner attribute; rank 3 costs 1 WP and commands one round on the owner’s initiative. Actual owner talent rank and resources are required. Ordinary introductions remain roleplay.

## 9. Inventory and combat

Transfers move or split one stack transactionally between rider and creature, preserving physical identity and separate carrying totals. Replay receipts prevent double transfers/spending; revisions and expected snapshots reject stale choices. Linked weapon/resource-die items require their existing special procedure. Combat inventory handling cannot bypass action costs.

A commanded animal attacks an actual enemy through the existing combat attack, reaction, armor and damage engine using its own pool and natural weapon. It receives no initiative draw or separate PC turn; the owner’s action budget remains distinct. Incoming physical attacks use the animal’s defense, armor and damage. Broken animals create the printed one-hour Animal Handling recovery obligation rather than a human critical injury. Creature dice are saved separately and cannot be pushed to damage the owner or generate owner WP. Custom statistics require authenticated Table GM approval of their exact mechanical fingerprint.

## 10. Files and migration

New shared schema/load modules: `src/lib/creatures.ts`, `creature-load.ts`. New server modules under `src/server/creatures/` implement verified sources, commands, combat, conversations and context. `/api/creatures` uses the existing owner authorization boundary. Narrative intent/journey/rulings, map claims and knowledge filtering were extended. Character validation, portability, save service, sheet bridge/UI, AI context/service, combat engine/lifecycle and relevant API response filtering integrate the records.

Migration `024_creature_receipts.sql` adds only the transactional replay ledger. Existing reset handling clears its campaign rows. Optional sheet fields preserve old saves. The generator now avoids unchanged writes and replaces generated files atomically, preventing concurrent readers from observing a truncated module. New unit, original-book and browser tests cover the additions; existing migration-count assertions and the intentionally more natural terrain challenge assertion were updated.

## 11. Automated regression results

`RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check` passed: 539/539 general tests and 237/237 original-PDF checks. The focused original-book creature/conversation suite passed 10/10 checks. Production build and TypeScript checks passed.

Original books are private fixtures, indexed into isolated databases. Controlled dice/providers avoid paid model calls. No live Ravenland Mysteries data was changed; no PDF, full extracted book text, private database or source snapshot is included.

## 12. Browser results

The new Phase 6.8a browser suite passed desktop/mobile layout, long Backstory save/reload, preserved sheet identity fields, original-template animals, repeating inventory, rider/creature transfers, one record with two roles, creature dice, scouting WP, rank-three commanded attack, unchanged owner initiative, restart and hosted other-owner privacy/mutation denial. Screenshots: [desktop](phase6-8a-character-sheet.png), [mobile](phase6-8a-mobile-sheet.png).

The existing Phase 6.8 conversational journey browser and combat lifecycle browser also passed. The older `character-windows-browser.cjs` was attempted but timed out at its legacy “Quarter-Day Activities” setup button before exercising window synchronization; it is not reported as passing. The new Phase 6.8a sheet/browser test covers the updated sheet persistence, controls, restart, responsive layout and owner boundaries.

## 13. Existing-campaign compatibility

No migration invents animals or rewrites background fields. Older characters need no new fields. Existing portrait, skill, weapon, dice and critical-injury fields remain intact. Portable copies get independent creature/item IDs and accompanying/mounted flags reset; linking both roles within one character retains one creature. Legacy declared mounted travel remains available for campaigns without saved creature records. Book verification is required for new mechanical creature operations, with explicit holds when evidence is missing.

## 14. Belderand conversation acceptance

The isolated four-PC fixture starts T05, navigates to U06 on 12th Stillfall, 1165, Day, creates an unresolved Nightwarg declaration and administratively aborts it through the existing recovery API.

1. The exact “We are not pursuing the Nightwarg…” continuation is treated as travel, without repeating obsolete combat recovery instructions.
2. The exact “As Table GM…not a permanent house rule” declaration stays temporary and asks whether both route extension and difficult-ground allowance are intended.
3. “We are in Forest and can travel one more hex…” challenges the destination-ground assumption without creating an override or recording V07 entry.
4. “You’re right. We’ll wait until the next quarter-day.” completes through the existing workflow to Evening, once. The original Day Tracker row and aborted encounter JSON remain unchanged; position remains U06.
5. A separate fixture explicitly authorizes both constraints for two hexes. Questions and an ordinary authenticated owner cannot approve the pending exception; the assigned GM can. The ruling belongs to that journey, keeps actual V07 terrain and requests its remaining navigation procedure. A new saved successful Survival result then records actual V07 entry, still in Day. No recurring Forest rule is created.

## 15. Limits and manual procedures

- Templates cover the five verified common animals above. Other species/custom abilities need a supported source and explicit Table GM approval; no bestiary-wide automation is claimed.
- Creature conditions are recorded; unusual condition effects require their applicable procedure rather than an invented universal modifier.
- Standard physical companion attacks are integrated. Special attacks involving absent animal attributes require adjudication. Animal rescue/healing and unusual mobility/actions retain source-specific/manual review; the Broken-animal deadline remains recorded.
- Resource dice and linked equipped weapons cannot be silently converted to ordinary creature cargo. Use the existing allocation/equipment procedure first. Inventory transfers during active combat require its supported action procedure.
- Rank-one scouting records the paid mission; it does not automatically reveal hidden encounters. The GM resolves the actual nearby observations. Rank-three chat can command; the sheet selects an actual enemy and declares the supported attack.
- Private-context policy and exact-text filtering reduce disclosure risk; they are not a formal guarantee against every model paraphrase. Keep genuinely secret revelations out of shared narration until their owner reveals them.
- Map-claim checks cover concrete supported forms rather than proving every possible natural-language sentence. Unknown procedures stay reviewable instead of fabricating mechanics.
