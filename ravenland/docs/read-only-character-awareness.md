# Read-only character awareness and local play

November 9, 2026 (America/Chicago).

## Run the simplified workflow

From `ravenland/`, run:

```bash
npm run dev
```

Open `http://127.0.0.1:3000` (or `http://localhost:3000`). Use `npm run dev -- --port 3001` for a different port. Choose **ACTING AS** and play normally. No separate player token, ownership configuration, new character records, or additional AI key is needed for local character context. The existing optional OpenAI setup/mock mode still determines which narrator runs. Settings shows **Trusted local play** instead of a token form.

The local launcher binds only to `127.0.0.1`. It refuses public Host values, remote peers, forwarded/proxy requests, and mismatched Origins. In a cloud workspace, use a browser connected directly to its loopback address. Do not expose this launcher through a public port-forwarder or reverse proxy. `npm run dev:hosted` retains the former network-bound Next development server, and `npm start` remains the production command; those modes retain scoped player credentials and ownership checks. Existing GM review credentials remain required for privileged review, sourcebook and memory operations in every mode.

## Architecture and access boundary

The old `/api/gm` intercepted every mechanical declaration and returned a preparation report before narration, requiring a player token even for trusted local play. It also required an Equipped flag to establish a weapon choice. The new path lets declared actions reach the existing narrator, with recorded character context and a separate advisory preparation packet.

`scripts/dev-local.mjs` is a development-only custom Next server using Next's documented server API. Next Route Handler requests do not expose the actual TCP peer, so the launcher checks the socket before delegating to Next. It generates an ephemeral server-only proof, overwrites any client-supplied proof header, and stamps only accepted loopback requests. It never prints the proof or sends it to browsers. `isTrustedLocalRequest` additionally requires development mode and a matching proof. A client character ID, Host header, forwarded address, cookie, `NODE_ENV` alone, or public configuration switch cannot create local trust. Production rejects the local proof even if supplied. There is no persistent local-play credential to configure.

`gameplayPrincipal` scopes the trusted local request to the requested campaign/character only. The existing saved campaign must contain that character; nonexistent IDs are not fabricated. The local selector is intentionally context selection for a trusted operator, not authenticated ownership. Hosted requests continue using the original hashed player-token grants. `mayReadCharacter`/`requireCharacterAccess`, source visibility, private memory policy and GM review checks remain in place. No user/owner database or parallel character record was introduced.

## Character projection

`character-awareness.ts` extends the existing read-only mechanical projection of the saved `Character`/`CharacterSheet`. It never calls `sheetFor` or supplies UI defaults as facts.

| Information | Representation |
| --- | --- |
| Attributes | Saved current and regular/maximum values; missing or invalid values stay `null` |
| Broken | True if any known current attribute is zero; false only when all four are known and nonzero; otherwise unknown |
| Skills and talents | Canonical skill IDs/ranks and bounded recorded talent names, ranks and descriptions |
| Conditions | Saved booleans, preserving unknown fields |
| Critical injuries | Recorded injury/effect text, explicitly not a verified numeric modifier |
| Weapons and gear | Saved rows, bonuses and readiness; armor/helmet/shield fields and gear quantities/notes |
| Consumables | Food/water/arrows/torches recorded values, resource die, empty/lowest-die indicators and unknown values |
| Other resources | Recorded Willpower and gear quantities; no automatic spending |
| Story fields | Relevant acting-character Pride, Dark Secret and Relationships, subject to the narrative policy below |

`None` and an explicit recorded zero indicate depletion; blank/unrecorded fields stay unknown. `D6` is the lowest tracked resource die, not six arrows or six portions. Notes may describe an effect but do not authorize applying it. Lists and text are bounded for prompt size. The projection is generated for the active actor on ordinary conversation as well as declared actions, rather than only when the retrieval planner requests character statistics. Other party members contribute public identity summaries only.

## Private story information

The requested policy is to keep these fields private by default and use them when relevant to narration; players are not concealing them from one another. Accordingly:

- The server reads only the authorized active actor's story fields, never every party member's private sheet.
- Explicit references to Pride, a Dark Secret, or Relationships can include that field for that actor's narrative turn. In trusted local play, two meaningful matching words from the declaration, current location or two recent public GM messages can also establish thematic relevance, such as “mountain watch” matching a recorded past event. Hosted requests require an explicit field cue and the owning player grant.
- Rules-reference requests omit private story fields. Unrelated narrative requests omit them. Requests to keep information private or avoid revealing it suppress story inclusion.
- The protected instructions say to use relevant information proportionately, not list the whole sheet, expose other characters' secrets, or invoke Pride automatically.
- Anonymous/unowned actor context is omitted. Public saved-request diagnostics remove the entire actor/preparation context, including relevant story fields; a separately authenticated GM review remains privileged. GM-only memories and sourcebooks are never added by local trust or actor ownership.

This is relevance-based context selection, not a new private-chat system. The main chat remains shared. When an authorized player brings their own story information into that shared narration it can become part of saved chat, just as information they type there does. It cannot be made private retroactively by redacting later diagnostics. Thematic matching is deliberately limited and can miss synonyms or subtle connections; mention the relevant field when you want it considered. It does not continuously index private fields, search other players' secrets, or send them wholesale to the model.

## Narration, preparation and mechanics

Ordinary GM chat again goes through `AIService`'s established provider/mock, memory, usage, idempotency and persistence workflow. An action's preparation packet is guidance in provider context, not a replacement for the narrator or a gameplay gate. An unsupported action, absent weapon row or unresolved modifier can prompt clarification while the scene continues. A declaration is not a completed roll or hit.

