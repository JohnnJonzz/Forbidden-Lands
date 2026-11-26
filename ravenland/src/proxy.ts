import { inspectPdfUploadHeaders } from "./lib/sourcebook-upload-limits";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeMutationRequest } from "./server/mutation-authority";
import { AIError, requireGM } from "./server/ai/config";
export function proxy(request: NextRequest) {
  try {
    authorizeMutationRequest(request);
    if (
      request.method === "POST" &&
      request.nextUrl.pathname === "/api/sourcebooks" &&
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() === "application/pdf"
    ) {
      requireGM(request.headers.get("x-ravenland-gm-token"));
      const size = inspectPdfUploadHeaders(request.headers);
      if (!size.ok)
        throw new AIError("pdf_upload_size", size.error, size.status);
    }
    return NextResponse.next();
  } catch (error) {
    const e =
      error instanceof AIError
        ? error
        : new AIError("mutation_denied", "Mutation authorization failed.", 403);
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
export const config = { matcher: "/api/:path*" };
