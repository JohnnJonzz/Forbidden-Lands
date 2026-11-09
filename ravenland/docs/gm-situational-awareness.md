# Phase 5: GM situational awareness

November 9, 2026 (America/Chicago).

## Findings and resulting behavior

These were application context defects, established by tracing the saved sheet through `characterAwareness`, `assembleContext` and `AIService`; they were not missing character records:

- Pride, Dark Secret and Relationships were behind an explicit keyword/thematic relevance gate. Hosted requests needed a field cue, and trusted local requests otherwise needed matching words. Omitted fields became an empty story object without an empty/unrecorded explanation. That policy conflicted with this phase's explicit instruction that these three fields are nonconfidential between players.
- Consumables were saved as strings in `Character.sheet['res-food'|'res-water'|'res-arrows'|'res-torches']`. The old projection recognized resource dice and explicit depletion but did not parse positive numeric quantities. Gear quantities were a separate, unconnected source. Thus recorded positive ammunition could appear unknown; missing fields had no action-specific interpretation.
- Campaign location/time, chat messages, approved GM Memory, Journal and saved AI request snapshots already existed, but no focused scene projection combined them. The most recent history window could lose the scene or NPC while retaining the roll request. Roll submission assembled context from a compact dice reference rather than the matched original declaration, so memory and Journal retrieval could also lose the subject.
- Pending-action matching used compatible declarations but not the GM's saved roll request. A declaration answered with a resource clarification could compete with a subsequent action for which the GM requested a roll.

Direct character-background lookups now report exact saved text through an application response with no paid model call. Generic questions such as “What is Pride?” retain the existing narrator/rules pipeline rather than being replaced with a character-sheet report. Recorded, empty and unrecorded fields are distinct. Narrative turns receive the active actor's bounded background without the former secrecy gate. Explicit requests can read other party members' three public background fields without granting access to their mechanical sheet. Player knowledge does not establish NPC or in-world character knowledge. Other private character memories and GM-only sources remain excluded.

Required, explicitly depleted resources prompt a shortage question; positive quantities and available resource dice permit proceeding without a reminder. Unknown values remain unknown and only warrant clarification when needed. These are narration instructions and read-only context, not equipment or inventory gates. A completed saved roll is interpreted without retroactively requiring another roll or rejecting it for depleted supplies.

## Existing records and context selection

There is no new campaign, NPC, character, inventory, scene or pending-action store, and no schema migration.

| Existing source | Use and authority |
| --- | --- |
| Campaign JSON in SQLite | Authoritative current hex, location, terrain, date, quarter and weather |
| Saved character sheet | Authorized active actor's recorded current/maximum attributes, Broken, skills, conditions, injuries, talents, equipment and consumables; no defaults invented |
| Chat and completed AI request snapshots | Current scene narration and linked declaration, with source message IDs and original location/time |
| GM Memory | Existing approved/corrected Party Known NPCs, quests and unresolved threads; canon outranks narration |
| Journal | Relevant structured/free-text entries, with existing rejection filters; unchanged text |
| Existing dice and AI request records | Server-verified successes, push consequences, finalized submission receipts, completed results and matched actions |

Context version 4 prioritizes current scene/action, active conditions and required resources, background/injuries, relevant recent events/threads, then pertinent older history. Selection is local and bounded; it makes no additional OpenAI calls.

- Ordinary history is eight messages of at most 900 characters; historical recall retains the prior fourteen-message/1,100-character bounds. The existing recap-specific transcript remains separate.
- The scene scans up to 100 completed request snapshots and recent narration, with a direct lookup for an older linked action. Excerpts pinned through existing context snapshots are revalidated against actual saved messages and evidence filters. Up to three narration excerpts of 1,200 characters are supplied. Snapshots from another location/date/quarter, rejected/unsupported historical guesses, Quarter-Day Controller messages, application-generated record reports and identified rules-reference answers are excluded from scene narration.
- The NPC view supplies at most six relevant approved records with the latest narrated mention and source ID. It explicitly warns that a mention or party roster alone does not prove presence; departures/deaths and corrected canon override older narration. Immediate threats/obstacles stay in source excerpts instead of becoming invented entity records.
- Current-scene retrieval supplements the existing action-based GM Memory query. Active NPC/quest/thread results take priority; IDs are deduplicated, with fifteen memories maximum and three thread summaries. Private, proposed, rejected and archived records do not become party-known canon.
- Journal selection uses meaningful action/scene words, excludes unrelated zero-match entries outside historical recall, and retains the existing three-entry/650-character bound.
- Only the active authorized actor supplies mechanical details. Narration carries the three background fields at up to 1,600 characters each, with truncation marked; rules-only turns omit irrelevant story fields. Explicit background lookup subjects are capped at four and expose those three fields only. Actor equipment is filtered to relevant/consumable rows (six), and weapons/talents retain their eight-row bounds.

