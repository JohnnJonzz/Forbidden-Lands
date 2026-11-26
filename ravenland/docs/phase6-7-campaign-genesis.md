# Phase 6.7 — Campaign Genesis

Campaign Genesis adds a persistent, conversational Session Zero to new trusted-local campaigns. Work starts from Phase 6.6.1 commit `4b559b6`. All development and verification use isolated campaigns, controlled providers and private local sourcebook fixtures; no live campaign database is changed.

## 1. Charter

Protected GM Charter 1.1.0 adds Campaign Genesis as principle 11 while retaining agency, rules authority, private knowledge, NPC autonomy and consequence priority. It requires proposals and meaningful acceptance checkpoints, background-aware collaboration, a final public foundation review, and a concrete opening scene. The permanent charter remains above preferences; verified current events remain above the historical premise. The provider receives this protected charter even when campaign-specific instructions exist.

## 2–3. Official village generation and existing facilities

No existing deterministic village generator was found. The new generator reuses the existing secure application die and original indexed source-page retrieval rather than implementing another random source or copying a book into the repository.

The authorized fifth-printing Guide was inspected directly. Implemented tables: **Size of the Village** (D6), **Age of the Village** (D66 period), **The Ruler of the Village** (one D66 whole-row result), and **The Problem of the Village** (D66). They are on physical PDF pages 172–173, printed pages 168–169. D66 is two independently generated D6 faces, tens then units. State records every face, total, selected row and original document/chunk/page citation.

Table contents are parsed from the installed book, with expected row counts and covered outcomes checked. Missing/ambiguous books or unreliable extraction stop the affected generation and produce an explicit evidence warning. Earlier successfully verified results remain identified. The model never supplies official dice. Name, dominant kin, named NPCs, buildings, atmosphere and interpretation are creative proposals; requested changes are player modifications. No kin-generation table, precise population roll, exact age-in-years roll, institutions, inn or NPC subtables are claimed as implemented. In particular, the age table's conditional D6 is left unresolved, not represented as a rolled exact age.

## 4. Village discussion and Try Again

The selected map village is the verified anchor. Unnamed starts may leave the name blank for a creative GM proposal. Canonical names cannot change. The GM can develop and modify a proposal through typed responses to ordinary chat. Accept Village is a meaningful checkpoint; changing village identity invalidates that acceptance.

Try Another Village archives the rejected draft and records fresh trusted generation. It retains the same hex and discussion/preferences unless the player explicitly requests an eligible alternate hex. It clears unaccepted settlement descriptions, NPCs and rumors and immediately asks for a fresh creative interpretation of the newly recorded results. Original registry rows and canonical geography are untouched. A map checksum change invalidates pending operations.

## 5. Persistence

Migration `021_campaign_genesis.sql` adds versioned workflow state with its own revision and request receipts. State includes map anchor/checksum, selected roster, draft, accepted village, generation evidence, bounded rejected-proposal history, relationship/motivation/preferences draft, reviewed revision, confirmed foundation and request-linked conversation. A persisted opening request ID prevents duplicate automatic introductions and changes on reset.

Provider work happens outside transactions. Commit rechecks campaign revision, workflow revision and map identity inside a transaction. Interrupted/invalid responses leave the previous state intact. Browser refresh, navigation, process restart and SQLite reopening reuse the saved state, rather than reconstructing acceptance from chat.

## 6. Relationships and motivations

The Genesis provider reads the selected roster, saved draft and recent setup discussion together. It proposes background-grounded relationships and motivations, accepts volunteered details in any order, and asks only about gaps. Structured motivations must reference selected characters. Suggestions remain draft material until final review/confirmation. The application does not edit character sheets through this workflow.

## 7–8. Pride, Dark Secrets and private access

The provider reads current saved names, kin, profession, age, Pride and recorded relationship fields, with explicit blank/unrecorded status. It never invents missing values. Genesis is a shared conversation and currently has no participant-specific private narration channel. Consequently **all Dark Secret values are withheld**, even for the local controller; their presence/blank status is available without their contents. Secret-based proposals are limited to public information volunteered independently. Exact saved-secret disclosures in input or structured output are rejected before shared publication. This exact-text check supplements withholding; it is not claimed to detect arbitrary semantic paraphrases.

Genesis review and mutations require the trusted local controller. Hosted players do not gain access to other sheets or installation resources. A future private-channel workflow would be needed for secret-inspired private GM plans; this phase deliberately does not publish them in public journal entries.

## 9. Preferences

Opening situation, free-text tone and Active/Balanced/Reactive initiative are stored in the foundation, separately from permanent instructions. Gameplay context receives the confirmed foundation with an explicit hierarchy: present verified scene first, permanent charter, then historical premise/preferences. Genesis does not automatically reopen after adventure start.

## 10–11. Final confirmation and journal

The foundation review is rendered by the application from validated structured fields. Confirmation requires village acceptance, a complete shared purpose/opening/tone/description, a proper name, the current reviewed workflow revision, the current client campaign revision, eligible participant IDs and the current map anchor. A model cannot silently confirm: the player's message must explicitly accept/confirm. Changes during confirmation are rejected and require review again.

