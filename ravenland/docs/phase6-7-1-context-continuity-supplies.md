# Phase 6.7.1 — Context, continuity, supplies and carrying

Implemented from `76a2b74` on `ravenland-ai-gm-prototype`. All checks use temporary databases, synthetic scenes, controlled providers and the original private fifth-printing books. Existing Belderand and historical Edrus records are not used or retroactively changed. In particular, previously hand-entered supplies are not reapplied.

## 1. Campaign Records root cause and reproduction

`recallIntent` matched broad phrases including “where is”, “what did” and “what happened”. `assembleContext` classified these as historical recall before considering the active exchange. The AI service then returned its no-evidence canon guard before normal narration. Three pre-repair tests reproduced this classification for the exact Mila question, the full farmer question and “What did you see?”.

The existing sheet also had a concrete calculation omission: `renderEncumbrance` summed ordinary gear and carried armor/helmet/shield, with no weapon or resource contribution. A browser test serves the actual prior-commit sheet against the same isolated persisted character: Dagger, Food D6 and Water D8 displayed **0/6**. The repaired sheet displays **2.5/6**.

Other live-model behavior cannot be diagnosed conclusively from an unavailable Belderand database or by a paid-model replay. Inspection found no structured appointment source, no supported ordinary-play allocation bridge, a permissive quarter-day proposal filter and prompt-only protection for PC dialogue. Controlled tests exercise the corrected boundaries; they do not claim to reproduce a particular live model's internal decisions.

## 2. Contextual conversations

Deictic and second-person questions inherit active play. Short named followups can inherit an active scene when the named subject is actually mentioned there. Unknown named historical lookups retain the evidence boundary; explicit records, journal, earlier-session, promise and recall requests still use authoritative retrieval. The literal Mila/farmer messages reach a controlled GM provider.

NPCs can supply attributed, mistaken or creative testimony. Neither this routing nor ordinary narration writes map coordinates, inventory or canonical location records. Explicit rule questions retain their separate retrieval boundary.

## 3. Appointments and commitments

Migration 022 adds `campaign_arrangements`, `campaign_stocks`, `logistics_receipts` and `encumbrance_checks`. Arrangements have stable IDs, revisions, status, shared visibility, description, exact location label, verified hex, organizer, participants, timing, associated promises, source message and history.

Typed GM appointment proposals are persisted as **proposed**, independent of the chat window. Accepting the saved proposal promotes that same ID rather than creating a second meeting. An accepted arrangement is **scheduled**; start, complete and cancel are recorded operations. Completed/cancelled history remains available separately. These records survive navigation, unrelated conversations, refresh, restart and SQLite reopening.

Attendance and delivery are separate. Completing a meeting does not give anyone equipment. Outgoing stock transactions can record partial fulfillment with the exact stock, before/after quantity and receipt. Selling supplies back to a stock does not fulfill an NPC's delivery promise. Unspecified remaining promises stay pending.

Starting an event at another hex requires actual travel first. Starting a meeting only updates the global party's within-hex location if all current PCs are explicitly listed; it does not force absent or separately situated characters to assemble.

## 4. Player agency

The protected Charter reinforces control of every PC even when one person owns several sheets. A deterministic boundary handles named PC-to-PC questions, requests about unestablished PC activities and common group followups. It invites an Acting As switch instead of inventing an answer. A bounded narration check withholds common unsolicited PC speech, opinions, decisions and drills; explicit player declarations and recorded quoted speech remain available. NPC dialogue remains free to develop the scene.

These checks supplement the Charter and existing dispatcher authorization. They are not presented as a perfect semantic detector for every possible sentence. Mandatory injuries and other verified involuntary consequences retain their existing deterministic paths.

## 5. Lore and shared time

The quarter-day proposal filter now requires a relevant travel/activity declaration. The exact Lore request does not create a quarter-day form, time event or journey action. Immediate Lore recollection is distinct from Hike, Make Camp or a declared quarter-day activity.

