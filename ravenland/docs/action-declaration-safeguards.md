# Phase 5.1: action declarations and compact composer

November 10, 2026 (America/Chicago).

## Reproduced cause

The reported sentence was traced through the existing code:

> Edrus raises his Longbow and fires an arrow at a nearby bandit. What happens?

Before this change, `planRetrieval` returned `general_conversation`; even calling resource attention in declaration mode returned an empty required-resource list. The declaration recognizer required first-person phrases such as “I shoot.” The ammunition matcher recognized `fire` and `shoot`, but not `fires` or `shoots`. The broader contextual resource check could therefore treat the request as conversation and omit its action-specific supply warning. Lighting a torch used different matching and could still work.

Even correctly classified declarations relied on protected model instructions to avoid premature resolution. There was no application response boundary preventing streamed model prose from announcing a hit. Phase 5's controlled narration tests verified context delivery but did not challenge that boundary with a deliberately noncompliant provider.

This reproduction establishes code-path causes. No live campaign database or original production request logs were attached; Edrus's actual saved resource value was not guessed. Both explicit depletion and blank/unrecorded ammunition are covered.

## Focused correction

A shared, bounded declaration recognizer now understands first-person actions and the selected character's full/first name, conjugated verbs, supported coordinated attempts such as raising a bow and firing, and a trailing “What happens?” It excludes examples, questions about how to act, negated actions and declarations attributed to another character. Names select context only; they do not grant sheet access.

The existing retrieval planner, authorized preparation/context path and pending-action matcher reuse that recognition. The original declaration is preserved, including all supplied numbers and source requests. No normalized replacement message, parallel character model, pending-action table or migration was introduced.

Recognized ranged/melee attacks, Manipulation attempts and explicit canonical skill-roll declarations have a read-only `actionSafeguard` in the existing request snapshot:

- `clarify_resources`: a clearly required tracked resource is explicitly depleted or unknown. The application reports the distinction and asks how to proceed or what supplies are available, without resolving the attempt.
- `awaiting_roll`: requirements permit requesting the skill. The application directs the player to the character-sheet roller, optional push and **Recent Dice Rolls → Submit to GM**. A verified base pool is shown only when existing preparation is fully ready; missing equipment, rules, talents or modifiers are not filled in.

These responses are application-generated before model streaming, so a provider cannot announce an unrolled hit through this path. They make no paid API call. They allow concise attempt/positioning narration but do not establish success, failure, damage or expenditure. Ordinary conversation and no-roll actions retain their normal narration path. Available torches/provisions do not gain a mandatory roll or confirmation.

The recognizer uses the existing canonical skill registry; it does not add skills. Ranged preparation still uses the existing authorized official-PDF/house-rule evidence and recorded values. An absent Equipped flag is advisory. Manipulation uses its canonical Empathy association and existing sheet roller; this task does not invent a separately verified Manipulation pool or opposed-roll execution engine.

## Submitted results and continuity

Submit to GM still loads and verifies the saved dice record, faces, actual success count, identity, push consequences and fingerprint. One compatible recorded roll request links the original declaration. The matcher now reads the saved safeguard stage/skill directly for these requests, while retaining the legacy narration-based fallback. Resource clarifications are not mistaken for actual roll requests.

A verified successful submission continues through the existing narrator with its exact result, matched declaration, current location, scene excerpts, NPC context and unresolved threads. Optional successes remain unallocated and mechanics remain unchanged. Ambiguous actions still require clarification.

A verified zero-success submission receives an application acknowledgment that it does not establish a successful hit/outcome; an unmatched result also asks which action it belongs to. This prevents a noncompliant narrator from converting zero successes into a hit. It does not guess damage, a hit threshold, an opposed result or optional effects. Complete dice details and saved push consequences stay in Recent Dice Rolls. Existing idempotency, retry and finalization protections remain intact.

Example from a disposable Edrus fixture:

```json
{
  "actionSafeguard": {
    "phase": "awaiting_roll",
    "kind": "ranged_attack",
    "skill": {"id": "marksmanship", "name": "Marksmanship", "attribute": "agility"},
    "resources": [],
    "stateChangesPermitted": false,
    "resolutionPermitted": false
  }
}
```

With zero arrows the phase is instead `clarify_resources`, and the existing resource projection records quantity `0`/state `empty`. Blank or missing arrows have null quantity/state `unknown`, with their blank/unrecorded status retained. Positive quantities and resource dice retain their established meanings. No resource is deducted or added. Public saved-context previews redact the safeguard together with actor mechanics/resource attention; privileged review remains separate.

## Compact composer

The original keyboard handler, `send()` function, ACTING AS selector and Send button remain intact. The visible Enter/Shift+Enter instructions were removed. The textarea and Send button share a row below the existing header, retaining the same dark fantasy colors, border, typography and status footnote.

The complete short-message composer is approximately 90 pixels on desktop and 85 pixels on the tested narrow viewport. Text grows automatically up to 180 pixels or 28% of viewport height, whichever is smaller, then scrolls internally. Clearing/sending shrinks it again. Resizing recalculates wrapping. Enter still sends; Shift+Enter inserts a newline; IME composition protection remains unchanged.

## Verification

Executed checks passed. Tests use isolated campaign stores, controlled SDK/providers and legitimate private PDFs outside Git; no live campaign edits or paid requests were involved.

