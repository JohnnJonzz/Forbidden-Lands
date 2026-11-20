import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteCampaignRepository } from '../src/server/sqlite';
import { initialSession } from '../src/lib/mock';
import { SourcebookLibrary } from '../src/server/sourcebooks/library';
import { FileSourcebookStorage } from '../src/server/sourcebooks/storage';
import { realActivityTests } from './quarter-activities-real';
test('Original fifth-printing quarter-day activities and consumption', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'raven-68b-source-')), repo = new SqliteCampaignRepository(join(dir, 'db.sqlite'));
    try {
        const r = repo.create(structuredClone(initialSession)), library = new SourcebookLibrary(repo, new FileSourcebookStorage(join(dir, 'books')));
        for (const [name, title] of [['Forbidden_Lands_Players_Handbook_5th_printing.pdf', 'Forbidden Lands Players Handbook'], ['Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf', 'Forbidden Lands Gamemasters Guide']]) {
            const bytes = readFileSync(join(process.env.RAVENLAND_REAL_SOURCEBOOK_DIR || '/tmp/ravenland-private-sourcebooks', name)), doc = await library.upload(r.id, { title, category: 'Rules', visibility: 'GM Only' }, name, new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }));
            await library.index(r.id, doc.document.id);
        }
        await realActivityTests(t, repo, r.id);
    }
    finally {
        repo.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
