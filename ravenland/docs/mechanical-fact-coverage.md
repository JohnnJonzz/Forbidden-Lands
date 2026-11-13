# Mechanical fact coverage and equipment PDF retrieval

## Root cause demonstrated

The exact request was run through the pre-change production retrieval functions against an isolated SQLite index containing an authorized handbook table and a four-section curated combat overview. Its plan was:

- `sourcePreference: any`, no requested source title;
- combat requirements for ranged attacks, action economy, range modifiers and general damage;
- no requirement for Longbow's own row or numerical Damage rating.

All four context slots were filled by the overview's Ranged Attacks, Combat Actions, Range and Damage sections. The PDF table was indexed/searchable but did not enter the final context. The source parser recognized explicit PDF phrasing but missed **“According to … Player's Handbook …” without the literal word PDF**. Lexical procedure coverage then incorrectly stood in for specific equipment facts. An ordinary free-form model response was not checked against individual numerical inputs.

This reproduces the reported **selection/routing** defect. It does not prove the live handbook has been extracted correctly: this workspace has no persisted campaign database, and the earlier handbook attachment still cannot be resolved. The real fifth-printing source/chunk IDs, table extraction, pagination and deployed records remain unverified. No speculative live indexing repair was made.

## Changes

The existing planner, FTS methods, bounded retry and section selection remain in use. A small equipment-reference profile now identifies:

- named supported ranged weapon subjects;
- requested Gear Bonus, Damage and Range fields;
- successes supplied by the question;
- the source-supported hit threshold and extra-success damage increment when calculating;
- unresolved explicit talent/artifact/modifier requests and relevant scoped house overrides.

These are separate fact requirements, not generic combat-overview requirements. An ordered equipment table must contain its column labels and the exact named row. Explicit labeled entries such as `Weapon: Damage …` are also supported. Each accepted value carries its actual document/chunk ID, physical page, row/header excerpt and source kind. A title, tag, prose mention, general combat section or character-sheet preset cannot supply a verified official rating.

“According to … Handbook”, including the Forbidden Lands title prefix, now binds the explicitly requested authorized PDF even without the word PDF. Named-source constraints survive initial searches, targeted retry, ranking and final selection. A missing/private/unindexed named source produces missing facts; curated material is not silently substituted as verification of that PDF. Existing player visibility/category checks remain unchanged. Gameplay declarations retain the normal proposed-action path and do not gain permission to ignore applicable house rules.

Missing or limited fact requirements use the existing **single targeted retry**, with the same final section/token budget. Fact-bearing passages are selected before peripheral overviews. Equipment-reference filler is restricted to passages that contribute required facts or verification; it cannot refill the packet with unrelated combat architecture. Multiple necessary table/rule sections from one document remain allowed. Deduplication now preserves passages with different recognized fact values, so two editions' conflicting ratings cannot be hidden as near-duplicate text.

## Grounded answer and scope

Supported read-only equipment questions use an **application-generated reference answer**, rather than delegating numerical inputs back to free-form generation. It displays only values extracted from the selected authorized PDF or an explicitly applicable, parseable campaign house rule. Curated summaries remain searchable interpretation aids, but are not used alone to certify official numerical weapon inputs.

The narrow arithmetic helper requires evidence for the weapon's Damage rating, the hit threshold and the extra-success increment. It subtracts the evidenced hit threshold from the user's stated success count and applies the evidenced increment. No Longbow rating, hardcoded extra-success damage constant, character-sheet weapon preset or runtime answer hint supplies these values. A mutation regression changes the source Damage rating and checks that the result changes accordingly.

The answer states its assumption: all remaining successes are spent increasing damage, before armor, without other modifiers/talents. Explicit unsupported modifiers/stunts withhold the numerical result instead of silently applying or ignoring them. Attack-skill evidence is separately exposed when present; no attack pool is assembled because these questions already supply successes. A roll or character action is never executed.

Missing Damage, an unsupported/reordered table layout, an absent/negated hit or damage rule, conflicting source values or an unresolved applicable house exception produces an **unverified** result. A known general formula can still be explained, but no missing numerical rating is guessed. Ordinary scoped house rules precede baseline ratings; an unparseable relevant override prevents silent fallback. Explicit official-book reference questions answer that baseline without applying campaign exceptions, and do not authorize actual gameplay changes.

This is not a combat execution engine, canonical equipment registry or general rules interpreter. It changes no attributes, inventory, dice, armor, location, clock, quarter-day or journal. Normal chat/request records still persist through existing idempotency controls. Unsupported/non-reference gameplay keeps its existing AI/proposal workflow. No paid AI call is needed for the supported equipment-reference answers; general GM personality/instructions were not rewritten.

## Actual passages retrieved in integration tests

Tests upload an actual generated PDF through `SourcebookLibrary.upload`, run the real extraction worker, persist real chunks/FTS postings, close/reopen SQLite, and issue the runtime questions without answers in their prompts. The selected excerpts are:

**Synthetic handbook fixture, physical PDF page 2:**

```text
103
RANGED WEAPONS
Weapon Gear Bonus Damage Range
Longbow +2 1 Long
Heavy Crossbow +1 4 Long
```

