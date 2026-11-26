# Rules Library organization and metadata upgrade

## Audit and duplicate-title cause

Canonical curated documents are `curated_rules.id`; their searchable chunks are `curated_rule_sections.id` with `document_id` pointing to the parent. PDF documents are `source_documents.id`, with `source_chunks.document_id` and stable chunk/page citation metadata. Curated category is the existing `topic` field, classification is `document_type`, attribution is `source_reference`, and visibility remains `Player Visible` / `GM Only`. PDF category/visibility retain their separate existing sourcebook meanings. Citations continue using parent document ID plus section/chunk ID and physical PDF pages where applicable.

The old player API returned flat passages and the UI rendered `results.map(p => <article key={p.chunkId}>)`. Therefore every matching chunk repeated its parent's title. A reproduction against the original implementation created **two** distinct synthetic `Journey - Fishing` documents with two matching sections each: **four cards, two parent IDs, four unique chunk IDs**. This establishes a presentation defect without assuming duplicate records or FTS corruption. Identical titles alone are not duplicate documents. The live campaign database was not attached, so no claim is made about duplicate records in the user's actual library. No documents were merged or deleted.

## Organization and presentation

`/api/rules` now adds document-grouped `documents` to the existing `passages` response. Legacy passage clients and the AI's section retrieval remain supported. Grouping uses document ID, never title. Curated search cards display title, existing category/classification, primary topic, short plain description, normalized tags, optional attribution and a collapsible list of matching headings. Overlapping chunks under one heading do not repeat that heading in the list. Two genuine same-title records remain separate. Empty-query browsing reads parent records directly, so a long first document cannot monopolize the entire browse list.

Opening a curated item still retrieves its complete body and renders it through the existing safe Markdown renderer, including headings, emphasis, ordered lists and tables. Search cards no longer use raw Markdown fragments. Missing descriptions use a bounded plain-text projection that omits headings and embedded classification/category lines; source bodies are never rewritten. PDF cards group by source and retain physical-page passage controls. Existing navigation, accessible labels, explicit-close behavior and dark styling remain in place. The broad filter/editor label now says **Category**, while retaining its existing storage field and compatible accessible labels; **Primary topic** is a distinct field.

## Database and compatibility

Migration **014_rules_metadata.sql** adds only:

- `curated_rules.primary_topic`, default empty string;
- `curated_rules.tags`, default `[]`, checked as a JSON array;
- `curated_rules.description`, default empty string;
- a parent-document FTS5 metadata index and insert/update/delete synchronization triggers, seeded from existing rows.

Category, classification, visibility and authority are **not duplicated**. The existing section FTS table remains intact. There is no automatic semantic backfill at startup. IDs, existing metadata, Markdown bytes, visibility, references, source revisions/timestamps, section/citation IDs, PDF records and campaign snapshots survive this additive migration. Applications should back up the SQLite file before any schema upgrade. As with other SQLite schema upgrades, run a previous application version only against a compatible database/backup; this is not a destructive downgrade mechanism.

Metadata-only saves update the parent metadata FTS immediately and do not regenerate sections. Thus section citation IDs survive metadata edits and backfill. Existing clients that omit the new optional input fields retain saved metadata. Ordinary full-body edits or explicit section reindexing keep their existing derived-index behavior. The prior explicit confirmed repair action now also rebuilds metadata postings. No new dependency, API key, canonical skill registry, character-sheet change or dice/mechanics change is introduced.

## Authorized editing and reviewed backfill

In **Campaign Settings → Sourcebook Library**, unlock using the existing administrator token. Select a curated document to edit **Primary topic**, **Tags (comma separated)** and **Short description**, alongside existing body/classification controls. Tags normalize case, punctuation/spacing and leading `#`, deduplicate equivalent forms, and explicitly canonicalize `quarterday`, `quarter_day` and `Quarter Day` to `quarter-day`. Tags are structured JSON, not hashtags extracted into the body. Limits are 20 tags, 80 input characters each, 200 characters for primary topic and 500 for description.

