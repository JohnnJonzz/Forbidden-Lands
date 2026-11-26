import { isTrustedLocalRequest } from "./local-play";
import {
  gameplayPrincipal,
  requestPrincipal,
  requireCharacterAccess,
  type CharacterPrincipal,
} from "./character-access";
import { isGM, AIError } from "./ai/config";
export function requireController(
  principal: CharacterPrincipal | null | undefined,
  campaignId: string,
) {
  if (
    principal?.mode !== "trusted-local" ||
    !principal.grants.some((g) => g.campaignId === campaignId)
  )
    throw new AIError(
      "gm_authority",
      "This protected ruling requires the trusted local controller. Hosted character access does not confer a GM role.",
      403,
    );
  return { kind: "human_controller" as const, id: principal.playerId };
}
export function requireControllerRequest(
  request: Request,
  campaignId: string,
  characterId?: string,
) {
  const p = gameplayPrincipal(request, campaignId, characterId ?? "controller");
  requireController(p, campaignId);
  return p!;
}
const playerPaths = new Set([
  "/api/gm",
  "/api/dice",
  "/api/characters",
  "/api/creatures",
  "/api/activities",
  "/api/quarter-resolution",
  "/api/continuity",
  "/api/environment",
  "/api/calendar",
  "/api/characters/prepare",
  "/api/gm/rolls",
  "/api/combat/prepare",
  "/api/world-actions",
  "/api/consequences",
  "/api/rulings",
  "/api/ai/actions",
]);
// Fail closed for every mutating API path, including newly added routes.
export function authorizeMutationRequest(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (isTrustedLocalRequest(request)) return;
  const path = new URL(request.url).pathname;
  if (path === "/api/player-access") return;
  if (playerPaths.has(path)) {
    if (!requestPrincipal(request))
      throw new AIError(
        "player_authentication",
        "Authenticated player access is required.",
        401,
      );
    return;
  }
  if (path === "/api/journey") {
    if (!requestPrincipal(request))
      throw new AIError(
        "player_authentication",
        "Authenticated player access is required.",
        401,
      );
    return;
  }
  if (
    isGM(request.headers.get("x-ravenland-gm-token")) &&
    [
      "/api/sourcebooks",
      "/api/compendium",
      "/api/ai/instructions",
      "/api/ai/memories",
      "/api/ai/settings",
    ].includes(path)
  )
    return;
  throw new AIError(
    "gm_authority",
    "This campaign mutation requires trusted local administration or its explicitly configured administrative capability.",
    403,
  );
}
export function authorizeJourneyRequest(
  request: Request,
  c: { campaignId: string; type: string; [key: string]: unknown },
) {
  if (isTrustedLocalRequest(request)) return;
  const p = requestPrincipal(request);
  if (c.type === "quarter-chat-submit") {
    const draft = c.draft as { assignments: { characterId: string }[] };
    requireCharacterAccess(p, c.campaignId, String(c.actorId));
    for (const a of draft.assignments)
      requireCharacterAccess(p, c.campaignId, a.characterId);
    return;
  }
  if (c.type === "quarter-chat-request") {
    if (!p?.grants.some((g) => g.campaignId === c.campaignId))
      throw new AIError(
        "character_forbidden",
        "This campaign is not assigned to this player.",
        403,
      );
    return;
  }
  requireControllerRequest(request, c.campaignId);
}
export function mutationDenial(request: Request): Response | null {
  try {
    authorizeMutationRequest(request);
    return null;
  } catch (error) {
    const e =
      error instanceof AIError
        ? error
        : new AIError("mutation_denied", "Mutation authorization failed.", 403);
    return Response.json(
      { error: e.message, code: e.code },
      { status: e.status },
    );
  }
}
