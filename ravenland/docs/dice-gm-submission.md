# Submit saved dice to the GM

Implemented November 9, 2026 (America/Chicago).

## Player workflow

Run `npm run dev` from `ravenland/` and open the loopback application. Roll using the existing character sheet, then open **Recent Dice Rolls** and expand the result. Push in the sheet or the existing panel controls before submitting, if permitted. **Submit to GM** uses that roll's original character even if ACTING AS now names someone else.

For a still-pushable result, confirmation makes clear that submitting chooses the final version and ends pushing. A pushed roll needs no additional finalization step. **Finalize without GM** preserves the old independent `Submit Result` operation for players who want to archive a result without narration; that finalized result can still be submitted to the GM later.

The result remains in Recent Dice Rolls with its original/final faces, banes, saved damage/Willpower and timestamp. Delivery status distinguishes **Submitting to GM**, **Submitted to GM** and a failed request with **Retry GM submission**. Status restores after refresh and server restart. The existing Recent view still shows its latest twelve rolls; submission does not remove a roll.

The main conversation shows a compact roll reference and normal narration, never an expanded dice card. Existing expanded dice controls were moved into the Recent panel; the sheet roller and push calculations were not replaced.

## Existing infrastructure reused

- `Session.dice` / `PendingDice` already persist stable UUIDs, character IDs, initial/final faces, category metadata, push status, timestamps, weapon binding snapshots and saved/manual gear consequences in SQLite campaign JSON.
- `countSuccesses`, `baneCounts`, `canPush` and the existing dice command engine remain authoritative. Push consequences are applied by that engine when the player pushes, not when the GM receives the result.
- `AIService`, `/api/gm`, `useGM`, streaming, request leases, retries, usage records, memory retrieval and the campaign transport remain the delivery pipeline.
- `ai_requests` is the persistent submission receipt. Its existing payload, status and saved context store the roll association and verified packet. No second roll table, character model, migration or authentication system was added.
- Character context still uses the original rolling character and existing local/hosted access policy. Trusted local play requires no player token; hosted requests retain their existing campaign/character grants. Sourcebook access remains player-scoped and excludes GM-only material.

## Authoritative submission and validation

The client sends `kind: "roll"`, campaign ID, roll ID, rolling character ID, a snapshot fingerprint and the deterministic request ID. It does not send successes, faces, damage, targets or a new action. The strict command schema rejects fabricated success totals or client action/activity text.

Inside the existing claim transaction, the server loads the campaign's saved roll and checks identity, ownership, schema, original/final consistency, six-sided and artifact faces, the recomputed success total, locked push faces, recorded banes/consequence consistency and the expected fingerprint. Utility dice are verified separately. Missing, malformed, changed or mismatched records fail clearly instead of receiving invented values. The record is checked again before narration is committed.

The structured provider packet contains:

| Field | Source |
| --- | --- |
| Roll/character identity and timestamp | Saved roll and existing campaign character |
| Roll type and label | Saved skill/attack/armor/resource/D66 metadata |
| Initial and final dice, successes, push status | Verified saved record; successes recomputed on the server |
| Attribute/gear damage, applied/manual gear damage and Willpower gained | Existing push consequence fields; no reapplication |
| Action association or ambiguity | Existing prior action requests, using the matching process below |
| Optional success allocation | `null`; submission does not decide how extras are spent |
| State changes permitted | `false` |

Utility rolls have `successes: null` in the interpretation packet; a D66 or resource die is not a zero-success skill failure. Resource changes already recorded by the dice engine are not repeated. Weapon binding snapshots participate in stale detection but are not sent wholesale to the model. Recorded weapon metadata does not establish verified official damage statistics or permission to allocate successes.

## Pending action matching

Matching considers up to thirty prior completed ordinary GM action requests that existed before the roll's creation. Candidates must belong to the rolling character and be actual declarations according to the existing retrieval planner. Standard skill names, attack labels/weapon names and previously prepared skill bindings provide conservative compatibility signals. Ordinary questions and other characters' actions are excluded.

An action already associated with another submitted roll is not reused. Exactly one compatible unconsumed candidate is linked. Multiple candidates produce an **ambiguous** packet and a clarification request; none produces an **unmatched** packet and a question about the intended action. The server does not guess based on visual proximity in chat or invent action IDs. Retry retains the original association from saved request context.

The three most recent verified submitted-roll references for the authorized actor are also available in ordinary follow-up context. A player clarifying an ambiguous action need not roll again. This is a bounded compatibility heuristic over existing requests, not a new pending-combat execution system. Explicit clarification uses normal chat; it does not automatically rewrite an old match or adjudicate defenses, hits or damage.

## Interpretation and safety

The normal authorized rules retrieval pipeline receives a procedural query for the roll's skill/type. The verified roll is a separate input, so textual counts in an old declaration cannot replace its actual successes. This path does not ask the numerical weapon calculator to assume an allocation of extra successes; normal explicit rules/calculation questions keep that infrastructure unchanged.

The protected GM policy recognizes the result as completed dice, prohibits asking for a replacement when the match is valid, requires clarification for ambiguity, and forbids invented successes/modifiers/damage. It distinguishes armor and utility results from attacks. Narration must leave optional effect choices to the player. Missing rules evidence must remain uncertainty, not a guessed official ruling.

