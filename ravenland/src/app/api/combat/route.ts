import {requestedNavigationRoll,requestedWatchRoll} from '@/server/quarter-resolution/rolls';
import {requestedActivityRoll} from '@/server/activities/context';
import {requestedJourneyRoll} from '@/server/narrative/rolls';
import {recoveryPreview} from '@/server/combat/recovery';
import {requestedConsequenceRoll} from '@/server/consequences/context';
import {syncConsequences} from '@/server/consequences/registry';
import {reconcileCombatSheets} from '@/server/combat/lifecycle-store';
import {requestedCombatRoll} from '@/server/combat/requested-roll';
import {actionContext} from '@/server/combat/action-context';
import {combatRollReview} from '@/server/combat/eligible-rolls';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {publicCombat} from '@/server/combat/store';
import type {CombatEncounter} from '@/lib/combat/types';
import {aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,id=z.string().uuid().parse(p.get('campaignId')),actor=z.string().min(1).max(100).parse(p.get('characterId'));const principal=gameplayPrincipal(request,id,actor);requireCharacterAccess(principal,id,actor);const repo=getLocalRepository();repo.db.exec('BEGIN IMMEDIATE');try{const record=repo.get(id);if(record)reconcileCombatSheets(repo,id,record.session);syncConsequences(repo,id);repo.db.exec('COMMIT')}catch(error){repo.db.exec('ROLLBACK');throw error}const row=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at DESC LIMIT 1').get(id);const encounter=row?JSON.parse(row.state_json as string) as CombatEncounter:null;let actions=null;try{if(encounter?.status==='active')actions=actionContext(repo,{campaignId:id,characterId:actor,requestId:encounter.id,kind:'chat',action:''},principal).input}catch{}return NextResponse.json({recovery:encounter?recoveryPreview(encounter,repo.get(id)?.session):null,localController:principal?.mode==='trusted-local',requestedRoll:requestedCombatRoll(encounter,repo.get(id)?.session.characters??[],actor)??requestedConsequenceRoll(repo,id,actor,principal)??(encounter?.status!=='active'&&repo.get(id)?requestedActivityRoll(repo.get(id)!.session,actor):null)??requestedNavigationRoll(repo,id,actor)??requestedWatchRoll(repo,id,actor)??requestedJourneyRoll(repo,id,actor,principal),actions,encounter:publicCombat(encounter,repo.get(id)?.session.characters??[],repo),...combatRollReview(repo,id,actor,encounter,principal)},{headers:{'Cache-Control':'no-store'}})}catch(error){return aiFailure(error)}}
