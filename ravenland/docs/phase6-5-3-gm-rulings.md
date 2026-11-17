# Phase 6.5.3 — AI GM ruling authority

Routine NPC observation and bounded speech can proceed through the actual AI workflow without a human approval click. Mechanical effects still use existing dispatchers. Protected decisions require the trusted local controller; hosted character credentials do not create a GM role. No live Edrus campaign was opened for mutation or advanced during development.

## 1. Confirmed root causes

| Defect | Previous cause | Repair |
| --- | --- | --- |
| Unauthorized weather ruling | Journey POST parsed and executed without the controller check used by protected operations. | Shared mutation gate, route check, and operation-specific campaign/character authorization. |
| Only selected deadline advanced | Consequence `elapsed` incremented the selected record directly. | One scene-scoped time event processes all applicable deadlines atomically. |
| Adjudication hold disappeared | Synchronization recomputed status from mechanics; the question existed only in notes. | Structured SQLite ruling records overlay the computed procedure until resolved or invalidated. |
| Healing approval did not unblock treatment | World duration approval could not interpret a scoped Healing house rule. | A distinct `healing_rule` effect names the injury and exact current rule IDs/revisions; official evidence remains required. |

`tests/ruling-defects.test.ts` reproduced all four failures before repair. The original run showed unauthenticated weather accepted, elapsed values `[0,1]` for two applicable deadlines, `awaiting_adjudication` replaced by `awaiting_input`, and no matching Healing interpretation pathway. All four pass after repair.

## 2. Ruling schema and authority

`src/lib/rulings/schema.ts` defines strict inputs and persisted records: stable ID, campaign/scene, origin/consequence, question, facts, sources, decision/reason, scope key/fingerprint, maker, authority, effects, risk, status/history, request ID and application receipt. Migration 018 adds `gm_rulings` and per-campaign `gm_policy`; consequences and existing command receipts remain authoritative.

Statuses distinguish proposed, accepted, applied, awaiting review, rejected, superseded and invalidated. Acceptance alone does not establish a completed world event. Reusing a request with changed inputs fails; exact replay returns its saved receipt.

* **A:** verified NPC observations, bounded speech/signals. No invented roll, possession change, player choice or precise elapsed interval.
* **B:** supported search accessibility within verified scene facts. This is a narrow implemented allowlist, not a general modifier or arbitrary mechanical-ruling facility. Consequential duration still needs the time adapter and authorization.
* **C:** scoped house-rule interpretation, precise unsupported time/conversions, scene-access confirmation and consequence review require the trusted local controller. Unsupported inventory transfer, rule replacement and irreversible effects remain held.

AI permits are private in-process objects tied to a running persisted AI request and its character. Client JSON, role fields and actor IDs cannot mint them. `RAVENLAND_AI_RULINGS=enabled` enables the bounded policy (also the default when unset); another nonempty value disables it. Campaign policy can also disable routine rulings. AI authority cannot grant human controller authority.

## 3. Files changed

| Area | Main files |
| --- | --- |
| Contract/persistence | `src/lib/rulings/schema.ts`, `src/server/migrations/018_gm_rulings.sql`, `src/server/rulings/store.ts` |
| Policy/resolution | `src/server/rulings/{ai-policy,review-permit,world-holds,service}.ts` |
| API/UI | `src/app/api/rulings/route.ts`, `src/components/ruling-panel.tsx`, consequence/world panels |
| Time | `src/server/time/service.ts`, consequence registry/service, world dispatcher, journey service, SQLite update boundary |
| NPC pipeline | `src/server/world/{context,dispatcher,turn}.ts`, world schema, AI provider instructions |
| Authorization | `src/server/mutation-authority.ts`, `src/proxy.ts`, mutating route guards and ownership checks |
| Healing | `src/server/consequences/{rules,treatment}.ts` |
| Verification | `tests/{ruling-defects,gm-rulings}.test.ts`, `tests/gm-rulings-browser.cjs`, controlled provider fixture, actual-PDF world-action integration extension |
| Existing regressions/config | migration-count assertions, fresh-request chooser assertions, unsupported transfer assertion, package scripts, `.env.example` |

## 4–5. Shared elapsed time and multiple deadlines

`advanceTime` records a `time:<eventId>` receipt in existing `consequence_commands`, including source, authority, scene/unit, amount, affected references, elapsed before/after, deadline values, resolution and observed round. It validates first, updates applicable records and writes its receipt in the caller's transaction, or owns an atomic transaction itself. Failed writes roll back all affected deadlines.

