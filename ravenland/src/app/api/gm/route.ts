import { NextResponse } from 'next/server';
import { z } from 'zod';
import { respondToAction } from '@/server/campaign-service';
export const runtime='nodejs';
export async function POST(request:Request){try{const {id,action,character}=z.object({id:z.string().uuid(),action:z.string().min(1).max(3000),character:z.string().max(100)}).strict().parse(await request.json());return NextResponse.json({text:await respondToAction(id,action,character)})}catch{return NextResponse.json({error:'Could not prepare mock GM response'},{status:400})}}
