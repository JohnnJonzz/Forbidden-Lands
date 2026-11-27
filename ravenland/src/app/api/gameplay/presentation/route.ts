import { getGameplayRepository } from "@/server/gameplay/runtime";
import { gameplayPrincipal } from "@/server/character-access";
import { gameplayView } from "@/server/gameplay/service";
import { privateCharacterRecord } from "@/server/creatures/context";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      id = q.get("campaignId") ?? "",
      actor = q.get("actorId") ?? "",
      repo = getGameplayRepository();
    gameplayView(repo, id, actor, gameplayPrincipal(request, id, actor));
    return Response.json(privateCharacterRecord(request, repo.get(id)!), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }
}