| Check | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Required `test:retrieval-check` | 202 unit tests passed, then 22 real-sourcebook TAP tests passed; no skips |
| Real-sourcebook baseline before edits | 22 TAP tests passed with both actual PDFs |
| `test:action-safeguards` | Passed named Edrus/resources/real submissions/Manipulation/no-write cases and desktop/mobile composer acceptance checks |
| `test:gm-situation` | Passed existing scene, NPC/thread, background, resource and roll-association browser regression |
| `test:character-awareness` | Passed active-character/Broken/conditions/injuries/background, loopback security and redaction regression |
| `test:roll-gm` | Passed authoritative results, push consequences, refresh/restart, duplicate/retry, compact chat and finalization regression |
| `test:character-preparation` | Passed hosted authorization, different characters’ 7/8-die pools, logout/restoration, readiness and zero-write preparation regression |
| `test:retrieval-planner` | Passed official-reference, diagnostics, authorization, source-privacy and unchanged-mechanics browser regression |
| `test:ai` | Passed streaming, retry, memory/canon, usage, recap, in-flight sheet/pool and quarter-day browser regression |
| `test:dice-repair` | Passed integrated character-sheet rolling/pushing, locked faces, atomic consequences, Recent Dice Rolls and independent quarter-day regression |

Both actual supplied fifth-printing books were available and tested through extraction/indexing/retrieval: Player’s Handbook, 212 pages/243 chunks as Public Rules; Gamemaster’s Guide, 268 pages/373 chunks as GM Only. The updated real-book declaration test verifies the evidenced 7-die preparation reaches the guarded roll request without Equipped, while the saved two-success roll still reaches the narrator with the official ranged procedure. Numerical weapon/success-count/evidence and source-permission regressions remain intact. Books/full extracts/private databases are not committed.

New unit tests exercise the exact named declaration, conjugations and trailing question; negative/hypothetical/other-actor forms; zero, missing, blank and positive arrows; no hostile unrolled text emitted or persisted; successful submitted attack and replay; matched/unmatched zero-success results; zero/unrecorded torches; Manipulation association; no mechanical writes; and preserved background lookup/ordinary narration. Existing push tests still inspect all saved consequences and ensure no repeated application. A qualified “Do not roll for me” declaration also verifies that existing character authorization cannot be bypassed to read resource values, and rejection saves no request or campaign change.

The browser acceptance test checks actual rendered desktop/mobile height, bounded long-draft expansion, Enter/Shift+Enter, clear-after-send, selection of another character, Send visibility, the latest response's visibility, named declarations, actual saved roll submissions, resource distinctions, Manipulation, retained dice details, scene/background continuity and unchanged mechanical state. Screenshots were inspected locally; fixtures/images are not committed.

Existing tests that previously expected an API call for an unrolled attack now inspect its actual saved preparation/context and application response. Hosted ownership, different characters' 7/8-die pools, public redaction, push consequences and zero-write assertions remain; no synthetic model call is substituted for the guarded response.

## Files

| Area | Files relative to `ravenland/` |
| --- | --- |
| Declaration/stage safeguards | `src/lib/rules/action-declaration.ts`, `src/server/ai/action-safeguard.ts` |
| Existing preparation/context/retrieval integration | `src/lib/rules/planner.ts`, `src/server/action-preparation.ts`, `src/server/resource-awareness.ts`, `src/server/ai/context.ts`, `src/server/ai/service.ts`, `src/server/sourcebooks/retrieval.ts` |
| Roll matching, protected policy and diagnostics | `src/server/dice/gm-submission.ts`, `src/server/ai/instructions-v1.ts`, `src/app/api/ai/context/route.ts` |
| Composer | `src/components/campaign-app.tsx`, `src/app/globals.css` |
| New tests and command | `tests/action-safeguards.test.ts`, `tests/action-safeguards-browser.cjs`, `package.json` |
| Existing regressions | `tests/ai-canon.test.ts`, `tests/character-awareness.test.ts`, `tests/gm-situation.test.ts`, `tests/gm-situation-browser.cjs`, `tests/local-character-awareness-browser.cjs`, `tests/character-preparation-browser.cjs`, `tests/roll-gm.test.ts`, `tests/roll-gm-browser.cjs`, `tests/real-sourcebooks.integration.ts` |
| Documentation | `README.md`, this report, supersession note in `docs/gm-situational-awareness.md` |

## Preview and limits

Run `npm run dev` from `ravenland/`, open loopback and choose ACTING AS. Declare a Longbow action with a tracked resource recorded as zero, blank or positive. After the requested sheet roll/push, submit its saved result through Recent Dice Rolls. Try a long draft, Shift+Enter, character selection and a narrow viewport. No extra local player login or new equipment checkbox is required.

The application guard is a bounded recognizer for the supported declaration/skill patterns, not a complete natural-language action or combat engine. Unrecognized/ambiguous prose still uses the existing protected GM policy and may need clarification; unusual phrasing, multiple simultaneous actions and implicit resource-supply claims are not fully modeled. Generic mechanical examples and official numerical questions retain their existing retrieval/validation path. This task does not prove live-model narration quality after a positive submission; controlled providers verify the actual data flow and application boundaries.

Preparation remains limited where previously unsupported. Availability checks cover the four existing tracked resources; arbitrary gear prose does not establish a general consumable rules engine. No NPC combat, automatic opposed checks, force march, journey automation, image integration, authentication redesign or autonomous inventory management was added. No attributes, supplies, Willpower, conditions, injuries, location, clock, Journal or approved campaign canon are changed by these responses. Only intended chat/request records and existing dice submission receipts/status are saved.
