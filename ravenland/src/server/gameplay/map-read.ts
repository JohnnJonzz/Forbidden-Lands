import { getGameplayRepository } from "./runtime";
import {
  gameplayPrincipal,
  requestPrincipal,
  mayReadCharacter,
} from "../character-access";
import { isTrustedLocalRequest } from "../local-play";
import { gameplayView } from "./service";
export function requirePhase7MapRead(request: Request, id: string) {
  if (!process.env.RAVENLAND_PHASE7_PROFILE) return;
  const repo = getGameplayRepository(),
    p = requestPrincipal(request),
    actor =
      repo
        .get(id)
        ?.session.characters.find(
          (c) =>
            isTrustedLocalRequest(request) || mayReadCharacter(p, id, c.id),
        )?.id ?? "";
  const v = gameplayView(
    repo,
    id,
    actor,
    gameplayPrincipal(request, id, actor),
  );
  if (new URL(request.url).searchParams.get("view") === "gm" && !v.isTableGM)
    throw Error("Table GM access required for the full map.");
}