Scheduling never advances time. Explicit reviewed waits in supported minutes/hours call the existing `advanceTime` service, preserving event/source IDs, scope, authority, deadline review requirements and idempotency. Remaining waits subtract actual same-unit elapsed events recorded since scheduling; an intervening hour reduces a two-hour wait to one. No second timer or round/hour conversion is introduced. Incompatible units require review. Calendar waits in days/quarter-days route the user to the existing quarter-day workflow, so calendar and deadlines cannot diverge.

Narrative-only claims of elapsed time are guarded when no verified time receipt supports them. An appointment approaching is not evidence that the party waited.

## 6. Inventory model

The character sheet remains the inventory source of truth. New transactions update its existing gear/weapon arrays and resource fields with `sheetFor`/`applySheet`, then use combat reconciliation and the existing revisioned campaign save. No parallel character inventory is introduced.

A reviewed available world source records identity, quantity, weight, witnessed message, current verified hex, reason, optional agreed silver price/cash and an associated commitment. This records availability, not a handover. Character sources use saved array references plus an exact expected item identity; they are revalidated during the transaction.

Transfers preserve weapon condition and metadata. New physical items receive stable IDs; partial stack transfers receive distinct identities. Multiple allocations commit atomically, with before/after characters, changed stock quantities and one transaction receipt. Insufficient quantities, changed identities, stale revisions and changed request payloads reject without partial writes. Exact retries return the saved result. Re-recording the same witnessed source/item is rejected, and the UI retains an operation ID across a failed request. Genuine restocking needs new evidence. Preview uses the same validation and transaction but rolls back every change.

## 7. Consumables

Food, Water, Arrows and Torches remain individual saved Resource Dice: None, D6, D8, D10, D12. Verified acquired units raise a die one step; sharing removes exactly the steps given by the donor. Empty-to-D6 and the upper D12 bound are explicit. Overflow consumes nothing. No party-wide die pool is created.

Physical torches or meals are not assumed to be official units. Sources with uncertain conversion must be reviewed; six physical torches cannot automatically become four PCs' supply dice. Ordinary rope remains ordinary equipment with a reviewed quantity/weight and descriptive length where established.

## 8. Water

The actual Handbook well rule applies to a **stronghold well**. Forage success also has its own water result; ordinary village-well equivalence is not asserted as printed law. The implementation supports established stronghold wells and an explicitly reviewed local equivalent. The latter creates a scoped **human-controller GM ruling** through the existing ruling store. An invalidated or stale equivalence cannot authorize another refill.

Each completed approved refill sets the affected character's Water to D12 through the validated allocation. It does not replenish Food, alter other PCs by inference or consume quarter-days. Missing/unrecorded resource values require review rather than being fabricated.

## 9. Trading, resource use and receipts

Buying/selling ordinary recorded gear uses reviewed silver prices, merchant cash/stock and actual character silver. Buying verified consumable units also deducts the agreed price. Unsupported currency conversion or unestablished balances reject. Free gifts remain explicit transfers.

Resource use delegates to the existing `applyDiceCommand` Resource utility logic, using application-generated faces and a saved dice card. It does not implement a second depletion engine. On 1–2 the die steps down; an exhausted D6 becomes None. Receipts prevent double consumption or repeated transfers.

The model receives only safe mechanical receipt summaries, not raw before/after sheets or other characters' Dark Secrets. If an allocation fails, the last valid state remains; the UI gives the rejection and the offer remains pending. Unverified transfer/resource claims are withheld from ordinary chat. Provider deltas are buffered until those checks finish, so an unsafe claim cannot leak through streaming first.

## 10. Encumbrance

`src/lib/carrying.ts` is the one pure calculation used by services and compiled by the existing generator into standalone and embedded sheets. It counts Heavy 2, Normal 1, Light 0.5 and Tiny 0; carried weapons; carried armor/helmet/shield; one item for each nonempty resource category; and the Handbook's coin bundles. D6 and D12 have equal resource weight. Capacity uses base Strength, with the existing explicitly entered capacity bonus retained separately from attribute damage.

