import { NextResponse } from 'next/server';
import { getLocalRepository } from '@/server/sqlite';
import { gameplayPrincipal, requireCharacterAccess } from '@/server/character-access';
import { mutationDenial } from '@/server/mutation-authority';
import { tableGM } from '@/server/narrative/authority';
import { mapBody } from '@/server/map/http';
import { privateCharacterRecord } from '@/server/creatures/context';
import { executeEnvironment, environmentCommand } from '@/server/transitions/commands';
import { transitions, deliverTransition } from '@/server/transitions/service';
export const runtime = 'nodejs';
export async function GET(request: Request) { try {
    const q = new URL(request.url).searchParams, id = q.get('campaignId') ?? '', actor = q.get('characterId') ?? '', principal = gameplayPrincipal(request, id, actor);
    requireCharacterAccess(principal, id, actor);
    const repo = getLocalRepository(), r = repo.get(id);
    if (!r)
        throw Error('Campaign not found.');
    const isTableGM = tableGM(repo, id, principal).isTableGM;
    return NextResponse.json({ isTableGM, environment: privateCharacterRecord(request, r).session.environment ?? null, transition: isTableGM ? transitions(repo, id)[0] ?? null : (() => { const t = transitions(repo, id)[0]; return t ? { id: t.id, narration: t.narration } : null; })() }, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
} }
export async function POST(request: Request) { const denied = mutationDenial(request); if (denied)
    return denied; try {
    const c = environmentCommand.parse(await mapBody(request)), principal = gameplayPrincipal(request, c.campaignId, c.actorId), repo = getLocalRepository(), result = executeEnvironment(repo, c, principal);
    await deliverTransition(repo, c.campaignId, undefined, c.operation === 'retry-narration');
    return NextResponse.json({ ...result, record: privateCharacterRecord(request, repo.get(c.campaignId)!) });
}
catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
} }
