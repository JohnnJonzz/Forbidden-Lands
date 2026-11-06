import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {AIError,publicAIError} from './config';
export async function aiBody(request:Request,maxBytes=80000){const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new AIError('origin','Origin mismatch',403);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AIError('json','JSON required');const value=await request.text();if(Buffer.byteLength(value)>maxBytes)throw new AIError('size','AI command too large');return JSON.parse(value)}
export function aiFailure(error:unknown){const safe=error instanceof ZodError||error instanceof SyntaxError?new AIError('validation','Invalid AI command. Check required fields.'):publicAIError(error);return NextResponse.json({error:safe.message,code:safe.code},{status:safe.status})}
