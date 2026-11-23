import { NextResponse } from 'next/server';
import { getLocalRepository } from '@/server/sqlite';
import { gameplayPrincipal, requireCharacterAccess } from '@/server/character-access';
import { mutationDenial } from '@/server/mutation-authority';
import { privateCharacterRecord } from '@/server/creatures/context';
import { continuityCommandSchema } from '@/lib/continuity';
import { occupiedCamp } from '@/lib/campsites';
import { tableGM } from '@/server/narrative/authority';
import { reviewCandidates } from '@/server/continuity/review';
import { executeContinuity } from '@/server/continuity/service';
import { mapBody } from '@/server/map/http';
export const runtime = 'nodejs';
export async function GET(request: Request) { try {
    const q = new URL(request.url).searchParams, id = q.get('campaignId') ?? '', actor = q.get('characterId') ?? '', principal = gameplayPrincipal(request, id, actor);
    requireCharacterAccess(principal, id, actor);
    const repo = getLocalRepository(), r = repo.get(id);
    if (!r)
        throw Error('Campaign not found.');
    const gm = tableGM(repo, id, principal).isTableGM;
    return NextResponse.json({ revision: r.revision, isTableGM: gm, camp: occupiedCamp(r.session), reviews: gm ? reviewCandidates(repo, id) : [] }, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Continuity review unavailable.' }, { status: 403 });
} }
export async function POST(request: Request) { const denied = mutationDenial(request); if (denied)
    return denied; try {
    const c = continuityCommandSchema.parse(await mapBody(request)), repo = getLocalRepository(), principal = gameplayPrincipal(request, c.campaignId, c.actorId), result = executeContinuity(repo, c, principal);
    return NextResponse.json({ ...result, record: privateCharacterRecord(request, result.record) });
}
catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Continuity correction failed.' }, { status: 400 });
} }
