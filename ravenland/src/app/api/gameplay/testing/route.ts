import { getGameplayRepository } from "@/server/gameplay/runtime";
import { gameplayPrincipal } from "@/server/character-access";
import { mutationDenial } from "@/server/mutation-authority";
import { resetPreview, resetTest } from "@/server/gameplay/test-runs";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      id = q.get("campaignId") ?? "",
      actor = q.get("actorId") ?? "";
    return Response.json(
      resetPreview(
        getGameplayRepository(),
        id,
        actor,
        gameplayPrincipal(request, id, actor),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }
}
export async function POST(request: Request) {
  const denial = mutationDenial(request);
  if (denial) return denial;
  try {
    const c = await request.json();
    return Response.json(
      resetTest(
        getGameplayRepository(),
        c,
        gameplayPrincipal(request, c.campaignId, c.actorId),
      ),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
