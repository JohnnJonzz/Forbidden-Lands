import { NextResponse } from "next/server";
import { getLocalRepository } from "@/server/sqlite";
import {
  gameplayPrincipal,
  requireCharacterAccess,
} from "@/server/character-access";
import { mutationDenial } from "@/server/mutation-authority";
import {
  quarterResolutionCommand,
  executeQuarterResolution,
  resolutionView,
} from "@/server/quarter-resolution/service";
import { tableGM } from "@/server/narrative/authority";
import { privateCharacterRecord } from "@/server/creatures/context";
import { deliverTransition } from "@/server/transitions/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      id = q.get("campaignId") ?? "",
      actor = q.get("actorId") ?? "",
      entryId = q.get("entryId") ?? "",
      repo = getLocalRepository(),
      p = gameplayPrincipal(request, id, actor);
    requireCharacterAccess(p, id, actor);
    return NextResponse.json(
      {
        ...resolutionView(repo, id, entryId, tableGM(repo, id, p).isTableGM),
        isTableGM: tableGM(repo, id, p).isTableGM,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resolution unavailable" },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  const denied = mutationDenial(request);
  if (denied) return denied;
  try {
    const c = quarterResolutionCommand.parse(await request.json()),
      repo = getLocalRepository(),
      p = gameplayPrincipal(request, c.campaignId, c.actorId),
      result = executeQuarterResolution(repo, c, p);
    if (result.flow?.status === "Quarter completed")
      await deliverTransition(repo, c.campaignId);
    return NextResponse.json({
      ...result,
      record: privateCharacterRecord(request, repo.get(c.campaignId)!),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resolution failed" },
      { status: 400 },
    );
  }
}
