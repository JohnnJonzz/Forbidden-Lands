# Phase 6B.2 — Rules-aware retrieval planner

## Existing flow and integration point

Before this change, `AIService.run` claimed/idempotently recorded a request, assembled campaign/party context, approved party-known GM Memory, selected Journal entries and bounded conversation history, then called `retrieveRules` before the provider. Rules-question heuristics gated retrieval. A bounded keyword query plus related-topic FTS searches produced curated/PDF candidates. Heading/body scores, scoped house-rule priority, topic diversity, conservative overlap removal and shared section/token limits selected the context. Public sources were filtered before assembly; public saved snapshots rechecked visibility. Explanatory requests had a server-side action/memory-proposal guard. Existing citations, request diagnostics, usage tracking, retries and confirmation of validated proposed actions followed provider execution.

The planner is inserted **inside that same `retrieveRules` call**, before candidate searches. It adds no second retrieval service, AI classifier call or database. PDF extraction/page chunks and curated heading-aware indexing/FTS triggers are unchanged. Existing query bounds, shared candidate ranking, deduplication, authority policy and diagnostics remain in use. Context assembly now supplies an explicit bounded actor/site view when relevant. The request provider and proposal approval/application paths remain the same.

## Profiles and classification

`src/lib/rules/planner.ts` contains a deterministic, typed plan. It records the intent/modes, primary/secondary domains, subjects, governing/supporting requirements, source categories, relevant campaign context, optional exceptions, character-data need and a one-pass retry ceiling. **`stateChangesPermitted` is always false**: a plan is never an authorization. `proposalsPermitted` describes response mode; existing server validators and approval controls remain authoritative.

- **Rules reference:** mechanical questions/explanations/comparisons and explicit requests not to perform an activity. `explanationOnly` blocks returned actions and memory proposals in the real AI service. No dice or clock/location changes occur. Chat messages and normal request/usage records still persist.
- **Gameplay adjudication:** explicit first-person action verbs such as shooting, hunting or climbing. Governing rules and the selected actor/situation are retrieved; absent inputs require clarification. No new executable action types are added. An accompanying request to explain can add a secondary rules mode without authorizing changes.
- **Adventure narration:** entering/examining/investigating sites or rooms and perceptual questions. It consults current location, known discoveries, relevant approved memories and Journal evidence. Mixed combat/site requests can require both source types.
- **General conversation:** avoids source searches, while retaining the existing ordinary campaign context. Recap and quarter-day request kinds retain their specialized workflows.

Implemented profiles:

| Profile | Governing/supporting requirements |
| --- | --- |
| Character rules | Explicit profession/kin entry, requested skill/attribute/talent/equipment category; supporting definitions where identified. The Hunter profession is an entry query, not a Hunting-activity query. Category grounding distinguishes a key attribute from listed skills. |
| Combat | Specific ranged/melee procedure; action economy; declared actor's attack pool; named weapon; range/situation modifiers; explicitly requested defense/damage/armor/initiative; available named talent exceptions. |
| Journeying | Exact activities, quarter-day compatibility, Hunting search/attack references, mishaps/resource outcomes; terrain/season/weather/equipment modifiers when explicitly requested. |
| Magic | Spellcasting fundamentals, explicitly identified discipline/spell, rank/Power Level/Willpower context, mishaps and available actor exceptions. No assumption of identical traditions. |
| Adventure sites | Publicly shared current-site baseline, plus separate current campaign state and approved party-known modifications. |
| Generic | Existing topic procedures or a bounded governing-action/rule query. Intended extension point for strongholds, crafting, trade, conditions, monsters, encounters and social procedures. |

This is vocabulary/profile routing, **not a canonical skill registry**. Source requirements do not supply mechanical constants or establish official facts. Entity extraction is deliberately small and can miss ambiguous or multiword names. A question about “my” character includes that selected actor; generic profession questions do not need an actor. The existing party summary still accompanies normal AI context.

## Coverage and bounded targeted retry

The original candidate collection is supplemented with focused searches for up to four governing requirements. Selection gives applicable explicit house rules first priority, then tries governing before supporting requirements, retaining the existing topic fallback and published PDF support. Exact relevant curated procedures are preferred; a curated entry that does not meet the requested content requirement cannot displace an exact PDF merely because it is Markdown. Profession requests exclude unrelated activity references from selection.

`planner-evidence.ts` checks reference identity **and substantive passage content**: at least eight content words and each requirement's grouped evidence terms. Title-only placeholders remain limited. Requirements can share one passage: a complete Hunting procedure may cover search, attack and mishap branches without separate duplicate chunks. The old `selection.coverage` remains a compatibility topic signal; **`planner.coverage` is the content-oriented requirement check** shown in the development summary.

After initial selection, missing/limited requirements trigger at most **one targeted search pass**, with up to six requirement queries. It uses the existing player-scoped curated/PDF FTS methods, increases each focused candidate limit to 40, merges candidates, reranks and deduplicates, and reapplies the *same* final budget. No model call, loop-until-success, per-retry budget increase or campaign write occurs. Remaining gaps are named in context and require acknowledgment/clarification rather than invented skills, modifiers, checks or outcomes.

The default final section limit is four, or six for plans with more than four requirements; `RAVENLAND_RULES_MAX_CHUNKS` still overrides it within 1–6. The existing token budget stays 3,000 estimated tokens (configurable 500–4,000); query limits remain 400 characters with the complete player action preserved for the provider. Requirements can legitimately remain uncovered because of limits. These are heuristics for available evidence, **not factual/mechanical verification**, list-length validation or a guarantee that all exceptions were retrieved.

