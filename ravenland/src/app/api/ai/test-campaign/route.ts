import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {createTestCampaign} from '@/server/ai/store';
import {aiBody,aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function POST(request:Request){try{const c=z.object({campaignId:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(await aiBody(request));return NextResponse.json({record:createTestCampaign(getLocalRepository(),c.campaignId)})}catch(e){return aiFailure(e)}}
