# Phase 7.0B.1 — sourcebook upload-size hotfix

Branch: `feature/phase-7-narrative-gm`. Base: `cef4ca395c57c55665b2732c7ea6ba324b463898` (7.0B). The implementation commit contains this report; the delivery message supplies its exact SHA and verified GitHub link.

## Root cause

The installed and locked Next.js version is **16.4.3**. `src/proxy.ts` matches `/api/:path*`, so Next automatically clones and buffers sourcebook request bodies before replaying them to the App Router route. With no application configuration, its `experimental.proxyClientMaxBodySize` defaults to **10 MiB**.

The installed documentation and `next/dist/server/body-streams.js` confirm that exceeding this limit logs `Request body exceeded 10MB`, ends the buffered body, and continues processing with only that partial body. It does not automatically return HTTP 413. The sourcebook route/storage subsequently rejected the truncated PDF with HTTP 400, even though the UI's independent file limit advertised 64 MB.

This was the Proxy replay limit, not a Pages Router `bodyParser` setting, Server Action limit, PDF.js page limit or sourcebook authentication failure.

## Configuration and upload behavior

`next.config.ts` now sets the supported `experimental.proxyClientMaxBodySize` from the same bounded size calculation used by sourcebook storage:

| Layer | Default bound |
| --- | --- |
| PDF file/storage/UI | 64 MiB = 67,108,864 bytes, advertised as 64 MB |
| Next Proxy replay buffer | 65 MiB = 68,157,440 bytes |

The current library sends **raw `application/pdf`**, not multipart. Its body is exactly the file bytes, so there is no multipart envelope to subtract. One MiB of bounded transport headroom keeps the framework ceiling above the file ceiling. Multipart requests receive a clear HTTP 415 rather than being parsed as JSON or silently accepted.

`RAVENLAND_SOURCEBOOK_MAX_MB` retains the existing bounded 1–256 MiB configuration. The Proxy ceiling follows it with 1 MiB headroom, up to 257 MiB. No limit is disabled. Existing route-level limits and authentication remain in place. If this variable is changed, rebuild/restart with the same setting so the compiled Proxy configuration and runtime file limit agree.

The raw upload endpoint now requires a size declaration through `Content-Length` or `x-ravenland-upload-size`; the library supplies its file size explicitly. Conflicting/invalid declarations return HTTP 400, a missing declaration HTTP 411, and a declared or streamed file above the configured file limit HTTP 413 with the actual limit in the message. The route also validates these headers independently of Proxy.

Storage still streams to a private temporary file, counts actual bytes, hashes them, validates the PDF header/trailer and atomically renames the file. It now verifies the final byte count against the declared size **before rename or document registration**. Interrupted or incomplete uploads remove partial files and return an upload-specific error. A PDF EOF marker alone cannot conceal a truncated transfer. Existing internal storage callers remain compatible with the optional expected-size parameter.

GM token authentication is checked before upload preflight and again in the route. Campaign checks, metadata validation, private/default visibility, UUID storage keys, safe path checks, SHA-based deduplication, PDF parsing and indexing restrictions are retained. No book is made Public Rules to make the engine work.

The UI displays HTTP/JSON errors and readable non-JSON proxy errors as library alerts. It checks the server-confirmed file size before requesting indexing. Indexing failures now produce a visible alert as well as the existing failed-document card/retry controls. It never announces a truncated upload as indexed.

## Acceptance evidence

The browser test used a **disposable SQLite backup of the existing isolated development campaign**, keeping its campaign ID `231b619c-afa5-4c77-b4fe-53dc90cb12e2`. It did not call campaign creation, `phase7:setup`, or replace the existing profile. The source profile was opened read-only and verified unchanged afterward. Ravenland Mysteries was not opened or modified.

Through the real Sourcebook Library UI and Next Proxy/route:

1. The original fifth-printing Player's Handbook uploaded all **15,872,068 bytes**, above the former 10 MiB boundary.
2. Before the UI's indexing request proceeded, the test compared the stored file size and SHA-256 with the original. They matched, as did the stored metadata.
3. The existing indexer produced **212 physical pages**, indexed chunks and `Rules` / `GM Only` metadata.
4. The Phase 7 rules engine retrieved that actual uploaded document's Foraging mishap, blunt critical and healing-unit evidence, including physical pages 154, 201 and 113. No metadata or book bytes were manually copied into the database.
5. **Recheck sheet and sources** changed all three missing-Handbook requests to `awaiting_roll` with source citations. The campaign remained in Evening.
6. A server restart and a fresh browser retained the complete file, its hash, indexed status and request state. Recheck also worked again after restart.