Equipping does not remove a carried weapon from weight. Known catalog features establish weapon weight; explicit weight metadata is retained. Shared item IDs prevent a weapon represented in gear and the weapon section from counting twice. Ambiguous legacy duplicates/aliases, unknown weights, invalid resource values and missing base Strength produce a review warning instead of a fabricated exact total. Values are preserved, and the UI offers weapon-weight review. Missing base Strength is not silently established by an unrelated sheet save.

Broken or unusable equipment remains a physical carried item until dropped/removed; a damaged Gear Bonus is not a weight reduction. Acquisition may make a character overloaded and is not automatically refused for that reason.

Known overloaded combat Run and chat-quarter Hike completion require a fresh saved Endurance check bound by the server to the actual encounter/turn/action or quarter/hex scope. Success permits that operation once. On failure, the player can stay, drop enough gear through actual inventory edits, or explicitly take the printed one Agility damage and continue. Retry cannot repeat damage. No extra fatigue, movement penalty or automatic failure choice is invented. Retreat retains its separate existing procedure.

## 11. UI

**Supplies & Commitments** provides available-source review, ordinary gear/resource sharing and trading, waterskin refill, a rollback-only allocation preview, actual resource/gear/silver before-and-after values, carrying totals, transaction application, event operations/history and Endurance review. Typed GM proposals use the same saved-proposal preview and apply flow beneath the reply. Routine NPC conversation does not require an approval.

The embedded sheet displays gear, weapon, armor, resource and coin contributions, combined total/capacity, overload status and unresolved metadata warnings. The existing hashed asset delivery ships the updated calculation automatically.

- [Actual carrying display](phase6-7-1-carrying.png)
- [Allocation preview with before/after values](phase6-7-1-supplies-review.png)
- [Actual supply workflow](phase6-7-1-supplies.png)

## 12. Charter and instructions

Charter version 1.1.1 extends existing agency, continuity and adjudication principles. It adds contextual speech, NPC testimony versus fact, stable appointments, voluntary PC control, immediate checks versus journey procedures, and receipts as the boundary for mechanical completion. The existing Forbidden Lands adapter describes the typed stock, allocation, appointment and event operations. Source and house-rule priorities remain: relevant active house overrides stop automatic official-default supply operations for explicit review.

## 13. Files and migration

New files: migration 022; carrying calculation; logistics schemas, source rules, transaction service, scoped overload checks and AI proposal bridge; conversation boundary helper; logistics API, panel and proposal review; focused, real-book and browser tests; screenshots and this report.

Extended files: AI context/provider schema/service/adapter/Charter; character sheet schema and awareness; saved dice schema/service; combat player-action and journey completion gates; lifecycle reset retirement; root sheet and generator; npm scripts and regression fixtures. The legacy streaming test now verifies the validated final narration rather than requiring unvalidated deltas. The quarter-day adapter test uses an explicit quarter-day declaration; unrelated NPC speech can no longer authorize that procedure.

## 14–15. Validation

- `npm run test:retrieval-check` with both actual private fifth-printing PDFs: **507 regression tests and 184 real-PDF tests passed**, zero skipped.
- `npm run test:context-logistics`: **18 focused checks passed** (included in the regression count), covering literal conversation failures, explicit records, agency, carrying, Lore, safe streamed narration and persistent unaccepted appointments.
- `npm run test:logistics:real`: **25 checks passed** independently using the original books, including stock/character transfers, purchases and sales, paid consumable units, resource steps/sharing/refill/use, rollback/replay, appointment waits, scoped rulings/house overrides, export/import and overloaded Hike/Run behavior.
- `npm run test:context-logistics:browser`: **passed**. Renders the actual pre-repair sheet for comparison; verifies corrected components, equip-toggle invariance, source registration, unapplied preview, saved allocation/IDs, NPC followup, refresh and process restart with the hall appointment intact.
- `npm run test:genesis:browser`: **passed**; the Session Zero workflow remains intact.
- `npm run test:library-corrections:browser`: **passed**; inherited PDFs/custom rules/images and legacy weapon persistence/dice/layout remain intact.
- `npm run build`, `npm run typecheck`, `git diff --check`: **passed**.

No automated test makes paid model calls or mutates a live campaign. Screenshots contain isolated test fiction. The original licensed PDFs, extracted text, temporary SQLite files and book-body snapshots are not committed.