Supported callers are approved world durations, consequence elapsed controls, combat round observations and campaign calendar changes (including journey quarter progression). Cosmetic timestamps do not create time events. Calendar changes with no encounter use an explicit campaign calendar anchor. Known journey counts record native quarter-days; arbitrary date corrections record clock-review events without asserting elapsed time.

Only deadlines tied to the event's source scene clock are eligible. Equal units advance together; unrelated scenes are untouched. Combat observations calculate each deadline's delta from its own observed start round, and repeated observations do not charge again. Active combat rejects manual round charging outside its owner. Treatments resolved during the same elapsed event can still receive their actual elapsed receipt without reopening the injury.

Different units create specific conversion questions. No implicit rounds/minutes/hours/quarter-day conversion is assumed. An authorized conversion must name the original persisted event, the exact deadline and its native unit. The existing source-backed expiry procedure determines a lethal result; narrative never does.

## 6. Persistent holds

Synchronization overlays open structured questions onto the consequence procedure instead of replacing them. Exact question, reason, authority, evidence, scope, resolution types and history survive refresh, SQLite reopening and server restart. Existing explicit adjudication statuses are imported conservatively as review questions without parsing prose into elapsed time.

A failed duration approval updates its original question and preserves the pending intention. It does not manufacture an endless chain of new pending approvals. Wrong-domain effects and stale revisions/scopes fail. Required rule/source/conversion questions cannot be erased by rejecting a generic question. Verified restoration, departure, death or changed supporting facts can invalidate the corresponding question where appropriate.

## 7. House rules

Healing conflicts produce `healing_rule` questions with exact current applicable rule IDs and revisions. The local controller may explicitly select the official procedure **for that injury only**, giving a reason. All named conflicts must match; unrelated rules and stale versions are rejected. The interpretation verifies official treatment evidence transactionally before committing and records its citations. It does not edit the house-rule document, injury, recorded roll, deadline or patient sheet. Later treatment still performs its normal evidence, pool, access and roll checks.

Changing a rule invalidates the old interpretation; new scope requires new review. A duration decision cannot substitute for this interpretation. Missing official evidence remains blocked until restoration; no generic sourcebook bypass is provided.

## 8. NPC integration and scoped reuse

The world dispatcher first checks the authoritative scene, surviving present NPC, target and access. Only then can the real AI workflow request its bounded ruling. The scope includes actor/target snapshots, possession reference, encounter/location/range, character sheet, deadline state, calendar and house-rule revisions. Equivalent current scope reuses the applied ruling; material changes invalidate it.

Supported speech can complete and consume its matching old pending speech intention without human approval. A separate search/transfer hold remains separate and does not block unrelated safe speech. Fresh continuation requests can select another supported action; exact request replay makes no provider call. Narration is grounded in completed events. Speech with no justified precise cost records no exact elapsed interval; this is not an assertion of a rule granting zero-round actions. A search may establish access while its consequential duration stays held. Inventory is never silently removed.

## 9. Mutation authorization audit

The Next proxy gates every mutating `/api` path by default. Individual mutating handlers also call the shared gate, then validate the capability appropriate to their operation. Retired `/api/map/travel` returns 410 without mutation.

| Routes/capability | Hosted behavior |
| --- | --- |
| GM chat, actions, world actions, dice, character/roll/combat preparation | Authenticated credentials plus actual campaign/character or roll ownership; protected suboperations require local controller. |
| Consequences/rulings | Own preparation allowed; manual time, adjudication, scene access and overrides require local controller. Ruling details for hosted players omit local facts/effects/history/source details. |
| Journey | Authenticated campaign request and owned character assignments allowed; manual weather/time/other controller operations denied. |
| Campaign full writes/import/select, map mutations, portraits/images, administrative encounters, recap/test-copy writes | Controller operations; ordinary hosted credentials denied. |
| Sourcebooks, compendium, AI instructions/memories/settings | Trusted local or the existing explicitly configured administrative review capability, with existing endpoint checks retained. That token is not a gameplay GM role. |
| Player-access connect/disconnect | Existing credential-validation flow; the bootstrap exception does not grant controller authority. |
| New unknown mutation routes | Denied by default unless deliberately classified. |

Forged role fields, campaign IDs and GM headers without the actual capability do not authorize mutations. This is an audit of mutation authority, not a redesign of every existing read endpoint or hosted account system.