`POST /api/characters/prepare` remains a separate read-only calculation endpoint. A single recorded matching Longbow can establish the candidate regardless of whether Equipped is absent, true or false. Multiple indistinguishable rows still require clarification for a verified pool. The actual saved attribute, skill and bonus must still match verified official/house evidence. No rating is inferred from inventory prose or substituted from weapon presets. Missing equipment does not prove an item is unavailable in the fiction; it means the numerical pool is unverified.

Where official evidence establishes the costs, Ready Weapon/Shoot can be mentioned as relevant fast/slow action reminders. Readiness is not reset at the start of combat, and a missing checkbox does not establish that drawing is required. Preparation never marks a weapon ready. The protected policy prohibits inventory changes, ammunition/provision use, Willpower spending, Pride invocation, conditions, damage or time progression. Existing player-controlled sheets, dice/push controls and explicit application actions remain authoritative. No dice UI was added.

Normal conversation intentionally persists its player/GM messages and existing request/usage metadata. Read-only projections and direct preparation make zero database changes. Narrative tests compare the full campaign session excluding its intended messages to verify no attributes, supplies, equipment, journey, location, clock or Journal changes occur.

## Verification

Tests cover token-free local conversation and attack narration, ACTING AS switching, current/maximum attributes and Broken, conditions/injuries/talents, relevant versus unrelated/private-suppressed story fields, zero/low/unknown consumables, a Longbow without Equipped, direct preparation without writes, and narration without mechanical state changes. Security tests cover hosted ownership, anonymous/unassigned actor redaction, logout/restart sessions, rejection of forged local proof in production, and the loopback launcher's Host/Origin/forwarding restrictions.

Run from `ravenland/`:

```bash
npm run typecheck
npm run build
npm run test:character-preparation
npm run test:character-awareness
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
```

Both actual supplied fifth-printing PDFs remain private test fixtures outside Git. Before this change the real suite passed 20 TAP tests. The updated real suite retains all numerical/evidence/source-permission regressions, keeps the direct character-preparation zero-write check, and adds a provider-boundary Longbow narration check without Equipped. Browser tests use a controlled provider and separate synthetic PDF fixtures; no live-model quality claim follows from those tests. Executed results:

| Check | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Full unit/synthetic gate | 170 passed, 0 failed |
| Actual PDF suite | 21 TAP tests passed, 0 failed; baseline 20 passed before changes |
| `test:character-awareness` | Passed in the loopback development launcher, without player credentials |
| `test:character-preparation` | Passed in production mode, including ownership, advisory Equipped, logout/restart and rejection of a matching forged local proof |
| `test:retrieval-planner` | Passed existing diagnostics, reference and privacy checks |
| `test:ai` | Passed streaming, failure/retry, canon, usage, recap, in-flight sheet/push and quarter-day regressions |
| `test:dice-repair` | Passed staging/pushing, atomic manual consequences and Recent Dice Rolls |

Both actual PDFs were extracted/indexed in isolated temporary databases: Handbook 212 pages/243 chunks as Public Rules, Guide 268 pages/373 chunks as GM Only. Real preparation retained the 7-die pool and zero writes, with official evidence on physical pages 58 (skill/attribute), 46 (pool), 101 (Ready Weapon), 102 (Shoot), and 107 (Longbow). The added actual-book provider test confirmed attack narration receives that verified base pool without Equipped and changes no mechanical state. Existing numerical player-success and weapon-statistic regressions remain intact.

## Limits and files

Trusted local play trusts all people/processes that can use the loopback app and ACTING AS selector. It is not a four-user identity system. Full public hosting still requires account-based campaign membership and ownership on the legacy campaign, character-sheet, image, map and dice routes. This task neither weakens the hosted preparation boundary nor completes that larger authentication rollout. The optional OpenAI API is unchanged; without a configured provider, mock narration does not demonstrate model reasoning about every character detail.

Relevant private fields may be disclosed in authorized shared narration under the requested party policy. Custom granular per-field audience controls/private channels are not implemented. Numeric injury/talent effects, full combat legality, artifacts and unsupported action preparations still require verified/manual resolution. No live campaign database was attached to this task; checks use disposable records and no live user data was changed.

Changed-file groups: local launcher/trust boundary and package commands; character awareness projection and AI context/instructions/service; GM, preparation, context and player-access HTTP integration; local-mode Settings status; advisory preparation evidence; unit/browser/real-PDF regressions; README/environment examples and supersession notes in the earlier guides. No database migration, external dependency or PDF extraction/indexing redesign is required.


| Purpose | Files relative to `ravenland/` |
| --- | --- |
| Development trust and access | `scripts/dev-local.mjs`, `src/server/local-play.ts`, `src/server/character-access.ts`, `package.json` |
| Character projection and narration | `src/server/character-awareness.ts`, `src/server/ai/context.ts`, `src/server/ai/service.ts`, `src/server/ai/instructions-v1.ts`, `src/server/action-preparation.ts` |
| HTTP and local status | `src/app/api/gm/route.ts`, `src/app/api/characters/prepare/route.ts`, `src/app/api/ai/context/route.ts`, `src/app/api/player-access/route.ts`, `src/components/player-access.tsx` |
| Tests | `tests/character-awareness.test.ts`, `tests/local-character-awareness-browser.cjs`, `tests/character-preparation.test.ts`, `tests/character-preparation-browser.cjs`, `tests/real-sourcebooks.integration.ts`, `tests/ai-canon.test.ts` |
| Documentation | `README.md`, `.env.example`, this report, supersession notes in `docs/player-access-setup.md` and `docs/character-aware-preparation.md` |
