# Phase 6.5.1 — World actions and verified time

## Architectural gap

Phase 6.5 `propose_world_action` produced a user-confirmed consequence proposal. The generic `npc_intent` branch could only mark a consequence awaiting adjudication. Ordinary AI prose could nevertheless describe a completed search or elapsed round. There was no executor connecting that intention to a recorded world event and the injury clock. The elapsed-time narration guard also missed those claims.

The new path is: authorized scene → structured NPC decision → deterministic dispatcher → transaction/receipt → application-generated narration. Combat, dice, injuries, journey resolution and character sheets keep their existing owners. No live data repair, encounter replay, injury reroll or inventory migration runs on installation.

## Changed files

- `src/lib/world/schema.ts`: strict model intention, controller command, duration and event types.
- `src/server/world/context.ts`: authoritative concluded-scene projection, state fingerprint, privacy filtering, receipt/event projection and historical reconciliation detection.
- `src/server/world/dispatcher.ts`: single execution and validation boundary, transactional time and consequence updates.
- `src/server/world/turn.ts`: bounded GM decision loop and resumable step receipts.
- `src/server/ai/provider.ts`: official Responses API `world_decision` structured output under the protected GM Charter.
- `src/server/ai/service.ts`: run world decisions before ordinary aftermath narration; deterministic outcome text; workflow-version provenance.
- `src/server/consequences/service.ts`: participate in an existing transaction when called by the world dispatcher; standalone commands retain their transaction.
- `src/server/consequences/treatment.ts`: reject treatment by an NPC with a verified departure.
- `src/server/consequences/registry.ts`: urgent guidance does not imply a Broken character can arrange rescue or that the roster establishes presence.
- `src/server/consequences/narration.ts`: reject unsupported elapsed-time claims alongside unsupported theft/rescue claims.
- `src/app/api/world-actions/route.ts`: authorized context and controller adjudication/reconciliation; clients cannot submit NPC intentions directly.
- `src/components/world-action-panel.tsx` and `src/components/consequence-panel.tsx`: pending proposal, explicit duration ruling, historical reconciliation and event receipts beside unresolved consequences.
- `tests/fixtures/world-state.ts`, `tests/world-actions.test.ts`, `tests/world-actions-real.ts`, `tests/world-actions-browser.cjs`, `tests/real-sourcebooks.integration.ts`, `package.json`: isolated fixtures and checks.

## Typed interface

The model returns:

```ts
{
  action: {
    kind: 'observe' | 'search' | 'transfer' | 'move' | 'interact' | 'assist' | 'advance_time';
    actorId: string;
    targetId: string | null;
    itemRef: string | null;
    destination: 'near' | 'depart' | null;
    interaction: 'speak' | 'signal' | null;
    intent: string;
  } | null;
  boundary: string;
}
```

Strict schemas reject extra model fields such as success, damage, duration, equipment or authority. `intent` and `boundary` are untrusted reasoning/intent, never completed outcome prose. Boundary text cannot inject an event into the transcript.

Internal `propose` commands add campaign, acting player, scene, request ID and expected state. Browser commands are only `adjudicate` (approve/decline the exact saved proposal with a duration and reason) and `reconcile` (continue from saved state, leaving historical prose unverified).

Statuses include completed, awaiting player input, awaiting verified roll, awaiting adjudication and blocked. Existing injury-roll staging/attachment remains responsible for player rolls; this dispatcher does not fabricate a new generic roll resolver.

## Dispatcher responsibilities and supported actions

The dispatcher checks character authorization before replay, then uses `BEGIN IMMEDIATE`, compares fingerprints and validates the current scene. It rejects stale campaign position/clock, character/possession, encounter or consequence state. Active initiative belongs to the combat dispatcher.

Only present, capable enemy-side encounter NPCs with actual NPC records can be GM actors. Roster IDs, player-controlled companions, absent, withdrawn, Broken and departed actors are excluded. Targets come from the encounter, not the campaign roster. Player target helplessness uses the current sheet rather than an old encounter snapshot. Unknown NPC capabilities do not become invented equipment or skills.