The **Metadata suggestions and backfill** panel offers a read-only preview before any application. Suggestions use titles, headings and a small set of content terms locally; no model call occurs. Existing nonempty primary topic/tags/description are preserved, including server-side preservation during application. Broad multi-subject titles are flagged **Needs review**, leave an ambiguous primary topic unresolved and are not selected by default. Administrators can review the displayed values and explicitly select suggestions. Application requires confirmation and revision checks, runs transactionally, and never edits Markdown bodies, permissions, references or section IDs. Concurrent conflicting edits roll back the batch; repeated application is a no-op. Preview operates on up to 200 documents per campaign.

Example **synthetic** preview exercised in tests:

| Source | Proposed topic | Proposed tags | Result |
| --- | --- | --- | --- |
| Fishing — Official Procedure | Fishing | journeying, fishing, food, water | Fills empty metadata after confirmation |
| Hunter — Profession with reviewed values | Existing reviewed topic | Existing tags | Preserved, not replaced |
| Core Compendium with several activity headings | Unresolved | Bounded heading-derived suggestions | Needs review; unchecked by default |

In the test fixture, **one** unambiguous document received metadata, a second application changed **zero** records, and every source body and section ID remained unchanged. No backfill was applied to live campaign data here because that database was unavailable.

The new authorized commands reuse `/api/compendium`:

- `GET ?campaignId=…&type=metadata-preview` returns a dry run;
- POST `type: "metadata"`, campaign/document ID, current revision and the three metadata fields performs an explicit metadata edit;
- POST `type: "apply-metadata-suggestions"`, `confirmed: true` and the selected preview entries applies empty-field suggestions.

All require the existing GM header before parsing/access. Public readers have no metadata-write or backfill endpoint access. General metadata editing can deliberately replace values; backfill only fills empty values.

## Search, retrieval and authority

The existing `CompendiumStore.search` merges section FTS results with parent metadata FTS candidates, deduplicating by chunk ID. Title, primary topic, tags and descriptions become searchable immediately; original headings/body search remains active. Exact titles and primary topics, then relevant primary-topic/heading/tag terms, affect ranking. Untagged curated documents and authorized PDFs remain searchable. Metadata search contributes up to six initial section candidates per matched parent; later focused searches still use full section text. Searches remain bounded.

The existing retrieval planner sees primary topic as additional reference identity, with a modest metadata relevance score. Tags alone cannot establish coverage: the passage still needs substantive, source-supported content under the planner's requirement checks. A profession query still distinguishes the Hunter reference from Hunting activities. Exact relevant PDF procedures can outrank a misleading tagged summary that lacks the required content. Governing ranged evidence now checks for the applicable skill vocabulary and attack/procedure content rather than accepting the word “attack” alone as a complete procedure. This is evidence routing, not a new game rule or canonical registry.

Document diversity adds a small repeated-parent penalty while filling optional context; it is **not** a rigid one-chunk-per-document cap. Distinct required sections from a single source still receive requirement-based selection. PDF verification remains supported. A relevant PDF with several direct body matches is no longer rejected solely because its heading is general. Existing token/section bounds and at most one targeted retry remain unchanged. The token estimate includes primary topic, tags and description, so metadata cannot silently exceed the source-context budget. Applicable scoped house overrides retain priority; curated summaries do not become authoritative merely because they have tags. Original PDFs provide baseline verification and conflicts must be disclosed.

Player scope filters are applied before results/candidates are assembled. GM-only titles, tags, descriptions and document existence are not returned by public search or context. Metadata does not grant visibility. Private/foreign sources cannot be introduced through tags. Saved public source snapshots continue to revalidate visibility and omit administrator audits.

## Diagnostics

The existing GM-authorized **Rules retrieval diagnostics** now includes:

- plan intent/profile/required subjects and content coverage;
- candidate metadata field matches and section paths;
- parent document IDs, considered/selected chunk counts and exclusion reasons;
- index health, including metadata-posting presence;
- exact-title availability states and existing bounded retry/context statistics.

