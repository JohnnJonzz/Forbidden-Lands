import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLocalRepository } from '@/server/sqlite';
import { gameplayPrincipal, requireCharacterAccess } from '@/server/character-access';
import { mutationDenial } from '@/server/mutation-authority';
import { tableGM, assignTableGM } from '@/server/narrative/authority';
import { aiFailure } from '@/server/ai/http';
export const runtime = 'nodejs';
const input = z.object({ campaignId: z.string().uuid(), characterId: z.string().min(1), playerId: z.string().min(1).max(100), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict();
export async function GET(request: Request) { try {
    const params = new URL(request.url).searchParams, id = z.string().uuid().parse(params.get('campaignId')), actor = z.string().min(1).parse(params.get('characterId')), principal = gameplayPrincipal(request, id, actor);
    requireCharacterAccess(principal, id, actor);
    return NextResponse.json(tableGM(getLocalRepository(), id, principal), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return aiFailure(e);
} }
export async function POST(request: Request) { const denied = mutationDenial(request); if (denied)
    return denied; try {
    const c = input.parse(await request.json());
    return NextResponse.json(assignTableGM(getLocalRepository(), c.campaignId, c.characterId, gameplayPrincipal(request, c.campaignId, c.characterId), c.playerId, c.revision, c.requestId));
}
catch (e) {
    return aiFailure(e);
} }
