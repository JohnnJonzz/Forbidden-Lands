# Phase 7.0B.2 — Familiar interface and repeatable synthetic testing

## 1. Branch and change

Branch: `feature/phase-7-narrative-gm`. Starts at the upload hotfix `6a676d4edec264d76c6eaa7d65092c3971145fdd`. The completion message links the pushed change commit. This milestone restores the game dashboard while retaining Phase 7 planning, saved-roll bindings and deterministic mechanics.

## 2. Preserved Phase 6 references

Both `ravenland-ai-gm-prototype` and `archive/phase-6-baseline` remain at `41a274aeb15e66aeb86c7eff3f4a8322084fa15d`. No merge, rebase, reset, force push or live Ravenland Mysteries operation is involved. Destructive acceptance cases use disposable profiles.

## 3. Shared presentation

`CampaignHeader` is extracted from the original CampaignApp and used by both controllers. Phase 7 reuses `Sidebar`, `CharacterAvatar`, `HexMap`, `SheetEmbed` and `SourcebookLibraryPanel`, with the existing global dark fantasy typography, header, navigation, sidebar, conversation and composer classes. The legacy CampaignApp is not mounted by the Phase 7 route.

Characters open the existing sheets in dedicated windows, including inventory, equipment and resource controls. Map, Journal/history, roster, current Journey Settings and retained campaign settings are accessible from navigation. Unsupported campaign setting mutations are withheld.

## 4. Phase 6 authority stays disabled

The existing enrollment and mutation boundaries continue to reject legacy journey submissions, Quarter-Day completion, conversational travel, old GM orchestration, encounters and legacy dice writes. The reused sidebar omits its legacy time-status controller. Read-only map mode disables travel, fog writes, calibration and location editing. Profile map reads require authenticated character access; full-map reads require the actual Table GM. Character saves skip legacy combat reconciliation for enrolled campaigns.

The presentation endpoint authenticates through `gameplayView`, then uses the existing private-character projection. It does not call a normalization, synchronization, activity creation or completion service. Map reference import happens only in the explicit upgrade command; it imports missing workbook geography and checksum-matching reviewed calibration without changing campaign state or replacing existing geography.

## 5. Conversation

The familiar conversation and composer call the Phase 7 adapter. Supported declarations dispatch to the same `executeGameplay` operation as the planner. Status answers describe the current clock, outstanding decisions and saved verified mechanical summaries. Unsupported completion/travel/encounter/combat requests leave Evening open and explain the milestone boundary.

## 6. AI and deterministic behavior

Simple declarations, status requests, dice operations, polling and refresh do not call OpenAI. When server OpenAI credentials are configured, narrative questions and less literal stationary intentions can use the existing OpenAI SDK and server model/timeout configuration. The provider exposes only `plan_stationary_activity`; returned assignments must pass strict schema, actual-party, revision, clock and epoch checks in the deterministic service. Narration cannot directly write mechanics. Unsupported transition/outcome language is screened, with an application clarification fallback.

Only bounded current clock, public party identity, assignments and blockers enter this adapter's model context. It does not route through the Phase 6 AI controller or send private sourcebook bodies/backstories. Conversation receipts avoid repeating completed requests. A request interrupted while the provider was in flight can remain marked processing; refresh to inspect saved state before submitting a new message. A provider failure is visible, and the deterministic declaration/planner remains available.

A controlled response was exercised through the real OpenAI SDK transport and typed tool dispatch. **No live paid OpenAI call was made.** Provider prose screening is a bounded safeguard, not proof that arbitrary model wording can never be inaccurate.

## 7. Roll queue

Pending Rolls sits in the conversation flow. Resolved rows collapse into **Resolved rolls** on the dashboard; sheets retain their full roll controls. Binding IDs, revisions, source/chunk references, audit records and the JSON packet remain under collapsed **Advanced Diagnostics**. Existing Push/Keep, talent, artifact, forage target, source recheck and miscellaneous sheet dice operations remain in the Phase 7 service.

## 8. Activity revision

**Development Testing → Revise Activity Plan** opens the same planner in explicit revision mode. Before any saved dice, the actual Table GM may update the same activity ID with an increased revision. The old plan and queue are archived, old requests are superseded and fresh request IDs are generated once. Retrying the same command returns its receipt.

Any saved activity dice, including previously superseded bindings, prevent revision. The response explains the alternatives: retain results, review a binding correction or explicitly reset the synthetic test. Revision never discards Push consequences or borrows old rolls.

