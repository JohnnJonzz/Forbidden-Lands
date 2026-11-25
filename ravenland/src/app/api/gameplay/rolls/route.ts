import { NextResponse } from "next/server";
import { getGameplayRepository } from "@/server/gameplay/runtime";
import {
  gameplayPrincipal,
  requireCharacterAccess,
} from "@/server/character-access";
import { mutationDenial } from "@/server/mutation-authority";
import { rollCommandSchema } from "@/lib/gameplay-rolls";
import { executeRoll, rollQueueView } from "@/server/gameplay/roll-engine";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      id = q.get("campaignId") ?? "",
      actor = q.get("actorId") ?? "";
    requireCharacterAccess(gameplayPrincipal(request, id, actor), id, actor);
    return NextResponse.json(rollQueueView(getGameplayRepository(), id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Queue unavailable" },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  const denied = mutationDenial(request);
  if (denied) return denied;
  try {
    const c = rollCommandSchema.parse(await request.json());
    return NextResponse.json(
      executeRoll(
        getGameplayRepository(),
        c,
        gameplayPrincipal(request, c.campaignId, c.actorId),
      ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dice operation failed" },
      { status: 409 },
    );
  }
}