### Test results

- **12 focused tests passed**: seven size/completeness/response tests plus five existing sourcebook-library tests.
- **608 regression tests passed**, including existing Phase 6 workflows.
- **289 original-PDF tests passed**, with no skips or failures.
- Real Chromium upload acceptance passed: valid small PDF below 10 MiB; the original Handbook above 10 MiB/below 64 MiB; HTTP 413 above 64 MiB; visible client oversize rejection; malformed PDF indexing failure; interrupted upload cleanup; readable HTML/proxy rejection; GM authentication; private visibility; byte/hash completeness before indexing; engine metadata; source recheck and restart persistence.
- Typecheck and production build passed.

Browser execution used the managed Linux environment and Chromium, with the same Next development launcher. A native Windows run is not claimed; the update steps below apply the tested configuration to the existing Windows profile.

Commands:

```sh
npm run test:sourcebook-upload
npm run test:sourcebook-upload:browser
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
npm run typecheck
npm run build
```

The browser harness needs Playwright/Chromium and an existing empty-library development-profile snapshot. `RAVENLAND_UPLOAD_TEST_PROFILE` selects its manifest; `RAVENLAND_UPLOAD_TEST_HANDBOOK` selects the actual PDF, or `RAVENLAND_REAL_SOURCEBOOK_DIR` supplies the private fixture directory. All writes and the normal HTTP upload occur in the disposable backup. No private PDF, extracted text, database or administrator credential is committed.

## Exact Windows update procedure

**Use your existing Phase 7.0B profile. This hotfix requires no database migration and no new campaign. Do not run `phase7:setup` or rerun `phase7:upgrade` for this fix.**

1. Stop the current development server with **Ctrl+C**. The Next configuration must be loaded by a fresh server process.
2. Open PowerShell in your existing repository. Substitute your real checkout path in the first command:

```powershell
Set-Location 'C:\path\to\Forbidden-Lands'
git switch feature/phase-7-narrative-gm
git pull --ff-only origin feature/phase-7-narrative-gm
Set-Location ravenland
npm ci
node -p "require('next/package.json').version"
```

The locked version used for this fix is `16.4.3`. Preserve local edits if Git reports a conflict; do not reset or delete the profile to update code.

3. Restart with the **same existing profile directory**, replacing the example path:

```powershell
npm run dev:phase7 -- --directory 'C:\path\to\phase7-development' --port 3000
```

Keep its manifest, database, images, sourcebook directory and existing `.env.local`/GM token settings. The default `RAVENLAND_SOURCEBOOK_MAX_MB=64` needs no increase. A Next restart, rather than a new profile, activates the new 65 MiB replay buffer.

4. Open `http://127.0.0.1:3000` on that computer and refresh with **Ctrl+F5**. Open **Existing Rules Library administration**, enter the existing sourcebook administrator token, and select **Unlock Sourcebook Library**.
5. Choose the original Player's Handbook. Use title **Forbidden Lands Players Handbook**, category **Rules**, and retain **GM Only** visibility. Select **Upload and Index** and wait for **Indexed**. The tested original shows 212 physical PDF pages. Re-uploading identical complete bytes reuses the existing document; failed/incomplete transfers do not require manual database/file copying.
6. Return to **Pending Rolls**. Select **Recheck sheet and sources** for Make Camp, Forage and Watch requests that were blocked on missing Handbook evidence. They should show **awaiting roll** with source references.

For production `npm start`, run `npm run build` after updating and before restarting. This fix changes no Quarter-Day completion or permanent consequence behavior; those remain reserved for 7.0C.

## Changed files and compatibility

The hotfix adds the Next configuration and shared upload-limit/response helpers. It connects Proxy preflight, the sourcebook route, existing library/storage and UI size/error handling. Focused tests and this report accompany it. There are **no SQL migrations, profile rewrites, roll-engine rule changes, visibility changes or Phase 6 branch changes**. Existing stored PDFs and indexes remain usable.