## 9. Synthetic reset

Development Testing is available only to the actual Table GM in the explicitly enrolled synthetic profile. Reset is not an ordinary character capability, a display-name claim, a GM-token-only permission or a production-mode shortcut.

Reset preview identifies the campaign, run, checkpoint, current dice count and replacement fixture. Confirmation archives the full session and campaign-scoped related rows, supersedes old requests, deactivates old bindings, restores the checkpoint session, clears the current activity pointer and creates a new test-run identity in one SQLite transaction. The campaign ID stays the same. A new plan can be declared immediately.

## 10. Checkpoint and audit semantics

Migration does **not** mark the current saved test as pristine. No initialization snapshot was previously recorded, so the first reviewed operation is **Create Fresh Synthetic Test Baseline**. It archives the existing plan, original/pushed dice and character state before explicitly establishing the known fixture:

- 13th Springrise, 1165; Evening; V09; Dark Forest; Clear synthetic starting condition.
- Grogahx, Edrus, Elyanna and Rose Underbough in their original synthetic roles.
- Current and regular attributes 3; Willpower 3; Survival/Scouting 1; Food/Water D8; empty synthetic gear, weapons and talents.
- No active test plan, dice, injuries, camp, permanent activity effects or completed quarter.

Existing portrait references and campaign name are retained as reference/presentation data. Sourcebooks, complete private PDF files, indexed evidence, assets, player grants and GM configuration are not deleted or replaced. The saved checkpoint is reused by later **Reset Test Quarter** operations. Prior runs remain archived; active saved dice are cleared together with their character consequences.

The archive includes actor, timestamp, prior run and complete prior state. An old operation ID or stale run is rejected **before** planning/roll receipt lookup. Sheet edits also require the current run. A stale sheet cannot silently fetch a new run and roll into it. Reset itself cannot be replayed into the new run. An uncertain reset response requires refreshing and reviewing the current run before trying again.

Later Phase 7 schemas must supply a reviewed restoration adapter before reset is enabled. This fails closed rather than partially clearing future encounter/time state.

## 11. Existing-profile migration

`phase7:upgrade` applies additive migration `003_test_runs` explicitly and idempotently after the existing roll-queue migration. It creates run, checkpoint/archive and conversation-receipt tables. It replaces the old lifetime-per-quarter unique index with transactional current-activity ownership so historical quarters from archived runs are retained. It never resets the session or creates a checkpoint automatically.

Old 7.0A/7.0B profiles can still be read without migration. The new testing features require the explicit upgrade. After upgrading, refresh all old tabs so their commands include the run identity. Do not rerun setup.

The backup command now accepts `--directory` to read all existing storage paths from the manifest, avoiding manual JSON quoting on Windows. Its original database/assets interface remains supported.

## 12. Preservation

Tests simulate the existing Windows case: Elyanna Keep Watch with original and pushed dice, an indexed GM Only original Handbook, and a saved Evening plan. Migration and read-only page visits retain its exact session/revision. Post-roll revision is rejected. Explicit reset archives that state and restores the fixture. Separate checks compare actual private PDF and portrait bytes before/after reset and verify stale sheet rejection. The CLI backup/upgrade test preserves an existing activity across two upgrades.

The installed Windows profile itself is not accessible from this cloud machine; its preservation is verified with these disposable upgrade fixtures. The existing cloud profile is not reset or adopted into a new campaign.

## 13. Screenshots

- [Desktop dashboard](phase7-0b2-screenshots/phase7b2-desktop.png)
- [Read-only map at V09](phase7-0b2-screenshots/phase7b2-map.png)
- [Mobile sidebar](phase7-0b2-screenshots/phase7b2-mobile.png)
- [Mobile conversation](phase7-0b2-screenshots/phase7b2-mobile-conversation.png)

## 14. Validation

Completed validation: **all passed** — 608 general regressions, 289 actual-PDF tests, 20 planning tests, 21 roll tests, 10 focused B.2 integration tests, all five Chromium browser suites below, typecheck and production build. The general suite includes existing Phase 6 calendar, injury, journey, character and combat coverage. Coverage includes:

