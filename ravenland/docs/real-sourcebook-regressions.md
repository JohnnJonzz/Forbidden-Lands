# Real fifth-printing PDF regression verification

Verified on 2026-11-08 using the owner's two attachments. Both were readable:

| Private input filename | Bytes | Extracted physical pages | Stored chunks / FTS postings |
| --- | ---: | ---: | ---: |
| `Forbidden_Lands_Players_Handbook_5th_printing.pdf` | 15,872,068 | 212 | 243 / 243 |
| `Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf` | 19,701,453 | 268 | 373 / 373 |

The attached books are in `/tmp/ravenland-private-sourcebooks/`, outside Git. The repository's private-fixture directory contains only setup instructions. Ignore rules protect both the fixture directory and canonical sourcebook filenames. No PDF, extracted source body, source-body snapshot or private SQLite database is committed. `/tmp` inputs must be supplied again after this workspace is replaced.

## Demonstrated defects and scope of repair

The baseline was commit `812abaa`; the preceding PDF reference repair was `40b5669`. Comparing these changes showed that the new equipment branch and fact predicates apply to weapon requests, while Hunter still follows the profession-entry path. With the actual attached Handbook, both the plain Hunter question and the explicit PDF/printed-page-25 question already selected the correct physical page 29 before this repair. **The reported Hunter failure did not reproduce here.** This does not establish the health of an unattached live library, its classifications, or its index.

Two other real-file failures did reproduce:

1. **Longbow evidence was rejected after candidate generation.** Extraction and raw FTS already contained physical page 107. The actual table has a Grip column between the weapon name and Bonus; the prior row parser expected Bonus immediately after the name. Its coverage check therefore rejected the correct table and final selection was empty. The existing ranged-damage predicate also missed the PDF's extracted success symbols (`x x`) and the wording that damage “increases by” the stated amount. Both are format-recognition defects, not missing PDF extraction or FTS postings.
2. **Named action coverage accepted the wrong pages.** Ready Weapon/Aim/Shoot definitions were present in raw FTS on physical pages 101–102, but broad combat/action requirements accepted contents/index keywords. Baseline final pages were 210, 107, 208 and 7, with no reported coverage gaps. The planner now requires the requested action definitions; the evidence predicate checks the real labeled Fast/Slow action format, and unrelated optional filler cannot displace that evidence. Final pages are 101 and 102. Only references naming multiple actions use this narrower packet; general shooting procedures and gameplay declarations retain their existing combat requirements, with unit assertions protecting that distinction.

The repair recognizes the observed table/symbol formats and tightens the demonstrated named-action selection defect. It adds no extraction feature, migration, reindex requirement, new mechanical execution, skill registry, curated-rule rewrite or AI personality change. Source permissions and citation behavior are unchanged. The fixes work against the already-indexed private diagnostic database as well as a fresh real-file import.

## Pipeline and raw FTS evidence

`tests/real-sourcebooks.integration.ts` uploads the original bytes through `SourcebookLibrary`, runs the application's `extractPDF` and normal chunk/FTS indexing, closes and reopens an isolated SQLite database, then invokes `retrieveRules`. There are **zero curated documents** in this fixture. The normal planner, source constraints, candidate ranking, coverage predicates, bounded targeted retry, context selection and citation generation all execute. A capture-only provider verifies real Hunter evidence reaches the `AIService` provider boundary; it makes no external AI request.

Direct player-scoped searches against the actual Handbook FTS index returned:

| Query | Hits returned | Physical pages, in returned order (first eight) |
| --- | ---: | --- |
| `Hunter` | 16 | 178, 6, 209, **29**, 26, 69, 64, 25 |
| `Longbow` | 2 | **107**, 192 |
| `Ready Weapon Aim Shoot` | 40 (limit) | **101, 102**, 91, 79, 211, 52, 83, 119 |
| `Fighter` | 22 | 65, 209, 6, 64, **28**, 211, 84, 68 |

Full-question raw searches also found the required entries: Hunter page 29 was seventh; Longbow ratings page 107 was first; Longbow damage page 107 was second; the action question returned pages 102 and 101 first. These raw rankings are not the final model context. Focused planner searches and coverage selection retain the required entries instead of treating top lexical matches as sufficient evidence.

The private Guide was fully extracted/indexed. An administrator-scoped `weather` query matched seven passages; the same player-scoped query returned zero. Neither final player retrieval nor provider context contained the private Guide or its identifier.

## Final selected passages and page references

These IDs are from the final successful isolated test run, **not live campaign IDs**. Each run creates new UUIDs and removes its temporary database afterward. The Handbook source ID was `5ef77408-0805-4727-a381-fa07c7dc88db`; the GM-only Guide source ID was `4333a855-0321-4981-80f8-85529029c0e3`.

