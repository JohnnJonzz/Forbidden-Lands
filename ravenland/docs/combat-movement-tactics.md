# Phase 6.3.2 — Combat movement and bounded enemy weapon tactics

## Confirmed failure and repair

The baseline was `140454a` on `ravenland-ai-gm-prototype`, with a clean working tree. The baseline checks passed 329 unit tests and 96 actual-PDF integration tests. The temporary PDF fixture directory had been cleared; both original uploaded files were recovered from the workspace attachments and copied into private temporary test storage before the real baseline check. No synthetic book substituted for either original PDF.

The deadlock had several connected causes:

- `enemy-choices.ts` offered weapon attacks but no movement. A sword outside ARM’S LENGTH produced an empty list, rather than a Run or turn-ending alternative.
- `service.ts` stopped its enemy loop on that empty list without spending an action or advancing initiative. `workflow.ts` then hid Continue GM Turn behind a permanent positioning prompt.
- The active-encounter setup handler also consumed “Continue” after a completed setup, returning status without resuming an otherwise actionable enemy turn.
- Natural movement declarations did not reach a mechanical command. `conversation.ts` blocked invented wounds and damage but did not block completed movement prose, so narration could say that both combatants closed without changing range.
- Equipment was not distinguished as held versus carried. A carried sword could provide a Parry, and weapon selection did not account for drawing into available hands or readiness interruptions.

The repair retains the existing combat service, orchestration receipts, character sheets, canonical equipment lookup, saved dice, push handling and narration pipeline. No replacement combat or dice engine was added.

## Verified official rules

Both actual fifth-printing PDFs were extracted and indexed by the regression tests: Player’s Handbook (212 physical pages) and Gamemaster’s Guide (268 physical pages). Printed numbers below were observed in the original pages; they are separate from physical PDF page numbers.

| Original source | Physical PDF / printed page | Applied rule |
| --- | --- | --- |
| Handbook, Slow Actions & Fast Actions | 89 / 85 | One slow plus one fast action, or two fast actions. A fast action can consume the available slow-action slot. |
| Handbook, Fast Actions | 91 / 87 | Run, Retreat, Draw Weapon and Ready Weapon are fast actions; their prerequisites remain significant. |
| Handbook, Zones, Range Categories and Movement | 92 / 88 | Ordinary Run moves between neighboring zones, or NEAR and ARM’S LENGTH within the same zone. Rough zones require Move; a blocked border is not crossed freely. SHORT identifies a bordering zone; LONG does not establish an exact number of segments. |
| Handbook, Close Combat movement restriction | 93 / 89 | An active enemy at ARM’S LENGTH prevents using Run to leave melee; Retreat applies instead. |
| Handbook, Draw Weapon / Retreat | 97 / 93 | Drawing a weapon is fast and needs no roll. Retreat has a distinct melee prerequisite. |
| Handbook, Retreat continuation and example | 98 / 94 | Retreat moves to NEAR and requires Move. Failure still moves, but permits a free Slash, Stab or Punch without an action cost and without Dodge or Parry. The printed example spends two Run actions for SHORT → NEAR → ARM’S LENGTH. |
| Handbook, Ready Weapon | 101–102 / 97–98 | Bows/slings need a fast Ready before Shoot; actions other than Shoot/Aim interrupt that preparation. Crossbows instead Load as a slow action and may remain loaded while carried. |
| Handbook, Weapon Attributes | 104 / 100 | Grip determines one or two hands; a two-handed weapon cannot be combined with a shield. Canonical table entries continue to establish each weapon’s range and features. |
| Handbook, Rolling Dice | 46 / 42 | The verified ordinary success threshold is used for the requested Move result. |
| Gamemaster’s Guide, Typical NPCs | 187 / 183 | Existing official bandit attributes, skills and weapon statistics drive the integrated tests. No extra weapon or NPC roll is invented. |

`verifiedMobilityRules` checks the indexed original passages before supplying these facts. Missing evidence produces adjudication. Existing scoped combat house rules retain their precedence. The application does not silently treat LONG → SHORT as one Run or invent terrain, talent or speed modifiers.

I could not establish a voluntary Drop/Stow or combined Switch action cost from the indexed passages used for this implementation. Those changes are not automated. In the supported sling/sword case, both weapons are one-handed: the enemy retains its sling and spends a fast Draw to hold its already-recorded sword in the other available hand. It gains no Ambidextrous extra attack or invented off-hand modifier. With no free hand, the controller chooses another supported action or ends the turn; it does not discard equipment for free.

## Deterministic enemy policy

The controller uses only weapons already present in the verified encounter loadout. Explicit restrictions such as “armed with a sword” and “sword-armed” preserve a sword-only bandit. The separate ranged-to-melee test explicitly equips **a sling and sword**.

For ordinary humanoids, the policy builds a small plan from legal Draw, Ready/Load and attack steps, checks its action budget and chooses one next action:

1. At range, prefer a usable ranged attack that can legally be prepared and fired with the remaining actions.
2. At melee range, prefer a legal held melee weapon, or a fast Draw followed by a slow attack when the budget and hands allow it.
3. If no attack plan fits, consider a supported Run toward an accessible weapon’s range. A weapon that cannot be drawn into available hands does not justify that movement.
4. Otherwise perform a supported preparation action for a later turn, or End Turn. An unloaded crossbow can Load and end instead of inventing a second slow action or discarding it to draw a sword.

Each resulting list is deterministic. The existing optional model selector can only acknowledge an application-provided legal choice; no general-purpose tactical planner was added. The existing orchestration limit and stable per-step receipts remain. A step spends an action, creates a required player response, advances initiative or reports a genuine source/positioning limitation.

New encounters select an initially held verified weapon appropriate to their starting range. Bows/slings start unreadied, so their first shot pays Ready. Carried weapons remain in the loadout. Legacy records retain stored readiness and pending attacks; missing hand state is derived from recorded weapon use/Parry or the existing initial weapon rather than rewriting inventory. Readied bows/slings lose preparation on Run, Stand, Draw or a defensive reaction. A loaded crossbow retains its loaded state until its shot. The pending attack snapshots its actual weapon, and the shot consumes readiness/loading when the attack dice are rolled.

NPC Parry uses a held melee weapon or shield, including the existing source-backed modifiers. It cannot draw a carried sword for free merely because a player attacks before the NPC’s next turn. A sling-only held stance may instead Dodge, with its actual action and prone consequences.

## Position, actions and initiative

The existing encounter JSON now stores optional verified mobility rules, movement-condition flags, NPC hand state and an action audit. The existing `range` field is the authoritative range. Public combat status shows that range, the ordinary-ground baseline or recorded route condition, and held/selected/readied/loaded enemy weapon names. It does not expose enemy attributes, hidden carried inventory or sourcebook bodies.

Movement is currently bounded to one active player and one active enemy because the existing encounter has one shared range rather than a full relative zone graph. Ordinary NEAR ↔ SHORT and NEAR → ARM’S LENGTH moves are supported. A request to reach melee from SHORT can spend two fast actions, consuming both slots. NPCs at SHORT likewise take two Runs and cannot then make a slow attack. NPCs at NEAR can Run using the fast slot and attack using the slow slot. Existing verified NEAR-reach weapons can attack from their actual listed range.

Rough, blocked or unspecified routes, exact LONG distances and multi-opponent movement require adjudication rather than moving everyone through a single shared range. The baseline is ordinary ground, explicitly shown in Combat; geography and narrative adjectives do not silently create mechanical terrain modifiers. An enemy with no supported move/attack ends its turn with the reason recorded, so missing relative positions do not trap initiative. Combat with no remaining active player is a genuine outcome-adjudication blocker, not an infinite enemy loop or an inferred player death.

Natural declarations include “I approach the bandit,” “Edrus closes the distance,” “I move into sword range,” “I back away” and “I retreat.” Supported own-turn movement is committed before narration. Ambiguous direction, unsupported routes or movement while prone produce a clarification/adjudication response with no action spent. Player movement/attack declarations outside the player’s turn are not executed or queued: the application names the initiative owner and resumes an available enemy turn. A pending attack still requires its actual responder’s decision or roll.

The application never ends a player’s turn automatically. End My Turn remains available. An enemy unable to attack after spending its actions ends; it can retain an unused fast slot for a later reaction. The action log distinguishes a fast action paid from the slow slot from a genuine slow action.

## Retreat and dice-assisted chat

Retreat uses the existing `CombatEncounter.pending` record with a movement phase. Its action cost is paid when declared, but range stays at ARM’S LENGTH while awaiting the player’s Move roll. The player rolls and optionally pushes on the existing sheet, attaches the saved result and Sends. Existing IDs, fingerprints, first-compatible-roll ordering and ownership checks still apply.

The verified Move result completes the move once. A success grants no free attack. Failure also moves to NEAR, then the existing engine rolls an actual, undefendable enemy free attack using a held melee weapon or the separately verified natural Punch/Kick option. No weapon is added to inventory or drawn for free. The enemy’s ordinary actions are not charged. Actual player armor, if needed, is requested through the existing armor attachment workflow. Player damage, conditions, ammunition and equipment remain player-managed; existing push consequences are not applied again.

After ordinary movement, weapon preparation, legal attack-type selection, rolling, pushing, attaching and Sending continue through Phase 6.3 unchanged. Main chat contains narration and compact references; detailed dice remain in Recent Dice Rolls and the existing audit. Older unbound rolls cannot acquire new pre-roll decisions by moving or attaching later.

## Narration and persistence

The canonical action audit records actor, target, range transition, weapon, actual action slot, source references and sequence relative to attacks. `combatHistory` projects those records alongside the existing dice/attack history; there is no second pending-action store. Movement, Draw, Ready/Load and turn facts use fixed verified narration, interleaved with attack events in execution order. The model can add permitted attack atmosphere but cannot replace action facts with a different weapon, free drop or unrecorded movement. Ordinary conversation and attack beats are also guarded against completing unsupported movement/handling.