For submitted dice, application actions and memory proposals are suppressed server-side. The GM can narrate or ask a question, but cannot spend Willpower, consume provisions/ammunition, apply damage, change injuries/conditions, move the party or advance time. Existing campaign memory is still available for narration; ordinary chat, memory review and recap behavior remain unchanged.

Finalizing the dice, request/usage metadata and the intended compact reference/narration are the only new writes. Direct comparisons of the entire Session, excluding these expected message/finalization fields, verify that character values, inventory, supplies, clock, map position, Journal and journey state remain intact. Public request diagnostics redact submitted actor/roll context along with existing private character context.

## Duplicate prevention and retry

A deterministic campaign-plus-roll request UUID provides one logical request per roll. The server verifies that identifier, includes the roll/fingerprint in the existing request fingerprint, and claims it transactionally. Two clients cannot create independent narration requests for the same saved result. Completed retries replay the saved reply; a live attempt returns the existing in-progress error. Existing attempt leases prevent superseded attempts from committing a second reply.

Claiming finalizes the chosen roll before generation, preventing a subsequent push through normal dice controls. An upstream failure leaves that final record intact and exposes retry for the same ID, fingerprint and association. Push consequences are not rerun. Compact chat references are appended only with successful narration, so a failed first attempt cannot create duplicate references. Failed upstream attempts may require another provider call on explicit retry; this is logical/persistence idempotence, not a guarantee against upstream billing after a timeout.

## Tests actually executed

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Production build | Passed |
| Full unit/synthetic retrieval gate | 179 passed, 0 failed |
| New focused submission tests | 9 passed within the full suite |
| Actual sourcebook suite before changes | 21 TAP tests passed |
| Actual sourcebook suite after changes | 22 TAP tests passed, including the new submission case |
| `test:roll-gm` | Passed: token-free local UI, exact saved successes/actor, push before submission, no repeated consequences, duplicate replay, forged totals, multiple rolls, transient retry, compact chat, refresh and server restart |
| `test:windows` | Passed: character windows, sync, push and standalone finalization in the Recent panel |
| `test:dice-repair` | Passed: staging/pushing, locked faces, atomic consequences, iframe controls and Recent results |
| `test:ai` | Passed: SDK streaming, memory/canon, failure/retry, recap, in-flight sheets/pushes, journey proposals and usage |
| `test:character-preparation` | Passed: existing character authorization, advisory equipment, context, logout and restart |

The focused cases additionally cover stale/missing/corrupt records, simultaneous submissions, in-flight deletion and push, one/multiple/consumed pending actions, zero-success pushed outcomes and resource rolls without repeated provision reduction. The real-book submission test sends two verified successes through the actual retrieval/service path and asserts that the Handbook's physical page 102 reaches the provider, the private Guide does not, optional allocation stays `null`, and mechanics remain unchanged.

Both actual fifth-printing PDFs were available outside Git and tested: Handbook 212 pages / 243 chunks, Guide 268 pages / 373 chunks. Prior Longbow/Heavy Crossbow statistics, player-success preservation and mechanical calculations remain in the required suite. Browser tests use a controlled SDK provider and disposable databases; no paid/live-model narrative-quality test was run, and no live campaign was modified.

From `ravenland/`, run:

```bash
npm run typecheck
npm run build
npm run test:roll-gm
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

## Remaining limits and changed files

Legacy Ready/activity-bound rolls must be released before independent submission; the manual quarter-day workflow is not reconnected to automatic roll matching. Ambiguous/custom skills may require clarification. There is no autonomous combat resolution, target/defense adjudication or optional-success allocation. Initial roll generation retains the existing dice-system provenance; this phase verifies its saved record, not a new anti-cheat or signed-RNG protocol. Full hosted multiplayer authorization on legacy routes remains outside this task.

Submission receipts live in the existing AI tables: use the complete SQLite backup to preserve them. A public JSON import creates a new campaign and does not copy private AI request tables. The original submitted dice remain in their campaign; importing another campaign is a different narration scope.

| Purpose | Files relative to `ravenland/` |
| --- | --- |
| Shared fingerprints and status types | `src/lib/dice/gm-submission.ts` |
| Saved-record verification, matching and references | `src/server/dice/gm-submission.ts` |
| Existing GM pipeline integration | `src/lib/ai/schema.ts`, `src/server/ai/service.ts`, `src/server/ai/context.ts`, `src/server/ai/instructions-v1.ts`, `src/app/api/gm/route.ts` |
| Status and safe diagnostics | `src/app/api/gm/rolls/route.ts`, `src/app/api/ai/context/route.ts` |
| Player interface | `src/components/recent-dice-rolls.tsx`, `src/components/dice-card.tsx`, `src/components/campaign-app.tsx` |
| Verification | `tests/roll-gm.test.ts`, `tests/roll-gm-browser.cjs`, `tests/real-sourcebooks.integration.ts`, `tests/character-windows-browser.cjs`, `tests/ai-canon.test.ts`, `tests/fixtures/ai-provider-preload.mjs` |
| Commands and documentation | `package.json`, `README.md`, this report |
