import {ZodError} from 'zod';
import {NextResponse} from 'next/server';
import {executeJourney,JourneyInputError} from '@/server/journey/service';
import {mapBody,mapFailure} from '@/server/map/http';
import {getRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){try{const result=executeJourney(await mapBody(request));return NextResponse.json({...result,campaigns:await getRepository().list()})}catch(e){if(e instanceof ZodError)return NextResponse.json({error:'Invalid journey command, expenditure, or required confirmation.'},{status:400});if(e instanceof JourneyInputError)return NextResponse.json({error:e.message},{status:400});return mapFailure(e)}}