| Intention | Initial support | Additional authorization |
| --- | --- | --- |
| Observe/inspect | Record observation of a present target or scene; no hidden discovery or precise elapsed duration is claimed | No confirmation for a GM-selected valid observation |
| Search | A present Broken person at recorded Arm access; no discovered or transferred item is invented | Trusted local controller adjudicates duration and established circumstances |
| Take/transfer | Verify a supplied authorized gear reference and owner; return a specific missing-custody/transfer capability | Cannot execute even if approved; inventory stays intact |
| Move/depart | Local move to Near, or departure from this concluded scene; projected from authoritative receipts | Trusted local ruling for access, uncertainty and duration; no travel or campaign-position mutation |
| Interact | Bounded speech/signal event; cannot establish agreement, persuasion success, captivity or a player decision | Trusted local duration/circumstance ruling |
| Assistance | Delegate to the existing NPC Healing procedure, using actual Empathy, skills, safe access, attempt/action limits and rules | Trusted local adjudication; unsupported access/eligibility produces a requirement, not a roll or rescue |
| Advance time | Explicit scene-duration event, checked against every active deadline | Trusted local duration/evidence ruling |

Search of containers/locations with no authoritative object model, contested theft, arbitrary movement, hazards, restraints, environmental physics, general environmental actors and NPC inventories remain unsupported. Missing actor/object/equipment/rule capabilities are not inferred from prose.

Hosted character grants allow normal GM-selected valid observations and intentions, but do not confer controller authority. This phase does not add a hosted GM role. Hosted players must use the trusted local controller for duration rulings and reconciliation. Existing player ownership and privacy boundaries still apply. Pending intent text and private possessions are not shared through the public world projection; hidden consequence details are not appended to public event narration.

## Time rules and evidence

No automatic one-round search duration is claimed. The private fifth-printing PDFs were unavailable during this implementation. A search described as “brief” has no verified duration. The controller can explicitly adjudicate an exact unit/amount, including an explicitly justified zero-time ruling. That reason is saved as evidence and identified as adjudication, never an official rule.

- `rounds`, `minutes`, `hours`, `days` are distinct recorded units. No fixed round-to-minute or hour/day conversion exists here.
- Every active deadline must have a known value, reconciled campaign clock and matching unit for positive elapsed time. Mixed deadline units require adjudication rather than conversion.
- Positive time with a lethal obligation requires the existing official consequence/Healing evidence checks. Missing or scoped-conflicting evidence yields a pending requirement without completing the action.
- `quarter_days` and `journey` requests return an explicit adapter requirement. Their existing submitted activity/travel workflows remain authoritative. World actions never advance the Day Tracker, journey, campaign date or quarter accidentally.
- The existing `nextConsequenceStep` evaluates a verified deadline after elapsed time is applied. Death is a result of that recorded procedure, never model wording. Treatment timing that would reach the deadline before completion is held for adjudication; no late Healing success is invented.

Action, any treatment roll, time, consequence notes and successful world receipt commit together. Unsupported requirements may have an intention receipt, but no elapsed amount or completed action. Receipt-write failures roll back all effects.

## Consequences, history and replay

World events are projections of the existing `consequence_commands.result_json.worldEvent` receipts. There is no new timeline table. Linked consequence notes reference event IDs; the UI projects those receipts. Events include campaign/scene, actor/target, intent, status, verified summary, elapsed duration, linked visible consequences, source/adjudication references and request/replay identity. Affected possessions remain empty because safe custody transfers are unsupported.

A partial observation/search leaves robbery aftermath open. Departure of the last present capable surviving NPC may close the source encounter's immediate aftermath. The separate lethal injury remains open until its own verified procedure resolves. NPC positions/departure are projected from receipts without rewriting the historical ended encounter or its original outcome.

Request IDs and fingerprints guard retries. Exact saved commands replay their original receipt before stale-state evaluation; changed inputs with the same ID fail. New commands use a state fingerprint and SQLite write serialization. A proposal can be adjudicated once. Completed observations/searches/moves cannot be repeated as new identical events in the same scene. A stale proposal can be declined against current state; it cannot be approved.

GM steps use `world:<chatRequestId>:<step>`; the complete turn also has a saved receipt. Each ordinary GM response permits at most three decisions, rereads authoritative context between steps and stops at pending player input, a required roll, adjudication, boundary, departure, treatment/time result or budget exhaustion. A failed later step can resume without rechoosing an earlier committed step. Free-form narration is not called for these consequential aftermath results: application-generated text reports only the receipts and current urgent guidance. The existing narrator remains in use for its other supported flows.