Actual source verification uses printed Handbook pages **37–38** (physical PDF pages **41–42**) for carrying capacity, weight classes, coin bundles, overload, consumables, finding/buying, sharing and depletion. The stronghold-well effect is on printed **172**, physical **176**. Original Guide/Handbook retrieval and the Phase 6.7 village generator remain in the full real-sourcebook suite. Public/private visibility is not changed; books, extracted text and private fixtures are excluded from Git.

## 16. Compatibility

Migration adds tables without rewriting existing campaign snapshots or source indexes. Existing campaigns gain contextual routing and the shared read-only carrying calculation; their inventory values and manually entered historical supplies remain intact. No appointments or stocks are mined from old narration as completed mechanics. New typed intentions and reviewed sources are recorded prospectively.

Reset retains existing character inventory and libraries while clearing scene appointments, source offers and pending checks. Prior transaction/check request IDs are retired. Campaign Genesis remains separate and continues to work as before.

## 17. Limits and unsupported operations

- No live-model quality test or actual Belderand database replay is claimed. Complex language can still require clarification; prose safeguards are bounded, not universal semantic proofs.
- Supply administration currently uses the trusted local controller. Hosted character access does not grant world-source establishment, another character's inventory or party-wide confirmation rights. Arrangement records are shared Party Known facts; private event channels are not introduced.
- Stock acquisition does not infer physical-to-consumable conversions, currency exchange, barter values, theft/search loot or arbitrary new weapon statistics. Silver trades require reviewed prices and actual balances. Automatic Forage resolution remains in the existing journey/adjudication workflow.
- Ordinary village well eligibility is an explicit scoped ruling. Inherited house rules are not silently displaced by these operations.
- Supplies, new resource-use operations, meeting movement and waiting do not bypass active encounter action costs; resolve the encounter or use its supported existing procedure first.
- Minute/hour waiting retains the coarse campaign date/quarter while recording real elapsed evidence. Calendar waits use the existing quarter-day workflow. Unknown conversions and deadlines remain for protected review.
- Encumbrance checks cover combat Run and chat-quarter Hike completion. Older/manual journey adjudications retain their existing review boundaries. Unknown legacy item identities need explicit review; no speculative bulk migration or name-only deduplication occurs.
- A delivery receipt establishes only the recorded transfer. Other free-form promises remain pending; the GM may explain obstacles, cancel or replace arrangements with an auditable reason.
- The code is saved to the prototype branch; this does not update the user's running installation by itself.

## 18. Manual Belderand playtest

1. Update and restart the application. Export a backup first. Test with an isolated copy; do not reapply Jorin's already hand-entered historical supplies.
2. Continue an NPC exchange and use “Where is this happening?” and the full farmer question. Check the GM answers through the speaker and attributes testimony. Ask explicitly for campaign records separately.
3. Ask Edrus a question while Acting As Rose. The GM should invite Edrus's player response. Ask what Elyanna is doing without a prior declaration; it should not invent drills or advice.
4. Request the exact Lore recollection. Check no quarter-day form or elapsed-time event appears.
5. Arrange a new village-hall meeting and a separate supply promise. Review the persistent event. Discuss other leads, refresh and restart, then return to the appointment. Check location, participants and pending delivery remain correct. Approve a supported wait only when actually wanted.
6. For a new witnessed offer, record actual available rope/consumable units and evidence in Supplies & Commitments. Leave physical torch conversion unresolved until established. Review a distribution and compare each character's resources, gear, silver and carrying total before applying.
7. For a reliable well, establish its actual scope or explicit equivalent ruling. Preview and apply the refill. Check only selected waterskins change and persist after reopening.
8. Open the character sheet. Equipped/unequipped carried weapons should weigh equally; D6/D12 of one consumable should each weigh one item. Check the displayed components, base-Strength capacity and any legacy-review warning.
9. On an isolated overloaded character, try Hike/Run. Roll Endurance, review the saved scoped result and choose the printed failure option if necessary. Repeating a completed request must not duplicate damage, equipment or supplies.