**Same fixture, physical PDF page 3:**

```text
RANGED ATTACKS
Ranged attacks use Marksmanship.
The first success hits.
Each additional success spent on damage increases damage by one.
```

The Longbow values match the facts supplied in the request. **The Heavy Crossbow values are deliberately synthetic test data, not a claim about the official handbook.** Neither this test's physical pages nor its footer labels establish the real book's pagination. No copyrighted book content, new curated rule summary or original handbook PDF was committed.

| Runtime question | Retrieved evidence and checked final response |
| --- | --- |
| Longbow Gear Bonus, Damage, Range | Exact table row; +2, 1, Long |
| Longbow damage with three successes | Row plus hit/extra-success rule; `1 + 2 × 1 = 3` before armor |
| Heavy Crossbow Damage | Exact row; 4 **in this synthetic fixture only** |
| Compare Longbow and Heavy Crossbow | Both exact rows, with separate field-level evidence |
| Explain extra-success ranged damage | The actual retrieved hit threshold and extra-success rule |

The real `AIService` final responses are asserted, with a provider that throws if asked to invent an answer. The browser test likewise verifies real upload/index endpoints, authorized diagnostics, cited final chat values/result, refusal after GM-only reclassification and **zero provider calls**. This is not a mocked-retrieval test or correct-stat injection into a model prompt. It does not establish live-model accuracy for unrelated questions or live-book extraction.

Nine new integration tests cover the five questions, exact named-source preservation, field citations and unchanged state/IDs across restart, no hardcoded ratings (changing source Damage to 4 produces 6), missing/malformed evidence, GM-only exclusion and saved-context revalidation, scoped house overrides and unresolved exceptions, conflicting editions/dedup preservation, explicit modifier uncertainty, and a genuine FTS candidate-limit miss recovered by the bounded targeted retry. All numerical weapon fields are checked against the selected source excerpt, not merely a source title.

## Verify the real persisted book

On the machine that holds the campaign database and private sourcebook files, from `ravenland/`:

```bash
npm run sourcebooks:diagnose -- --mode equipment
```

The existing read-only audit auto-selects the active campaign and one unambiguous public handbook. Optional `--database`, `--campaign`, `--source` and `--sourcebook-dir` overrides remain available (see the handbook diagnostic documentation). It does not create/migrate a database, reindex, reclassify sources, modify records or call OpenAI.

Equipment mode reports source processing/file accessibility, stored-chunk versus actual FTS posting counts, direct Longbow/Heavy Crossbow/table/rule search hits, table/rule evidence found in stored chunks and re-extracted file pages, selected document/chunk IDs, source constraints, missing facts, arithmetic evidence and query/selection trace. Numeric footer/PDF labels are evidence for inspection, not an assumed printed-page offset. Index scans are capped at 2,000 chunks and evidence output at 30 items per side; truncation is reported. Private/ineligible source metadata remains concealed.

In the authorized application diagnostics, repeat the exact reproduction and inspect `planner.plan.weaponFacts`, `planner.coverage`, `mechanicalFacts`, bound PDF IDs/searches and selected sections. Confirm that the source row is actually present and all numerical inputs point to its IDs/excerpts. The printed-page-103 reference must not silently become physical page 103. If file evidence exists but FTS hits/postings do not, investigate the real indexing state before using the existing authorized reindex control.

## Files and verification

- `src/lib/rules/weapon-request.ts`, `mechanical-facts.ts`: request/types with no built-in ratings.
- Existing `planner.ts`, `source-request.ts`: equipment fact requirements and bibliographic source binding.
- `src/server/sourcebooks/mechanical-facts.ts`: conservative evidence readers, field conflicts/overrides, read-only arithmetic/reference answer.
- Existing planner evidence/selection/retrieval: fact coverage, bounded missing-fact retry, distinct-evidence preservation, facts assembly and public revalidation.
- Existing `AIService`: equipment-reference response branch; ordinary workflows unchanged.
- Existing sourcebook types and GM diagnostic route: fact values, excerpts, status and provenance.
- `diagnose-equipment.ts` and existing diagnostic CLI: actual file/index audit mode.
- `tests/mechanical-facts.test.ts`, `mechanical-facts-browser.cjs`, package script and this documentation.

```bash
npm test
npm run typecheck
npm run build
npm run test:mechanical-facts
npm run test:handbook-pdf
npm run test:sourcebooks
npm run test:retrieval-planner
npm run test:rules-metadata
npm run test:ai
npm run test:ai-diagnostics
npm run test:persistence
```

No migration or dependency was added. Rules Library metadata/grouping, official/house visibility, existing citation IDs and campaign mechanics remain intact. Remaining limits: actual live handbook extraction is unverified; supported weapon-name vocabulary is bows/crossbows, supported fields are Gear Bonus/Damage/Range, and the parser intentionally declines unfamiliar/ambiguous layouts or rule wording. It does not resolve arbitrary talents, ammunition, armor, other stunt allocations or complete attacks. Verified status means supported by selected text, not an independently certified edition or universal mechanical correctness. Supply the live read-only audit report to finish verifying the actual fifth-printing table and its source IDs/pagination.
