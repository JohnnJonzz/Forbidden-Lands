// Shared by Next configuration, proxy preflight and private PDF storage.
export const MEBIBYTE = 1024 * 1024;
export function sourcebookUploadBytes(
  value = process.env.RAVENLAND_SOURCEBOOK_MAX_MB,
) {
  const parsed = Number(value ?? 64);
  return Math.floor(
    Math.max(1, Math.min(256, Number.isFinite(parsed) ? parsed : 64)) *
      MEBIBYTE,
  );
}
// The current upload is raw application/pdf (not multipart). Keep bounded
// transport headroom without increasing the allowed PDF file size.
export function sourcebookProxyBytes(
  value = process.env.RAVENLAND_SOURCEBOOK_MAX_MB,
) {
  return sourcebookUploadBytes(value) + MEBIBYTE;
}
export function pdfSizeMessage(limit = sourcebookUploadBytes()) {
  return `PDF exceeds the configured upload limit of ${limit / MEBIBYTE} MB (${limit} bytes). Choose a smaller PDF.`;
}
export function inspectPdfUploadHeaders(
  headers: Headers,
):
  | { ok: true; expectedBytes: number }
  | { ok: false; status: 400 | 411 | 413; error: string } {
  const values = [
    headers.get("content-length"),
    headers.get("x-ravenland-upload-size"),
  ].filter((v): v is string => v !== null);
  if (!values.length)
    return {
      ok: false,
      status: 411,
      error:
        "PDF upload size is required. Retry through the Sourcebook Library, or send Content-Length or x-ravenland-upload-size.",
    };
  if (values.some((v) => !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))))
    return {
      ok: false,
      status: 400,
      error: "Invalid PDF upload size. Retry uploading the original file.",
    };
  const sizes = values.map(Number);
  if (sizes.some((n) => n > sourcebookUploadBytes()))
    return { ok: false, status: 413, error: pdfSizeMessage() };
  if (sizes.some((n) => n !== sizes[0]))
    return {
      ok: false,
      status: 400,
      error:
        "The PDF upload size headers disagree. Retry uploading the original file.",
    };
  return { ok: true, expectedBytes: sizes[0] };
}
