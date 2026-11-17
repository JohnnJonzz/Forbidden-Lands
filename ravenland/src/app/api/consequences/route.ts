import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {gameplayPrincipal,requireCharacterAccess} from '@/server/character-access';
import {aiBody,aiFailure} from '@/server/ai/http';
import {consequenceCommandSchema} from '@/lib/consequences/schema';
import {executeConsequence,syncConsequenceRecords,consequenceReceipt} from '@/server/consequences/service';
import {consequenceContext,requestedConsequenceRoll} from '@/server/consequences/context';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,id=z.string().uuid().parse(p.get('campaignId')),actor=z.string().min(1).parse(p.get('characterId')),principal=gameplayPrincipal(request,id,actor);requireCharacterAccess(principal,id,actor);const repo=getLocalRepository();syncConsequenceRecords(repo,id);return NextResponse.json({context:consequenceContext(repo,id,principal),request:requestedConsequenceRoll(repo,id,actor,principal),localController:principal?.mode==='trusted-local'},{headers:{'Cache-Control':'no-store'}})}catch(error){return aiFailure(error)}}
export async function POST(request:Request){try{const c=consequenceCommandSchema.parse(await aiBody(request)),principal=gameplayPrincipal(request,c.campaignId,c.characterId);return NextResponse.json(consequenceReceipt(executeConsequence(c,getLocalRepository(),principal)))}catch(error){return aiFailure(error)}}