## Authority, secrecy and current state

Mechanical authority is unchanged: an explicitly applicable campaign house rule overrides only its scoped mechanic; official rules provide the baseline; curated summaries aid explanation and do not silently override a specific published procedure. Conflicts or missing override material require disclosure.

Fictional-state authority is separate. Application-maintained state and approved/corrected party-known campaign modifications override published starting conditions. The structured site context makes these established modifications explicit alongside the baseline. A defeated creature must not be restored from its original placement. Rumors remain unconfirmed. The existing deterministic historical-recall guard still applies to site questions with no established evidence.

Public chat never receives GM-only adventure documents, hidden source titles, private memories or private instructions. A new internal **`party-site`** scope on the existing PDF search method permits only **Indexed, `Public Rules` documents categorized `Adventure` or `Campaign Reference`**, restricted to this campaign and current-site evidence. Ordinary player Rules Library searches retain their previous Rules/Bestiary/House Rules filter. This is explicit publication, not automatic permission to reveal a private adventure: keep full spoiler-bearing books **GM Only** and publish only reviewed party-known excerpts. There is no authenticated private GM context or per-room trigger authorization in this phase; absent public material remains a gap. The system cannot safely infer that an encounter trigger authorizes a secret.

Actor context reads only bounded skill fields, current shared weapon/talent data, relevant spell data and armor/shield/resource fields. It excludes `dark-secret` and arbitrary sheet text. Original sheets/dice are unchanged. Saved public request previews omit the new actor/site context and planner details; source references and existing memories continue to be revalidated for visibility. Authenticated development diagnostics receive only public-source metadata and plan/coverage signals, not passage text or system instructions.

## Files and diagnostics

- `src/lib/rules/planner.ts`: intent/profile/requirements, no persistence or model calls.
- `src/server/sourcebooks/planner-evidence.ts`, `planned-selection.ts`: content evidence, coverage, bounded requirement selection using existing rank/overlap helpers.
- `retrieval.ts`, `selection.ts`, `library.ts`, sourcebook types: existing pipeline integration, focused searches/retry, scoped site references, safe public redaction.
- `src/server/ai/context.ts`, `service.ts`, `instructions-v1.ts`: bounded actor/site data, rules-only/proposal guards, source/state/category policy. Protected instruction version is v1.3; editable campaign instructions are not rewritten.
- Existing diagnostics route/component: intent/profile, requirements, retrieved public sources, coverage gaps, retries, omissions and estimated final source-context size. Normal chat stays uncluttered.
- Public AI context route: omit duplicated actor/site snapshots from public historical previews.
- `tests/retrieval-planner.test.ts`, `retrieval-planner-browser.cjs`: focused real-pipeline and browser tests. Existing canon-version and adventure-intent assertions updated to the intentional new behavior.

No migration, source rewrite, new dependency, canonical skill registry, character-sheet edit or dice change is required. Existing databases and the eight Journeying documents are not modified by development or retrieval. Index repair from the previous phase remains an explicitly confirmed administrator action, not a planner side effect.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run test:retrieval-planner
npm run test:procedure-retrieval
npm run test:compendium
npm run test:sourcebooks
npm run test:ai
npm run test:ai-instructions
npm run test:ai-diagnostics
npm run test:persistence
```

The nine focused tests cover A–H: Hunter profession versus Hunting; Hunting search/attack/mishaps; three-activity plus quarter-day coverage; ranged adjudication with action/pool/weapon/range/talent sources and actual actor context; public site baseline plus approved defeated-monster state; rules-only application safety; a real FTS targeted retry recovering an initially missed support entry and explicitly missing procedures after one retry; house-rule/visibility/title-only evidence; and generic/magic/mixed/conversation classification. Browser verification covers authenticated diagnostics and the compact planner summary, Hunter references and rules-only context, combat declaration/actor/weapon context through the official SDK, public snapshot redaction and unchanged mechanical campaign data. Fixtures are synthetic and providers use fake transport; tests make no paid API calls or live-model accuracy claims.

Manual verification: run `npm run dev`, open your campaign, unlock **Campaign Settings → Sourcebook Library**, and expand **Rules retrieval diagnostics**. Enter the examples above and inspect `planner.plan`, `planner.coverage`, `missingTopics`, `targetedRetries`, `retriedRequirements` and existing candidate decisions. Ask the same questions in chat using your own sources; expect Hunter's profession entry, distinct Hunting checks and all three compared procedures. Inspect explicit action/weapon references for a combat declaration and the supplied selected actor. A rules-only question must not offer a quarter-day action or change mechanics. For a site, set the actual location through existing validated controls, retain the full adventure as GM Only, and provide only reviewed public site excerpts; establish any defeated-monster fact via existing approved Memory. Verify the response treats that fact as current and does not disclose hidden sources. Live chat uses your configured API at normal cost; local diagnostics do not.

Remaining limitations: lexical classification/coverage/entity extraction can miss synonyms, ambiguous scope or multiword entities. Content-word/group checks cannot prove rule completeness or the correct five skill names. Large sources and many requirements can exceed budgets; a single retry cannot repair absent or unindexed documents. The current-site anchor is campaign location text, not a new room-ID registry. Private adventure retrieval and automatic secret-discovery triggers remain deliberately unsupported. The live eight source documents/database and paid-model responses were not available for inspection here; verify actual answers against your authorized books before relying on mechanical correctness.
