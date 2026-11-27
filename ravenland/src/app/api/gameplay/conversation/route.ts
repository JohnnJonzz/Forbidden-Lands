import { getGameplayRepository } from "@/server/gameplay/runtime";
import { gameplayPrincipal } from "@/server/character-access";
import { mutationDenial } from "@/server/mutation-authority";
import { converse } from "@/server/gameplay/conversation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = mutationDenial(request);
  if (denied) return denied;
  try {
    const c = await request.json();
    return Response.json(
      await converse(
        getGameplayRepository(),
        c,
        gameplayPrincipal(request, c.campaignId, c.actorId),
      ),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