| Test / selected evidence | Chunk ID | Physical PDF page | Verified printed label |
| --- | --- | ---: | --- |
| Hunter, plain and explicit PDF request; final provider context | `49df8a97-a81c-4e6e-b909-ba15f06d088e` | 29 | 25 |
| Longbow ratings and damage input | `86c68ce7-52f9-4eb5-8509-d10943890322` | 107 | 103 |
| Ranged damage procedure; Aim and Shoot | `6d61a219-1aa3-4cbe-83f2-46e6bc2d4a4c` | 102 | 98 |
| Ready Weapon | `8d1cc352-56c5-4f48-b32a-9d5623854a02` | 101 | 97 |
| Fighter fallback, without a curated summary | `d593d33d-3fd7-41de-a287-9457d73aadf9` | 28 | Not separately asserted |

The tested printed labels come from the original PDF page-label metadata and independently observed numeric footers, which agreed. No global page offset is assumed. Existing application citations continue to use physical PDF pages. Each generated citation is checked against its stored source/chunk/page record. The explicit Hunter request preserves `pdf_only`, the named Handbook constraint and the printed reference through final selection.

The actual selected Hunter entry contains Agility and the five listed skills. The actual Longbow table supplies Gear Bonus +2, Damage 1 and Range Long; the selected ranged procedure establishes one additional damage per additional success. No correct-answer text is injected into runtime questions or model context.

## Checks actually executed

- `RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check`: **140 unit/synthetic tests passed**, followed by **9 real-file subtests plus their parent (10 TAP tests), all passed**.
- The real cases cover Hunter, explicit PDF/printed-page source selection, Longbow ratings, Longbow damage context, the three named actions, Fighter PDF fallback, GM-only Guide exclusion, final provider context/citations, and observed pagination.
- Missing-fixture controls: optional `test:real-sourcebooks` explicitly **SKIPPED** (zero passed); required `test:real-sourcebooks:required` explicitly **BLOCKED**, exit 1. These are intentional negative checks, not real-file successes.
- `npm run typecheck` and `npm run build`: passed.
- `npm run test:sourcebooks`, `npm run test:handbook-pdf`, `npm run test:mechanical-facts`, and `npm run test:retrieval-planner`: passed. These existing browser suites use synthetic PDFs and/or fake SDK transports; their success is separate from real-book validation.

Test-created campaign mechanics, characters, Journal/Day Tracker and source visibility were unchanged by retrieval. The capture-only AI turn writes normal chat/request data only inside its disposable test database. Copied files, FTS data and temporary databases are removed in `finally`, including failure paths. The original temporary input PDFs remain available for another run.

## Limits and future regression gate

Follow-up: the [missing mechanical evidence repair](missing-mechanical-evidence.md) now resolves the ordinary ranged hit threshold using real source evidence and extends the suite with strict numerical and bounded-retry regressions. The paragraph below records the limitation observed at the time of this initial investigation.

**The Longbow numerical reference answer remains unverified.** The real table and extra-success procedure now reach final context, but the existing mechanical guard still lacks verified hit-threshold evidence in this packet. It therefore withholds the three-success total rather than assuming that input. The regression asserts that missing evidence stays unverified. Further mechanical validation is deliberately deferred by this task; passing this retrieval suite does not claim the calculation feature is complete.

No paid OpenAI call, live-model answer-quality evaluation, or live campaign database verification was performed. Real source indexing and retrieval are tested; current production-library classification/index health is a separate read-only audit using `npm run sourcebooks:diagnose`. A fresh isolated import cannot establish that an existing live index is healthy.

Before future retrieval changes are merged, supply both private books and run:

```bash
cd ravenland
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

The command requires the real fixtures and fails if they are missing. `AGENTS.md` documents this required workflow; `test:real-sourcebooks` remains available with explicit skip behavior on machines lacking private inputs. This is a runnable local merge check, not a claim that GitHub-hosted CI has access to the licensed books. See [fixture setup](../tests/fixtures/private-sourcebooks/README.md). Reports emit metadata, IDs and page references rather than source bodies.

Changed files: root `.gitignore`; `ravenland/AGENTS.md`, `README.md`, `package.json`; this report; `tests/fixtures/private-sourcebooks/README.md`; `tests/real-sourcebooks.integration.ts`, `tests/retrieval-planner.test.ts`; `scripts/check-real-sourcebooks.mjs`, `scripts/check-retrieval.mjs`; `src/lib/rules/planner.ts`; and `src/server/sourcebooks/{mechanical-facts,planner-evidence,planned-selection}.ts`.