An optional exact title can distinguish `no_matching_document`, `not_indexed`, `outside_retrieval_scope`, `indexed_not_matched`, `matched_not_selected`, `selected_content_insufficient`, and `selected_check_content_coverage`. The last status explicitly requires consulting coverage; it is not proof that an answer is correct. A scope exclusion returns no private source ID/title/tags/content. Availability checks themselves require GM authorization and are absent from player-facing diagnostics. An empty player result must not disclose whether a private record exists.

## Changed files

- Curated schema/types and new `metadata.ts`: normalization, safe descriptions, deterministic suggestions, metadata-match signals.
- Migration 014 and `CompendiumStore`: additive metadata storage/FTS, metadata-only saves, preview/apply, stable section IDs for metadata changes, index-health/repair integration.
- Existing search/API and player Rules Library: ID grouping, parent browsing, readable cards/tags/sections and complete Markdown reading; new tag styling.
- Existing admin compendium/API plus `rules-metadata-backfill.tsx`: metadata editing and authorized preview/confirmation/application.
- Existing planner evidence/ranking/selection/retrieval/audit/types/diagnostic text: metadata identity/ranking, content checks, document diversity, PDF support and safe availability states.
- New `rules-metadata.test.ts`, `rules-metadata-browser.cjs`, package test script. Existing migration-count expectations advance to 14. A planner test now permits supporting PDFs within its already-existing six-section cap while requiring all four governing documents and preventing overview dominance.

No AI personality or storytelling instructions were rewritten.

## Verification and manual scenarios

```bash
npm test
npm run typecheck
npm run build
npm run test:rules-metadata
npm run test:compendium
npm run test:sourcebooks
npm run test:retrieval-planner
npm run test:procedure-retrieval
npm run test:ai
npm run test:ai-diagnostics
npm run test:ai-instructions
npm run test:persistence
```

The ten new SQLite/FTS5 tests cover parent grouping and genuine same-title records, complete content and readable descriptions, tag normalization, immediate metadata search/update, stable citations and unchanged mechanics, preview/idempotent preservation/ambiguity, exact primary-topic and Hunter routing, misleading-tag versus exact-PDF relevance, three-subject coverage, same-parent useful sections and PDF verification, private metadata/availability boundaries, byte/ID-preserving migration, scoped house authority, transactional backfill conflicts, selected-but-insufficient evidence and omitted candidate counts, and metadata-aware token budgets. The new browser suite covers document cards and complete Markdown tables/lists, actual editor/save/search normalization, stable IDs, authorization, preview/cancel/confirmed/idempotent backfill, mobile layout and refresh persistence. Fixtures are original synthetic text; no paid API calls or copyrighted book text is used.

Manual checks:

1. Run `npm run dev`, open **Rules Library**, search **Fishing**. Expect one card per real document, tags and plain descriptions. Expand matched sections; open a card and read its complete formatted document. Genuine same-title records remain separate.
2. Search **Hunter profession skills**. If an authorized entry exists, it should precede Hunting activity summaries. Otherwise use the authorized exact-title diagnostic to distinguish absent/unindexed/excluded/omitted content, without guessing a list.
3. Ask AI chat: **Compare Foraging, Hunting, and Fishing, including the skills, rolls, mishaps, and resource outcomes.** Inspect separate governing sources and citations, `planner.coverage` and any remaining gaps. Verify the actual mechanics against your sources.
4. Edit a tag/primary topic/description as administrator. Save, search the new tag immediately, refresh, and confirm the full body and permissions are unchanged. Preview suggestions and cancel once before confirming a reviewed selection; preview again to check idempotence.
5. Ask a rule with only an authorized PDF source. Confirm the PDF remains available and cited rather than being declared missing because there is no curated summary.

Limits: lexical metadata and coverage cannot verify the correctness of a skill list, rule or exception. Suggestions require review and never certify official authority. There is no automatic document merging, live duplicate-record cleanup, metadata inference from arbitrary private material, semantic embedding service or canonical skill registry. Human browse is bounded to 100 parent documents, admin preview/list to 200, search/candidates and diagnostics retain their bounded limits; large libraries may need future pagination. Only matching/search-bounded sections are listed in cards, but the full curated body remains accessible. The actual eight live curated documents and paid-model answers were not available for inspection; no live source-completeness or model-accuracy claim follows from these tests.
