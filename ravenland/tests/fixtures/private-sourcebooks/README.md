# Private real-sourcebook fixtures

Do not commit licensed PDFs or extracted text. This directory is ignored except for this README.

Supply your legitimate fifth-printing copies with these exact filenames:

- `Forbidden_Lands_Players_Handbook_5th_printing.pdf`
- `Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf`

You can instead keep them outside the repository, for example `/tmp/ravenland-private-sourcebooks`, and set `RAVENLAND_REAL_SOURCEBOOK_DIR` for the test command. The attached copies used for development were placed there, not here.

From `ravenland/`:

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:real-sourcebooks
```

The command uses the actual application upload/extraction/indexing/retrieval code and an isolated temporary SQLite database. It cleans up its copied files/database, makes no external AI call, and never changes the live campaign or its permissions. A capture-only provider checks the final context without contacting OpenAI. Output contains test names, counts, source/chunk IDs and page references only, never full extracted text or private encounter content.

Missing/unreadable fixtures produce an explicit SKIP. For a required pre-merge check use `npm run test:real-sourcebooks:required`: missing fixtures then fail the command. `npm run test:retrieval-check` runs synthetic/unit tests followed by the required real-PDF suite. A skipped real suite is not evidence that PDF retrieval works. Supply the fixtures on the machine performing the merge check; no workflow uploads them to GitHub.