| Check | Scope |
|---|---|
| `test:gameplay` | Existing planning/isolation suite |
| `test:gameplay-rolls` | Existing dice rules and original-Handbook integration |
| `test:gameplay-interface` | 10 focused preservation, revision, reset, epoch, private asset, future-schema, CLI and controlled AI tests |
| `test:retrieval-check` with actual private fixture directory | General Phase 6/7 regressions plus required original fifth-printing PDF pipeline |
| `test:gameplay:browser` | Existing planning, desktop/mobile, reload and restart |
| `test:gameplay-rolls:browser` | Existing actual sheet controls, five linked rolls, mishap and duration, mobile/restart, no permanent injury |
| `test:sourcebook-upload:browser` | Actual 15,872,068-byte Handbook upload/index, complete-byte hash, 212 pages, visible failures, limit/auth/private/restart and source rechecks |
| `test:gameplay-interface:browser` | Familiar UI, map/Journal/roster/sheet, old Push preservation, explicit reset, new plan/revision, stale request, editable sheet field, mobile, refresh/restart |
| `test:gameplay-interface:security-browser` | Actual hosted ordinary-player denial, no-credential denial and real Table GM assignment |
| `typecheck`, `build` | TypeScript and production compilation |

The browser harnesses use real Chromium, not rendered-component mocks. The planning and dashboard browser tests explicitly reopen a tab across dev-server HMR teardown; their saved activity, run and session assertions remain intact. The upload browser follows the restored Rules Library navigation and returns to Conversation to recheck requests.

## 15. Security and stale requests

Authenticated ordinary players cannot see or invoke Development Testing. Unauthenticated reads fail. Actual Table GM assignment enables a preview. Wrong campaign/profile, absent/stale epoch, changed preview and post-roll revision are rejected. Legacy mutators remain blocked. Read-only map/Journal/sheet visits do not create a plan or alter saved dice. Tests assert no legacy GM/journey/combat/Quarter-Day controller requests from the restored dashboard.

## 16. Remaining scope limits

No 7.0C Quarter-Day completion or permanent activity application, 7.0D encounter system or 7.0E travel is implemented. Prepared Watch successes are not an established encounter/detection result. Injury duration results remain pending. Campaign settings are shown safely; unsupported old administrative mutations remain unavailable. Live-provider narrative quality has not been tested with a paid request. Windows commands are provided for the existing installation; automated execution here uses Linux and Chromium.

## 17. Exact Windows update procedure

Stop the existing development server with **Ctrl+C**. Open PowerShell. Replace **only** the two example paths with your real checkout and existing Phase 7 profile directory:

```powershell
$Checkout = 'C:\path\to\Forbidden-Lands'
$Profile = 'C:\path\to\phase7-development'
Set-Location $Checkout
git status --short
git switch feature/phase-7-narrative-gm
git pull --ff-only origin feature/phase-7-narrative-gm
Set-Location (Join-Path $Checkout 'ravenland')
npm ci
$Backup = "$Profile-backup-before-7b2-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
npm run phase7:backup -- --directory $Profile --output $Backup --quiesced
npm run phase7:upgrade -- --directory $Profile
npm run dev:phase7 -- --directory $Profile --port 3000
```

If `git status` shows your own edits or a command fails, preserve those edits/data and resolve that error before continuing. Do not reset Git, delete the profile or run setup. Backup must finish before upgrade. A successful first upgrade reports `testRuns.version: "7.0B.2"`, `applied: true`, `checkpointCreated: false`, `campaignChanged: false`; rerunning reports `applied: false`. The optional map result describes only reference geography availability/import.

Open **http://127.0.0.1:3000** and press **Ctrl+F5**. Reload existing character windows too. The same campaign and old Elyanna dice should be present. The existing indexed Handbook remains indexed: no re-upload or administrator token recreation is needed. Rules Library uses your existing sourcebook administrator token when you choose to administer it.

To repeat the synthetic test:

1. Open **Conversation → Development Testing**.
2. If no proven checkpoint exists, select **Create Fresh Synthetic Test Baseline**. Review the campaign and exact replacement fixture. Your old rolled state is preserved until you check the confirmation and select **Confirm Create Fresh Synthetic Test Baseline**.
3. After establishing that checkpoint, use **Reset Test Quarter** for subsequent repeats. Each reset archives the previous run and restores the same fixture.
4. Declare: “Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.” Use the character sheets for the requested rolls. Use **Revise Activity Plan** before rolling if you want different assignments.

Refreshing, reopening the app and restarting the server never authorize or perform a reset. This procedure does not touch Ravenland Mysteries.
