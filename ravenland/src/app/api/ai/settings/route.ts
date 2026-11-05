import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {aiSettingsSchema} from '@/lib/ai/schema';
import {aiStatus,updateAISettings,shareSceneImage,sceneImages} from '@/server/ai/store';
import {AIService,recentAIRequests} from '@/server/ai/service';
import {aiBody,aiFailure} from '@/server/ai/http';
import {isGM,requireGM} from '@/server/ai/config';
import {ImageLibrary} from '@/server/images/library';
export const runtime='nodejs';
export async function GET(request:Request){try{const id=z.string().uuid().parse(new URL(request.url).searchParams.get('campaignId')),repo=getLocalRepository();const suppliedToken=request.headers.get('x-ravenland-gm-token');if(suppliedToken)requireGM(suppliedToken);return NextResponse.json({...aiStatus(repo,id),requests:recentAIRequests(repo,id),...(isGM(request.headers.get('x-ravenland-gm-token'))?{images:new ImageLibrary(repo).list(id),sharedImages:sceneImages(repo,id)}:{})},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const c=z.discriminatedUnion('type',[z.object({type:z.literal('connection'),campaignId:z.string().uuid()}).strict(),z.object({type:z.literal('settings'),campaignId:z.string().uuid(),settings:aiSettingsSchema}).strict(),z.object({type:z.literal('share-image'),campaignId:z.string().uuid(),imageId:z.string().regex(/^[a-f0-9]{64}$/),shared:z.boolean(),confirmed:z.literal(true)}).strict()]).parse(await aiBody(request)),repo=getLocalRepository();if(c.type==='connection')return NextResponse.json(await new AIService(repo).test(c.campaignId));if(c.type==='settings')updateAISettings(repo,c.campaignId,c.settings);else{requireGM(request.headers.get('x-ravenland-gm-token'));shareSceneImage(repo,c.campaignId,c.imageId,c.shared)}return NextResponse.json(aiStatus(repo,c.campaignId))}catch(e){return aiFailure(e)}}
