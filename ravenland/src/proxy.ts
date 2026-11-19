import { NextResponse, type NextRequest } from "next/server";
import { authorizeMutationRequest } from "./server/mutation-authority";
import { AIError } from "./server/ai/config";
export function proxy(request: NextRequest) {
  try {
    authorizeMutationRequest(request);
    return NextResponse.next();
  } catch (error) {
    const e =
      error instanceof AIError
        ? error
        : new AIError("mutation_denied", "Mutation authorization failed.", 403);
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status },
    );
  }
}
export const config = { matcher: "/api/:path*" };
