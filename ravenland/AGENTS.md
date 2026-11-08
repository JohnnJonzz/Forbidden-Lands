<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Real PDF retrieval regression checks

For changes to PDF extraction, source search, retrieval planning, evidence coverage, or context selection, run `npm run test:retrieval-check` with the actual private fifth-printing PDFs before reporting the change ready to merge. See `tests/fixtures/private-sourcebooks/README.md` for `RAVENLAND_REAL_SOURCEBOOK_DIR` and the separate real-PDF command. Synthetic tests are additional coverage, not a replacement for the real suite.

If private fixtures are unavailable, continue independent implementation/checks but report real-PDF validation as BLOCKED or SKIPPED; do not claim PDF retrieval is fixed. Never commit the books, full extracted text, private database fixtures, or source-body snapshots. Use only isolated temporary test databases and preserve the live campaign and its source visibility.
