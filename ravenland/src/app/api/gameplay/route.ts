import { NextResponse } from "next/server";
import { getGameplayRepository } from "@/server/gameplay/runtime";
import {
  gameplayPrincipal,
  mayReadCharacter,
  requestPrincipal,
} from "@/server/character-access";
import { isTrustedLocalRequest } from "@/server/local-play";
import { mutationDenial } from "@/server/mutation-authority";
import { gameplayCommandSchema } from "@/lib/gameplay";
import { executeGameplay, gameplayView } from "@/server/gameplay/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      id = q.get("campaignId") ?? "",
      repo = getGameplayRepository(),
      r = repo.get(id);
    if (!r) throw Error("Campaign not found.");
    const authenticated = requestPrincipal(request),
      actor =
        q.get("actorId") ??
        r.session.characters.find(
          (c) =>
            isTrustedLocalRequest(request) ||
            mayReadCharacter(authenticated, id, c.id),
        )?.id ??
        "";
    return NextResponse.json(
      gameplayView(repo, id, actor, gameplayPrincipal(request, id, actor)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Activity unavailable" },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  const denied = mutationDenial(request);
  if (denied) return denied;
  try {
    const c = gameplayCommandSchema.parse(await request.json());
    return NextResponse.json(
      executeGameplay(
        getGameplayRepository(),
        c,
        gameplayPrincipal(request, c.campaignId, c.actorId),
      ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Declaration failed" },
      { status: 400 },
    );
  }
}
