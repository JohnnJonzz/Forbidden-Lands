import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {MapInputError} from './store';
import {ConflictError} from '../repository';
export async function mapBody(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new MapInputError('JSON required');const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new MapInputError('Origin mismatch');const text=await request.text();if(text.length>100000)throw new MapInputError('Request too large');return JSON.parse(text)}
export function mapFailure(error:unknown){const status=error instanceof ConflictError?409:error instanceof MapInputError||error instanceof ZodError||error instanceof SyntaxError?400:500;return NextResponse.json({error:status===500?'Map storage is unavailable':error instanceof ZodError?'Invalid map input':(error as Error).message},{status})}