One transaction updates authoritative settlement identity, current location, known village, objective and description, appends one readable **Campaign Beginnings — [name]** journal entry, records the opening scene and writes the receipt. The entry includes the roster, NPCs, relationships, individual/shared motivations, opening and preferences. Rumors are labelled unverified. Exact retries return the saved reply and do not append another journal entry.

## 12. Opening and normal play

After confirmation the provider supplies economical sensory prose, an observable feature/NPC/tension and a decision point, respecting agreed character whereabouts. If no scene text is supplied, a bounded fallback uses the accepted village and NPCs. No Genesis operation creates travel, elapsed time, weather rolls, combat, dice requests or quarter-day forms. Subsequent chat routes to the existing AI service with the confirmed foundation as historical context. Existing mechanical safeguards remain in effect.

## 13. Creation, reset and existing campaigns

New trusted-local campaigns initialize Genesis after attaching inherited libraries. The UI automatically requests the first proposal once and offers unobtrusive chat shortcuts. Ordinary natural-language discussion and confirmation use the same validated service.

Reset explicitly starts a fresh Genesis, retains existing library/character protections and retires old Genesis request IDs alongside other reset history. Previous rejected drafts, plans and conversations are not reused. Keeping an old confirmed story foundation across reset is not implemented; the reset UI says it starts fresh. Imported backups and existing campaigns without a Genesis row remain underway and are not forced through setup. Migration does not invent histories or mutate existing campaign records.

## 14. Changed files

- New `src/server/genesis/{schema,service,village}.ts`, migration 021, `/api/genesis` status route and `GenesisPanel`.
- Campaign lifecycle/setup/app, protected charter, GM turn schema, AI service/provider/context.
- Genesis unit/browser tests, actual-book integrity integration, migration-count/charter assertions, explicit legacy-gameplay context fixture, package scripts, this report and browser screenshot.

## 15. Verification

- `npm run test:retrieval-check` with the actual private fifth-printing PDFs: **489 regression tests and 160 real-PDF tests passed**, zero skipped. The real-book integrity case additionally verifies all four village tables, source pages and repeatability with controlled application dice.
- Focused Genesis and library suites: **24 tests passed**, including 11 new Genesis tests.
- `npm run test:genesis:browser`: **passed** in Chromium. Verifies automatic introduction, natural-language changes, rejection/retry, village acceptance, volunteered relationships/preferences, refresh, restart at final review, final confirmation, one journal entry, and no automatic mechanics. Its persisted-state poll waits for committed results before navigation.
- `npm run test:library-corrections:browser`: **passed**. Existing legacy weapon rendering/save/dice, default PDF/custom-rule/image inheritance, synchronization and restart remain verified.
- `npm run build`, `npm run typecheck` and `git diff --check`: **passed**.
- [Actual browser foundation-review screenshot](phase6-7-genesis-review.png), using isolated synthetic narrative and character data.

All automated providers are controlled and make no paid calls. No live campaign database was used. Private PDFs, extracted text and temporary databases are excluded from the commit.

## 16. Limits

- Free-form interpretation and narration quality depend on the configured model. Automated tests use controlled responses; no paid/live-model quality claim is made.
- Mock mode supports a small illustrative conversation, not a language model. It labels its prose as creative; live mode interprets the trusted official results and full natural-language discussion.
- Supported official generation is bounded to the four tables above, with conditional subtables unresolved. Missing sources are reported explicitly; creative discussion can continue without falsely claiming official generation.
- Secret-driven private plans and hosted multi-party Genesis administration are not supported. Shared responses omit secret values.
- Rejected history and setup conversation have bounded retention (30 drafts, 80 turns); accepted state and receipts remain persisted.
- Genesis model calls currently use the configured OpenAI endpoint and timeout but do not add token/cost records to the existing ordinary-play usage dashboard.
- No live deployment or existing user campaign has been modified by these changes.

## 17. Manual live-model playtest

1. Update and restart the application. Configure your existing OpenAI provider if you want a live-model test; this makes normal billable calls. Ensure the actual indexed Guide is available in installation libraries.
2. Create an isolated campaign, select actual participating characters and a verified village. Leave an unnamed marker's name blank if you want a GM proposal. Leave default library inheritance enabled.
3. Read the first proposal. Try “I like the location, but make it mostly dwarven,” then “Try another village.” Check the hex stays fixed and rejected details remain proposals.
4. Volunteer relationships before being asked, e.g. “We are siblings, already living in separate households here. We want to find an old dwarven stronghold. I'd prefer dark mystery and a reactive GM.” Check the GM incorporates these without forcing shared history or party assembly.
5. Accept the village, revisit any details and review the foundation. Refresh or restart mid-discussion; it should resume. Never paste a private Dark Secret into shared chat.
6. Confirm the reviewed foundation. Check exactly one opening journal entry, saved village name/hex and a concrete scene with player choice. No automatic quarter report, combat or travel should begin.
7. Continue normally. Check the campaign preferences remain useful historical context and Session Zero stays closed. Test reset only on the isolated campaign; confirm it starts a fresh discussion while retaining libraries and characters.
