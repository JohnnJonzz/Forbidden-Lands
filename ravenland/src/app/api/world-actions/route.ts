import {mutationDenial} from '@/server/mutation-authority';
import { AIError } from "@/server/ai/config";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLocalRepository } from "@/server/sqlite";
import {
  gameplayPrincipal,
  requireCharacterAccess,
} from "@/server/character-access";
import { aiBody, aiFailure } from "@/server/ai/http";
import { worldCommandSchema } from "@/lib/world/schema";
import { worldContext } from "@/server/world/context";
import { dispatchWorldAction } from "@/server/world/dispatcher";
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
        context: worldContext(getLocalRepository(), campaignId, principal),
        localController: principal?.mode === "trusted-local",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return aiFailure(error);
  }
}
export async function POST(request: Request) {const denied=mutationDenial(request);if(denied)return denied;
  try {
    const c = worldCommandSchema.parse(await aiBody(request)),
      principal = gameplayPrincipal(request, c.campaignId, c.characterId);
    if (c.type === "propose")
      throw new AIError(
        "world_proposal",
        "NPC intentions are selected by the GM decision loop. Client commands can only adjudicate an existing proposal or reconcile historical narration.",
        403,
      );
    const event = dispatchWorldAction(c, getLocalRepository(), principal);
    return NextResponse.json({
      requestId: event.requestId,
      status: event.status,
      code: event.code,
      summary: event.summary,
      replayed: event.replayed ?? false,
    });
  } catch (error) {
    return aiFailure(error);
  }
}