Command receipts commit mechanics before narration. Replay cannot repeat a Run, Draw, shot, free attack, armor result, turn advancement or push effect. Reopening SQLite and refreshing the browser restore the same range, hand state, pending action and receipts. New fields are optional JSON additions; no migration or reset is required. Campaign date, hex, weather, journey state and player sheets are not moved or advanced by these combat actions.

## Verification

The baseline passed **329 unit tests and 96 actual-PDF integration tests** before these changes. The completed implementation adds ten unit tests and ten actual-PDF cases.

- `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`: **339 unit tests and 106 actual-PDF integration tests passed**, with zero failures or skipped tests. Both original PDFs were available and tested before and after the change. The required-fixture mode rejects missing books rather than reporting synthetic coverage as actual-source validation.
- **17 browser suites passed:** `test:combat-mobility`, `test:dice-chat`, `test:equipment-catalog`, `test:roll-timing`, `test:pending-encounter`, `test:encounter-fidelity`, `test:combat-narrative`, `test:combat-workflow`, `test:combat`, `test:dice-repair`, `test:roll-gm`, `test:submitted-attacks`, `test:action-safeguards`, `test:gm-situation`, `test:character-awareness`, `test:character-preparation` and `test:windows`. The nine combat suites import both actual books; older narrowly scoped suites retain their labeled synthetic fixtures where applicable.
- `npm run build` and `npm run typecheck`: passed, including a fresh production build after the development-browser checks.
- `git diff --check`: passed.

The new actual-source and browser cases cover the sword-only NEAR deadlock, initiative recovery, Run plus attack versus two Runs without attack, authoritative out-of-turn notices, saved range and weapon changes, explicit Sling/Broadsword Ready/Shoot/Draw sequencing, real sheet preparation/push/attachment/chat resolution, Retreat success and failure, an actual free attack followed by actual recorded armor, receipt replay, SQLite reopening, rough/blocked/unknown/LONG adjudication, public redaction and unchanged player mechanical state. Additional unit cases cover full hands without free drops, crossbow loading persistence, carried-sword Parry rejection, unsupported multi-opponent movement and source absence.

Tests run against isolated temporary databases with controlled provider responses and dice. They do not change the live campaign, require an API key or charge for model requests.

## Files changed

| Area | Files |
| --- | --- |
| Optional persisted types and saved-roll context | `src/lib/combat/mobility.ts`, `src/lib/combat/types.ts`, `src/lib/dice/schema.ts` |
| Original-source validation and shared action costs | `src/server/combat/mobility-rules.ts`, `src/server/combat/action-economy.ts` |
| Movement, held weapons and bounded enemy choices | `src/server/combat/movement.ts`, `src/server/combat/enemy-choices.ts`, `src/server/combat/loadout.ts`, `src/server/combat/engine.ts` |
| Natural commands, initiative progression, stable receipts and player responses | `src/server/combat/service.ts`, `src/server/combat/orchestrator.ts`, `src/server/combat/workflow.ts`, `src/server/dice/service.ts` |
| Authoritative narration, history and public projection | `src/server/combat/narrative.ts`, `src/server/combat/conversation.ts`, `src/server/combat/history.ts`, `src/server/combat/store.ts` |
| Existing combat companion display | `src/components/combat-panel.tsx` |
| New unit, actual-PDF and browser regressions | `tests/combat-mobility.test.ts`, `tests/combat-mobility-real.ts`, `tests/combat-mobility-browser.cjs` |
| Existing tests updated for recorded movement and turn-ending alternatives | `tests/combat-real.ts`, `tests/combat.test.ts`, `tests/roll-timing.test.ts`, `tests/roll-timing-browser.cjs` |
| Commands and documentation | `package.json`, `README.md`, `docs/combat-movement-tactics.md` |

No new dependency, database migration, authentication mechanism or campaign-data rewrite is required.

## Preview and remaining limits

Restart/reload the updated app. Start a one-on-one fight against **a sword-armed bandit at NEAR**, or explicitly use **a bandit armed with a sling and sword**. NPC movement/weapon preparation proceeds automatically when its initiative comes up. Combat shows current range and held weapons. After the enemy completes its turn, open Edrus through The Party and use the existing prepare → roll/push → attach → Send flow.

This phase does not implement a full zone graph, automated rough-ground Move rolls, blocked-border traversal, crawling, fleeing, mounted movement, Charge/talent maneuvers, voluntary Drop/Stow, or general monster movement tactics. Unsupported circumstances are identified rather than approximated. There is no new authentication, automatic player equipment enforcement or general-purpose planning AI. Player statistics remain player-managed apart from existing dice-push consequences; verified enemy damage continues through the existing engine. Tests use controlled providers and dice; they establish the mechanical/narration contract rather than production-model prose quality. No paid API calls were made; licensed source files remain private and uncommitted.
