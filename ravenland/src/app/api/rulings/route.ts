import { mutationDenial } from "@/server/mutation-authority";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLocalRepository } from "@/server/sqlite";
import {
  gameplayPrincipal,
  requireCharacterAccess,
} from "@/server/character-access";
import { aiBody, aiFailure } from "@/server/ai/http";
import { rulingCommandSchema } from "@/lib/rulings/schema";
import { rulingContext, resolveRuling } from "@/server/rulings/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      campaignId = z.string().uuid().parse(p.get("campaignId")),
      characterId = z.string().min(1).parse(p.get("characterId")),
      principal = gameplayPrincipal(request, campaignId, characterId);
    requireCharacterAccess(principal, campaignId, characterId);
    return NextResponse.json(
      {
        rulings: rulingContext(getLocalRepository(), campaignId, principal),
        localController: principal?.mode === "trusted-local",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
export async function POST(request: Request) {
  const denied = mutationDenial(request);
  if (denied) return denied;
  try {
    const c = rulingCommandSchema.parse(await aiBody(request));
    return NextResponse.json(
      resolveRuling(
        c,
        getLocalRepository(),
        gameplayPrincipal(request, c.campaignId, c.characterId),
      ),
    );
  } catch (e) {
    return aiFailure(e);
  }
}
