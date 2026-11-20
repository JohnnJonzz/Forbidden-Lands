import {privateCharacterRecord} from '@/server/creatures/context';
import {mutationDenial} from '@/server/mutation-authority';
import {authorizeJourneyRequest} from '@/server/mutation-authority';
import {commandSchema} from '@/lib/journey/schema';
import {AIError} from '@/server/ai/config';
import {aiFailure} from '@/server/ai/http';
import {ZodError} from 'zod';
import {NextResponse} from 'next/server';
import {executeJourney,JourneyInputError} from '@/server/journey/service';
import {mapBody,mapFailure} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const c=commandSchema.parse(await mapBody(request));authorizeJourneyRequest(request,c);const result=executeJourney(c);return NextResponse.json({...result,record:privateCharacterRecord(request,result.record),campaigns:await getRepository().list()})}catch(e){if(e instanceof AIError)return aiFailure(e);if(e instanceof ZodError)return NextResponse.json({error:'Invalid journey command, expenditure, or required confirmation.'},{status:400});if(e instanceof JourneyInputError)return NextResponse.json({error:e.message},{status:400});return mapFailure(e)}}
