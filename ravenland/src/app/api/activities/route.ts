import {resumeQuarter} from '@/server/quarter-resolution/service';
import {deliverTransition} from '@/server/transitions/service';
import { NextResponse } from 'next/server';
import { getLocalRepository } from '@/server/sqlite';
import { gameplayPrincipal, requireCharacterAccess } from '@/server/character-access';
import { mutationDenial } from '@/server/mutation-authority';
import { activityCommand, executeActivity } from '@/server/activities/service';
import { activityStatus } from '@/server/activities/context';
import { tableGM } from '@/server/narrative/authority';
import { privateCharacterRecord } from '@/server/creatures/context';
import { mapBody } from '@/server/map/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    try {
        const q = new URL(request.url).searchParams, id = q.get('campaignId') ?? '', actor = q.get('characterId') ?? '', repo = getLocalRepository(), principal = gameplayPrincipal(request, id, actor);
        requireCharacterAccess(principal, id, actor);
        if (!repo.get(id))
            return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
        return NextResponse.json({ ...activityStatus(repo, id, actor), isTableGM: tableGM(repo, id, principal).isTableGM }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Activity status unavailable.' }, { status: 403 });
    }
}
export async function POST(request: Request) {
    const denied = mutationDenial(request);
    if (denied)
        return denied;
    try {
        const c = activityCommand.parse(await mapBody(request)), repo = getLocalRepository(), principal = gameplayPrincipal(request, c.campaignId, c.actorId), result = executeActivity(repo, c, principal);
        resumeQuarter(repo,c.campaignId,principal,c.requestId);result.record=repo.get(c.campaignId)!;if(c.operation==='complete'){await deliverTransition(repo,c.campaignId);result.record=repo.get(c.campaignId)!;}
        return NextResponse.json({ ...result, record: privateCharacterRecord(request, result.record) });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Activity operation failed.' }, { status: 400 });
    }
}