## 10. Rules and source evidence

No new rulebook duration, difficulty modifier, roll result or time-unit conversion is invented. Existing official Healing, attempt-limit, self-treatment, action, untrained-skill and injury procedures still require retrieved source evidence. Synthetic passages used in isolated unit/browser tests exercise control flow only and are not evidence that actual fifth-printing retrieval succeeds.

**BLOCKED:** actual fifth-printing private PDF validation. Neither required private sourcebook is present in this workspace. Per `AGENTS.md`, this phase is not fully validated for merge until `npm run test:retrieval-check` passes with `RAVENLAND_REAL_SOURCEBOOK_DIR` configured. The actual-PDF integration was extended to cover scoped Healing interpretation and unchanged injury/time, but could not execute. Never commit the private books or extracted bodies.

## 11. Automated verification

The full unit/regression stage passed **448 tests, zero failures**. The targeted suite passed **20 tests**, including the four reproduced defects plus routine AI/no approval, policy disable, forged permits, scoped reuse/invalidation, exact replay, hosted denial, stale/wrong effect rejection, same-scene/mixed/individual clocks, rollback, calendar receipts, recoverable duration holds and legacy hold preservation. A further missing-evidence assertion in the Healing test also passes. The required actual-PDF stage then failed its fixture prerequisite with an explicit BLOCKED result; therefore `test:retrieval-check` as a whole is not green.

The new GM-ruling browser suite, prior world-action browser suite and post-combat routing browser suite passed. Production build, type checking and `git diff --check` passed. The final targeted rerun also covers restoration and repeated loss of source evidence: its original persistent question reopens instead of silently remaining invalidated. Browser coverage uses the actual main composer, dispatcher and SDK transport with a controlled response interceptor; unexpected model requests fail. It checks two deadlines, no theft/recovery, typed duration and Healing UI, refresh/replay/reopen/restart and hosted anonymous/forged-GM denial.

All automated data is temporary or in memory. No paid model call or live campaign mutation is needed. Run `npm run test:gm-rulings`, `npm run test:gm-rulings:browser`, `npm run test:retrieval-check`, `npm run typecheck` and `npm run build`.

## 12. Protected/unsupported boundaries

There is no generalized inventory-transfer adapter, arbitrary difficulty-modifier tool, global rule override, deadline-edit effect, replacement dice-result effect, hosted GM role or unrestricted AI tool runner. Such operations remain protected or explicitly unsupported. Named scene access can be confirmed by a local controller; a roster entry alone never proves a healer is present. Broad combat house-rule conflicts remain held. Sourcebook conflicts require verified restoration rather than a generic approval.

## 13. Optional manual Edrus smoke procedure — not executed

1. **Read-only:** on a backup/copy first, inspect Edrus Broken, Slit Throat 64, lethal four-round deadline with zero verified elapsed rounds, concluded combat, surviving Bandit 1, no established helper and existing historical reconciliation. Inspect sourcebook readiness and current pending/ruling records. Do not repair or retroactively count narration.
2. **Discretionary ruling and world mutation:** when deliberately ready to advance play, submit one fresh “Continue the story.” This is a live model request and may record a ruling, completed supported NPC action and narration. Inspect the actual event and ruling maker/scope. Ordinary observation/speech should not request controller approval. Do not expect a specific model choice.
3. **Mechanical boundary:** verify no possession, injury, sheet or exact deadline interval changed merely because of prose. A search may establish accessibility, but unsupported precise duration must remain a typed question. Theft requires a verified item and supported transfer mechanism; otherwise it stays held.
4. **Verified time:** only when intentionally approving actual passage, inspect the typed duration, native unit, source scene and all applicable deadlines. Submit once; verify the saved receipt and each before/after. Retry the exact request to verify replay, not a second interval. Do not use elapsed controls merely to test a live lethal deadline.
5. **Protected adjudication:** if a scoped Healing rule blocks a real chosen treatment, inspect its current rule IDs/revisions and source evidence. Only the trusted local controller may apply the matching injury-scoped interpretation. Hosted players retain the hold. Verify this alone grants no treatment success, helper, survival or extra time.
6. **Persistence:** refresh/reopen and inspect any unresolved question. Continue only on a fresh deliberate player request; do not repeatedly click to force an irreversible result. Preserve the live campaign's truth regardless of whether the next supported outcome is speech, a genuine player choice or a protected hold.
