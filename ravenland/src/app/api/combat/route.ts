import {combatRollReview} from '@/server/combat/eligible-rolls';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {publicCombat} from '@/server/combat/store';
import type {CombatEncounter} from '@/lib/combat/types';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,id=z.string().uuid().parse(p.get('campaignId')),actor=z.string().min(1).max(100).parse(p.get('characterId'));const principal=gameplayPrincipal(request,id,actor);requireCharacterAccess(principal,id,actor);const repo=getLocalRepository(),row=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at DESC LIMIT 1').get(id);const encounter=row?JSON.parse(row.state_json as string) as CombatEncounter:null;return NextResponse.json({encounter:publicCombat(encounter,repo.get(id)?.session.characters??[],repo),...combatRollReview(repo,id,actor,encounter,principal)},{headers:{'Cache-Control':'no-store'}})}catch(error){return aiFailure(error)}}