Historical completed GM turns without world-workflow provenance cause reconciliation before new NPC progression. Reconciliation records that old prose is unverified; it cannot backdate actions or clocks. New workflow turns carry explicit provenance and do not trigger repeated historical review.

## Automated validation

Commands (run from `ravenland/`):

```sh
npm run typecheck
npm test
npm run test:world-actions
npm run test:world-actions:browser
npm run test:real-sourcebooks
npm run build
```

Recorded validation: typecheck PASS; full unit/regression suite **416 passed**; dedicated world suite **18 passed**; isolated browser adjudication/refresh/restart/client-rejection check PASS; production build PASS. The required real-sourcebook command is **BLOCKED** (missing both private PDF fixtures); the optional runner reports SKIPPED. No live-model verification was performed.

The world unit suite exercises the equivalent saved four-round/zero-elapsed Edrus state, actual membership, current Broken state, access, forbidden player control, item-transfer refusal, unsupported duration/unit routing, deadline progression/expiry, partial aftermath, departure, authorization/privacy, historical review, stale/concurrent requests, receipt-write rollback, GM reply failure, replay and SQLite reopen. The browser suite uses a separate temporary SQLite file and controlled synthetic adapter evidence to verify adjudication controls, exactly one round, unchanged inventory, refresh, restart and client intention rejection. No paid model calls occur.

`world-actions-real.ts` is wired into the existing real-sourcebook integration runner after actual PDF indexing. It checks the real slashing-64 lethal obligation and governs an isolated, explicitly adjudicated one-round search with original deadline evidence and replay. It does **not** claim the book supplies the search duration. The real-sourcebook suite is SKIPPED/BLOCKED until both licensed private fifth-printing fixtures are available. Synthetic evidence is not real-sourcebook verification. See `tests/fixtures/private-sourcebooks/README.md` for fixture setup and the required pre-merge command.

## Manual live-model smoke test — not run during implementation

Use the existing Edrus campaign without recreating the encounter or rolling anything again. Keep its current database backup through the existing workflow before intentionally changing live state.

1. **Observational:** Open the existing campaign and unresolved situations. Verify original critical D66 64, Slit Throat, saved four-round deadline, zero verified elapsed rounds, Broken sheet, concluded encounter, surviving bandit and unresolved robbery aftermath. Verify no companion/healer is established. A refresh must preserve those facts. Opening the new world projection itself does not execute an action.
2. **Observational request, transcript changes only:** Ask “What happens next?” The historical-review message should appear for unreceipted past narration. It must not replay the old search, steal possessions or advance the deadline.
3. **Changes a reconciliation receipt only:** Through trusted local play, use **Reconcile historical NPC narration** and explicitly state that historical search prose remains unverified and continuation begins from the saved zero-elapsed state. This does not complete that search or advance time.
4. **May create a new supported world event or pending intention:** Send an ordinary continuation message. With the existing live provider configured, inspect whether it independently selects a plausible bandit action from the established robbery context. The model should not require you to script the search. A search with no established duration must remain pending adjudication; zero rounds still elapsed. A harmless observation may be recorded before that boundary.
5. **State-changing optional adjudication:** Review the exact pending action. Approve only a duration/circumstance ruling you intend to establish. For an explicit one-round ruling, the search receipt and injury elapsed value must change together to one elapsed round, three remaining. Search completion alone must not remove a possession or resolve the injury/entire robbery aftermath. A transfer request must report the missing safe transfer capability.
6. **Observational:** Verify event summary, saved duration and visible urgent deadline agree. Refresh and restart the server; confirm the same receipt and elapsed value remain. Inspect unchanged inventory and Broken condition.
7. **Replay, no additional effects:** Resubmit the exact captured action command with its original request ID/payload, or retry the original GM request. It must replay the saved receipt. Do not create a new request ID to simulate a retry. Check that no second round or duplicated event appears.
8. **Stop before irreversible outcomes:** Do not advance to the lethal deadline, authorize treatment, create a rescuer or depart/transfer possessions merely to complete this smoke test. Any later approved departure or time event intentionally changes the live situation and must be reviewed as such.

The implementation did not run these live mutations or make a live-model call.
