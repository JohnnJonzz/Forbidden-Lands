# Resolving the ordinary ranged-attack hit threshold

Verified with the owner's actual fifth-printing PDFs on November 8, 2026 (America/Chicago). This follows the [real-PDF regression repair](real-sourcebook-regressions.md).

## Cause and repair

The threshold was present in the Handbook, but the old validator recognized only hit-specific wording inside a ranged-combat passage. The general skill-roll success rule is on physical PDF page 46 (printed 42); the Shoot instruction on physical page 102 (printed 98) establishes that a ranged attack uses a Marksmanship roll. The previous predicate could not combine those premises. It therefore withheld the calculation even with the correct weapon rating and extra-success rule.

The validator now accepts that combination only when **both passages are evidenced**. The numeric minimum is parsed from the general rule's text, including its definition of a six as a success, and the attack-roll link is separately cited. A general dice rule alone cannot establish an attack threshold. Existing explicit hit-threshold wording remains supported. This applies to supported ranged weapons generally; no Longbow-specific threshold or damage constant was introduced.

Selection checks the complete evidence packet before declaring threshold coverage. It first reuses available evidence. If the threshold remains missing, the existing single bounded retry uses `sixes succeed success action`; if the general rule is already present but its attack-roll link is absent, it searches `ranged attack roll marksmanship`. Both paths use the normal authorized source search, named-source constraints, chunk/token budgets, ranking, house-rule handling and final revalidation. There is no recursive retry or new model call. Optional duplicate skill-roll links do not fill the verified packet unnecessarily.

The exact requested question already finds the general rule among its initial candidates, so it requires **zero additional retrieval rounds** after the parser/coverage repair. A controlled initial-candidate omission test separately demonstrates successful recovery through exactly one targeted FTS query against the real Handbook. Missing indexed evidence still produces an unverified answer after that one attempt.

Zero successes are now recognized in words as well as digits. Once all required source inputs are verified, a count below the evidenced threshold produces a miss and zero damage, with no negative additional-success count. Numerical answers retain the existing assumption that all additional successes are spent on damage, before armor and without other modifiers or talents. This is a read-only reference calculation, not combat execution or resolution of defensive reactions.

## Actual sources and citations

Both private attachments were readable before and after the change:

| File | Physical pages extracted | Stored chunks / FTS postings |
| --- | ---: | ---: |
| `Forbidden_Lands_Players_Handbook_5th_printing.pdf` | 212 | 243 / 243 |
| `Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf` | 268 | 373 / 373 |

They remain outside Git at `/tmp/ravenland-private-sourcebooks/`. Tests use application upload/extraction/indexing, isolated SQLite/FTS databases and a fresh campaign; no curated summary supplies the official inputs. The Guide stays GM Only in the fixture and is excluded from player retrieval. No live library permission or campaign record is edited, and no copyrighted PDF or full extracted text is committed.

The final real-file run selected these Handbook passages for the exact question. The source ID was `4e2e613e-55c7-4820-b98b-8da84fb30254`; these are disposable **test IDs**, not live campaign IDs.

| Mechanical input | Physical PDF page | Observed printed label | Selected chunk ID |
| --- | ---: | ---: | --- |
| Longbow Damage 1 | 107 | 103 | `8e962820-657b-421b-af19-98d9a7c3e07e` |
| Extra-success increment 1 and Shoot skill-roll link | 102 | 98 | `bbf32ae8-a407-41dc-bb8d-909d94977261` |
| General success threshold 1 | 46 | 42 | `938d5dfa-9b04-4f96-aaa6-bcc2937bd5d2` |

Printed labels were checked against the original PDF metadata and numeric footers; citations still use physical PDF pages. Tests verify every mechanical quote belongs to a selected passage and the final application reply includes all three citations. No expected statistics or rule constants are supplied in runtime questions.

## Executed regressions

Before editing production code, `test:real-sourcebooks:required` ran both actual books: **10 TAP tests passed**. Its Longbow calculation was still unverified, reproducing the reported limitation rather than demonstrating a working calculation.

After the change, `test:retrieval-check` passed **144 unit/synthetic tests** and **15 real-file subtests plus their parent (16 TAP tests)**. The new real cases establish:

| Scenario | Result |
| --- | --- |
| Exact requested Longbow question, three successes | Verified `1 + 2 × 1 = 3` damage before armor; all source citations retained |
| Same question, one success | Verified 1 damage before armor |
| Same question, zero successes | Verified miss, 0 damage |
| Initial threshold candidate deliberately omitted | One targeted real FTS query retrieves physical page 46; verified 3 damage |
| Threshold page unavailable in the test index | Weapon rating and extra-success rule remain verified; threshold/calculation stay unverified after one retry |
| Heavy Crossbow, three successes | Same source-based threshold and procedure; verified 5 damage from its own retrieved rating |

The missing-evidence test removes only the threshold page's indexed chunks inside a savepoint in the disposable database, then rolls back. It models an incomplete authorized index; it does not claim that the rule is absent from the actual book. The targeted-recovery test filters that page only from initial search results, then permits the real targeted search. Neither test injects answer text or numerical source facts.

Additional unit checks change the source threshold to two and confirm calculations change for multiple weapons, reject a general rule without an attack-roll link, reject curated substitution, retain house-rule blocking, avoid unnecessary retrieval, and preserve campaign state. Existing synthetic regressions still cover conflicting official values, GM-only sources, explicit PDF constraints, rating mutations and unsupported modifiers.

TypeScript checks, the production build, and the existing `test:mechanical-facts`, `test:retrieval-planner`, `test:handbook-pdf` and `test:ai` browser suites also passed. These browser suites use synthetic fixtures and controlled providers; they are separate from real-PDF validation. Real reference replies use the application calculation path with a provider that throws if called, proving no paid API call is needed. Campaign mechanics, characters, Journal/Day Tracker and source permissions remain unchanged in the fixture; ordinary chat/request records exist only in its temporary database.

Run again from `ravenland/`:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:real-sourcebooks:required
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

Missing private books fail the required commands rather than substituting synthetic fixtures. Temporary indexed copies and databases are cleaned up; the original private input PDFs remain available for reuse. No paid/live-model accuracy test or live campaign database audit was performed. Unrecognized wording, missing attack-roll linkage, conflicting evidence, unresolved applicable house rules or insufficient context budgets still withhold verification.

Changed files: `src/lib/rules/{mechanical-facts,planner,weapon-request}.ts`; `src/server/sourcebooks/{mechanical-facts,planned-selection,planner-evidence,retrieval}.ts`; `tests/mechanical-facts.test.ts`, `tests/real-sourcebooks.integration.ts`; this report, the prior report's follow-up link, and the application/fixture READMEs. No migration, dependency, sourcebook rewrite or general GM instruction change is required.