Application facts, approved/corrected memories, player statements and unconfirmed AI narration keep separate authority labels. This change does not approve new narrative canon.

## Resources and roll continuity

Resource parsing distinguishes positive nonnegative integer counts, explicit `0`/`None`, blank/unrecorded/invalid values, and D6/D8/D10/D12 resource dice. D6 is the lowest tracked die, not six items. D8 food/water are available dice, not eight portions. For a missing/unknown dedicated field, one unambiguous exact-named gear row with a numeric quantity can supply availability; multiple matching rows remain unresolved. Dedicated fields take precedence. Gear units are preserved rather than converted or summed.

Action-specific attention currently covers arrows for bow shooting, lighting/using torches, eating food/rations and drinking water. Other recorded gear and quantities remain available as bounded context, but arbitrary consumables and implicit synonyms do not have a general rules-aware resource classifier.

The existing pending-action matcher still examines unconsumed, completed declarations for the same character, made before the saved roll. A compatible recorded GM roll request takes precedence over clarification-only declarations; an explicit different requested skill is excluded. One candidate links the original declaration and scene. Multiple eligible requested actions remain ambiguous and require a concise question. No guessed action is substituted. Saved submission matches remain pinned for retry, and existing idempotency/finalization protections remain intact.

## Example context

Abbreviated projection from the isolated Rust Ferry test fixture, not a new live campaign or invented production IDs:

```json
{
  "contextVersion": 4,
  "currentScene": {
    "location": {"name": "Rust Ferry", "source": "Current persisted campaign state"},
    "immediateAction": {"text": "I shoot the bandit with my longbow."},
    "narration": [{"text": "At Rust Ferry, Mara waits beside the mooring post. A bandit blocks the bridge and reaches for his knife.", "authority": "unconfirmed"}],
    "unresolvedThreads": [{"title": "Mara’s missing brother", "authority": "approved/corrected party-known memory"}]
  },
  "retrievalContext": {
    "actor": {
      "broken": {"status": true, "attributes": ["strength"]},
      "story": {
        "pride": "I never abandon a helpless traveler.",
        "darkSecret": "I deserted the mountain watch during a raid.",
        "relationships": "I trust Brom to watch my back."
      },
      "consumables": {
        "arrows": {"quantity": 12, "state": "available"},
        "food": {"resourceDie": "D8", "quantity": null}
      }
    }
  },
  "resourceAttention": {
    "phase": "declaration",
    "required": [{"resource": "arrows", "quantity": 12, "response": "proceed_without_reminder"}],
    "stateChangesPermitted": false
  }
}
```

For the later saved result, the existing `rollSubmission` contains its actual verified successes and match; `currentScene.immediateAction` remains the original declaration and `linkedAction` identifies the existing request. Optional successes remain unallocated. IDs and evidence references are retained in actual context but omitted from this example.

## Safety and verification

Read-only projections make zero database changes. Normal conversation still saves its intended messages, AI request/usage metadata and reviewed-proposal workflow. Submit to GM still finalizes the saved dice record and stores one receipt/reply. Tests compare complete session state excluding only intended chat and submission status fields, verifying that attributes, conditions, injuries, equipment, quantities, Willpower, location, clock, Journal and journey state do not change. Existing dice-system push consequences are neither removed nor applied again.

Hosted mechanical ownership, loopback-only trusted local play, GM review authorization, source permissions, official numerical evidence and scoped house-rule precedence are unchanged. Public saved-context previews also redact the new resource-attention block. The three explicitly public background fields are not treated as private character memory.

