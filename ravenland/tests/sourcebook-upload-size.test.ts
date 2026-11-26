import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { FileSourcebookStorage } from "../src/server/sourcebooks/storage";
import {
  sourcebookUploadBytes,
  sourcebookProxyBytes,
  inspectPdfUploadHeaders,
  MEBIBYTE,
} from "../src/lib/sourcebook-upload-limits";
import { sourcebookResponse } from "../src/lib/sourcebook-upload-response";
import nextConfig from "../next.config";
const { pdf } = createRequire(import.meta.url)(
  "./fixtures/sourcebook-pdf.cjs",
) as { pdf: (pages: string[][]) => Buffer };
const bytes = pdf([["Original synthetic upload-size fixture."]]);
const stream = (data: Buffer) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "raven-size-")),
    storage = new FileSourcebookStorage(dir);
  return {
    dir,
    storage,
    close() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Next proxy has a bounded replay limit above the actual PDF limit", () => {
  assert.equal(sourcebookUploadBytes("64"), 64 * MEBIBYTE);
  assert.equal(sourcebookProxyBytes("64"), 65 * MEBIBYTE);
  assert.equal(sourcebookUploadBytes("9999"), 256 * MEBIBYTE);
  assert.equal(sourcebookProxyBytes("9999"), 257 * MEBIBYTE);
  assert.equal(sourcebookUploadBytes("invalid"), 64 * MEBIBYTE);
  assert.equal(sourcebookUploadBytes("0"), MEBIBYTE);
  assert.equal(
    nextConfig.experimental!.proxyClientMaxBodySize,
    sourcebookProxyBytes(),
  );
});
test("header preflight accepts exact bound, rejects larger sizes and detects incomplete declarations", () => {
  assert.deepEqual(
    inspectPdfUploadHeaders(
      new Headers({ "content-length": String(64 * MEBIBYTE) }),
    ),
    { ok: true, expectedBytes: 64 * MEBIBYTE },
  );
  const big = inspectPdfUploadHeaders(
    new Headers({ "content-length": String(64 * MEBIBYTE + 1) }),
  );
  assert.equal(big.ok, false);
  if (!big.ok) {
    assert.equal(big.status, 413);
    assert.match(big.error, /64 MB/);
  }
  for (const value of ["-1", "NaN", "1.5", "Infinity", "9007199254740992"]) {
    const r = inspectPdfUploadHeaders(
      new Headers({ "x-ravenland-upload-size": value }),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  }
  assert.equal(
    inspectPdfUploadHeaders(
      new Headers({
        "content-length": "100",
        "x-ravenland-upload-size": "101",
      }),
    ).ok,
    false,
  );
  const missing = inspectPdfUploadHeaders(new Headers());
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 411);
  assert.deepEqual(
    inspectPdfUploadHeaders(new Headers({ "x-ravenland-upload-size": "123" })),
    { ok: true, expectedBytes: 123 },
  );
});
test("complete bytes are verified before atomic private storage, with original SHA-256", async () => {
  const f = fixture();
  try {
    const key = randomUUID() + ".pdf",
      saved = await f.storage.put(
        key,
        stream(bytes),
        bytes.length,
        bytes.length,
      );
    assert.equal(saved.size, bytes.length);
    assert.equal(
      saved.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.deepEqual(readFileSync(join(f.dir, key)), bytes);
    assert.equal(readdirSync(f.dir).length, 1);
  } finally {
    f.close();
  }
});
test("a PDF with an EOF marker still rejects truncation against declared length and leaves no file", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.storage.put(
        randomUUID() + ".pdf",
        stream(bytes),
        100000,
        bytes.length + 100,
      ),
      /incomplete/,
    );
    assert.deepEqual(readdirSync(f.dir), []);
  } finally {
    f.close();
  }
});
test("interrupted streams clean partial files and return an upload-specific error", async () => {
  const f = fixture();
  try {
    let pulls = 0;
    const interrupted = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulls++ === 0) c.enqueue(bytes.subarray(0, 50));
        else c.error(Error("connection reset"));
      },
    });
    await assert.rejects(
      f.storage.put(randomUUID() + ".pdf", interrupted, 100000, bytes.length),
      /interrupted/,
    );
    assert.deepEqual(readdirSync(f.dir), []);
  } finally {
    f.close();
  }
});
test("actual streamed bytes enforce the limit even if the size declaration is false", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.storage.put(
        randomUUID() + ".pdf",
        stream(bytes),
        bytes.length - 1,
        bytes.length - 1,
      ),
      (e: any) => e.status === 413 && /limit/.test(e.message),
    );
    assert.deepEqual(readdirSync(f.dir), []);
    await assert.rejects(
      f.storage.put(
        randomUUID() + ".pdf",
        stream(Buffer.alloc(100)),
        100000,
        100,
      ),
      /PDF header/,
    );
    assert.deepEqual(readdirSync(f.dir), []);
  } finally {
    f.close();
  }
});
test("library UI receives readable HTTP and non-JSON proxy failures rather than parser exceptions", () => {
  assert.throws(
    () => sourcebookResponse("<html>body too large</html>", 413),
    /HTTP 413/,
  );
  assert.throws(
    () =>
      sourcebookResponse(
        JSON.stringify({
          error: "PDF exceeds the configured upload limit of 64 MB.",
        }),
        413,
      ),
    /64 MB/,
  );
  assert.deepEqual(sourcebookResponse('{"documents":[]}', 200), {
    documents: [],
  });
});
