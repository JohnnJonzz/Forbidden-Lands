# Preserving player-supplied attack inputs

Verified November 9, 2026 (America/Chicago), starting from `0a33b21`.

## Traced cause

The chat client sends its trimmed action text, the GM route validates it, and `AIService` passes that action directly to `retrieveRules`. The request schema does not substitute counts. The old `weaponRequest` extractor used the first numbered `success` phrase anywhere in the action. It did not identify whether that number described a rolled result, a rule threshold or an allocation. The planner, validator and formatter then faithfully reused that incorrectly selected input.

With the real Handbook indexed in an isolated database, this threshold-first question reproduced the reported numerical reply:

> An ordinary ranged attack requires one success to hit. A character fires a Longbow and rolls three successes. How much damage before armor?

| Stage | Before | After |
| --- | --- | --- |
| Original request / schema | Text unchanged, explicitly reports three | Text unchanged |
| Input extraction | `successes = 1` (first matching phrase) | `attackSuccesses = 3`; threshold mention excluded |
| Planner | 1 | 3 |
| Validated player input | 1 | 3 |
| Official hit requirement | 1 | 1 |
| Additional successes | 0 | 2 |
| Damage calculation / final reply | `1 + 0 × 1 = 1` | `1 + 2 × 1 = 3` |

**The exact quoted question did not reproduce the 1-damage response in this checkout.** Its original extraction/planner/validated input stayed 3, but the literal phrase “no other modifiers” triggered the positive modifier guard and withheld numerical verification. This separate, demonstrated defect is also repaired: explicit absence of modifiers is recognized, while an affirmative talent/modifier request still blocks unsupported calculation. Without the failing live request snapshot, the precise reason that exact wording produced 1 in the user's running instance is not established. No live campaign database was attached or changed for this investigation.

The partial-allocation example exposed another concrete defect: the old helper retained three rolled successes but spent all two additional successes, ignoring the explicitly allocated one. Its final answer was 3 damage instead of 2. The new extraction separates those roles and the final calculation uses the allocation actually supplied.

## Values and implementation

| Meaning | Canonical existing/new representation | Exact regression value |
| --- | --- | ---: |
| Rolled attack successes | `request.attackSuccesses` | 3 |
| Required successes | Evidenced `firstHit.value` | 1 |
| Available additional successes | `calculation.additionalSuccesses` | 2 |
| Additional successes allocated to damage | `calculation.damageSuccesses` | 2 |
| Base weapon Damage | `weapons[0].fields.damage.value` | 1 |
| Total damage | `calculation.damage` | 3 |

`attack-inputs.ts` extracts reported totals independently of required/extra-success phrases, recognizes words/digits and reported sixes, and records ambiguous input rather than choosing a default. An explicitly supplied allocation of zero remains zero. Allocation cannot exceed available additional successes and is never silently clamped. When allocation is unspecified, the existing all-additional-successes assumption is stated in the answer. Partial allocations state how many of the available successes were spent.

The old ambiguous `successes` field is replaced for new reference requests, not duplicated. Read-only compatibility accepts that field in historical saved retrieval snapshots, retains its supplied value, and returns the new representation without updating saved records. An explicit null in the new field never falls back to a legacy number. Required successes always come from source evidence; they are never used as a fallback for rolled successes.

Bare reports such as “I rolled three sixes” retain the supplied count and ask which weapon to use. With explicit weapon context, the same wording produces the evidence-grounded calculation. Missing/conflicting totals, unclear allocations and overspending return clarification or an unverified answer. Existing gameplay declarations retain their ordinary classification; no roll, movement or other mechanical state change is executed.

The mechanical evidence checks, official source permissions, house-rule precedence, bounded retrieval, citations and rule constants are unchanged. The actual Handbook still supplies Damage from physical p.107, the extra-success rule/attack-roll link from p.102, and the ordinary success threshold from p.46. Player totals and allocations come from the original player message, not those passages. The final application answer and streamed text use these distinct values without an AI model call.

## Executed tests

Both actual fifth-printing attachments were readable in `/tmp/ravenland-private-sourcebooks/` and tested before and after:

- `Forbidden_Lands_Players_Handbook_5th_printing.pdf`: 212 extracted pages, 243 chunks / FTS postings.
- `Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf`: 268 extracted pages, 373 chunks / postings; remains GM Only in the isolated fixture.

Before the change, `test:real-sourcebooks:required` passed its existing **16 TAP tests**, which did not exercise the newly reported wording or partial allocations. A separate real-file trace established the before-values above. After the change, `test:retrieval-check` passed **147 unit/synthetic tests** and **18 real-PDF subtests plus their parent (19 TAP tests)**.

The extended real suite verifies Longbow 0/1/2/3/4 successes against final streamed replies; the exact quoted question; word/digit/sixes forms; partial and zero allocation; threshold-first wording; missing/ambiguous counts; overspending; bare-report clarification; and Heavy Crossbow statistics through its final answer. Each verified calculation retains the real source citations. It checks original saved request text, planner input, validated input, saved request context, streamed reply and final narration, not just the input parser. Synthetic tests additionally verify legacy snapshot compatibility and source-rating/threshold mutations. Expected values exist only in assertions, not runtime prompts or source injection.

TypeScript, the production build and the `test:mechanical-facts`, `test:retrieval-planner`, `test:handbook-pdf` and `test:ai` browser suites passed. The mechanical browser test includes the exact question and partial-allocation answer in the real chat UI. Browser suites use synthetic sources/controlled providers; they are separate from the actual-book integration results. No paid API calls are made.

Tests use disposable SQLite databases and private file copies. Campaign mechanics, characters, Journal/Day Tracker and source permissions are checked unchanged. Only ordinary chat/request records are created in those temporary databases. No sourcebook, extracted source body, private database or credentials are committed. Historical saved replies are preserved; submit a new question to obtain a recomputed answer.

Run from `ravenland/`:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:real-sourcebooks:required
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

Required checks fail if the private books are absent. The parser is deliberately bounded vocabulary matching, not exhaustive natural-language understanding; unsupported or ambiguous input should be clarified rather than assumed. No paid/live-model quality evaluation or live-library audit was performed.

Changed files: `src/lib/rules/attack-inputs.ts`, `weapon-request.ts`, `planner.ts`, `mechanical-facts.ts`; `src/server/sourcebooks/mechanical-facts.ts`; `tests/attack-inputs.test.ts`, `mechanical-facts.test.ts`, `mechanical-facts-browser.cjs`, `real-sourcebooks.integration.ts`, `fixtures/attack-input-cases.ts`; this report and the application README. No database migration, rule-text rewrite, general GM instruction change or new dependency is required.