Executed checks (all passed, no skipped real-sourcebook tests):

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed production compilation and route generation |
| Required `test:retrieval-check` | 191 unit tests passed, including 12 new situation regressions; then 22 real-PDF TAP tests passed |
| Real PDFs before changes | Same 22-test real-sourcebook suite passed as the baseline |
| `test:gm-situation` | Saved/empty backgrounds, zero arrows/torches, positive arrows, D8 resources, scene/NPC/thread continuity, verified two-success roll linked to the later requested action, unchanged mechanics |
| `test:character-awareness` | ACTING AS, current/max/Broken/conditions/injuries, public backgrounds, resource context, loopback security and public diagnostic redaction |
| `test:roll-gm` | Push before submission, authoritative character/results, no repeated consequences, compact chat, refresh/restart, duplicate replay, forged totals and transient retry |
| `test:character-preparation` | Hosted scoped grants, unauthorized/forged/cross-campaign access, logout/restoration, verified different pools, advisory readiness and zero-write preparation |
| `test:retrieval-planner` | Rules diagnostics, source privacy, reference-only mode and unchanged mechanics |
| `test:ai` | Streaming, failure/retry, canon/memory review, usage, recap, in-flight sheet/pool preservation and quarter-day workflow |
| `test:dice-repair` | Character-sheet dice/push controls, locked faces, resource/gear consequences, Recent Dice Rolls and independent manual quarter-day submission |

Both actual supplied fifth-printing PDFs were available and extracted/indexed through the real pipeline in isolated stores: Player’s Handbook, 212 pages/243 chunks as Public Rules; Gamemaster’s Guide, 268 pages/373 chunks as GM Only. Existing evidence and mechanical regressions retain Longbow/Heavy Crossbow statistics, player-supplied success counts, bounded missing-evidence retrieval, official action economy and ownership-aware preparation. The actual-book Longbow declaration and verified dice submission tests still pass with no mechanical state change. Books/full extracts/private databases remain outside Git.

Browser tests use the actual application and official SDK transport with a controlled test provider, not paid OpenAI calls. Unit ambiguity tests verify both the ambiguous packet and the final clarification reply. Read-only context tests also compare SQLite `total_changes()` before/after assembly. No live campaign data was changed.

## Files changed

| Area | Files relative to `ravenland/` |
| --- | --- |
| Read-only character/resource projections | `src/server/character-background.ts`, `src/server/resource-awareness.ts`, `src/server/character-awareness.ts` |
| Scene selection, retrieval context and narration | `src/server/ai/situation.ts`, `src/server/ai/context.ts`, `src/server/ai/service.ts`, `src/server/ai/instructions-v1.ts` |
| Existing pending actions and public diagnostics | `src/server/dice/gm-submission.ts`, `src/app/api/ai/context/route.ts` |
| New regression coverage | `tests/gm-situation.test.ts`, `tests/gm-situation-browser.cjs`, `package.json` |
| Existing regressions updated for explicit public-background policy | `tests/character-awareness.test.ts`, `tests/character-preparation.test.ts`, `tests/retrieval-planner.test.ts`, `tests/real-sourcebooks.integration.ts`, `tests/local-character-awareness-browser.cjs`, `tests/roll-gm-browser.cjs` |
| Existing canon/privacy and controlled provider fixtures | `tests/ai.test.ts`, `tests/ai-canon.test.ts`, `tests/fixtures/ai-provider-preload.mjs` |
| Documentation | `README.md`, `docs/read-only-character-awareness.md`, this report |

## Remaining limits

No live campaign database or live paid-model conversation was attached. Controlled providers verify what the actual pipeline sends and saves; they do not prove a live model will follow every narration instruction. Mock mode remains a basic demo narrator. Saved private administrator instructions may still need manual review if they explicitly contradict this campaign's newer background policy; no administrator settings were overwritten.

Scene and pending-action recognition are bounded text/record heuristics, not a new semantic world-state engine. Legacy messages without location-stamped request metadata are marked unverified; explicit NPC presence is not authoritatively tracked. Very long scenes, unnamed NPCs, implicit declarations and unusual roll-request phrasing may need clarification or approved memory updates. Reuse the existing GM Memory review to establish important facts.

All three background fields are intentionally party-known for this campaign. Other character-private memories and GM-only documents remain protected. Trusted loopback play is not multiplayer authentication, and the application's earlier documented legacy-route authorization limits remain; no public authentication bypass was added. This task adds no autonomous combat, resource management, new dice UI, PDF indexing redesign, migration or external dependency.
