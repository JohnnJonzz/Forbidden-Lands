import {NextResponse} from 'next/server';
import {z} from 'zod';
import {aiBody,aiFailure} from '@/server/ai/http';
import {AIError} from '@/server/ai/config';
import {principalForToken,requestPrincipal,playerCookie,playerAccessConfigured} from '@/server/character-access';
export const runtime='nodejs';
const summary=(principal:ReturnType<typeof requestPrincipal>,campaignId:string)=>{const characterIds=principal?.grants.filter(g=>g.campaignId===campaignId).flatMap(g=>g.characterIds)??[];return {authenticated:characterIds.length>0,playerId:characterIds.length?principal!.playerId:null,characterIds}};
export async function GET(request:Request){try{const campaignId=z.string().uuid().parse(new URL(request.url).searchParams.get('campaignId'));return NextResponse.json({...summary(requestPrincipal(request),campaignId),configured:playerAccessConfigured()},{headers:{'Cache-Control':'no-store'}})}catch(e){return aiFailure(e)}}
export async function POST(request:Request){try{const c=z.object({campaignId:z.string().uuid(),token:z.string().min(32).max(512)}).strict().parse(await aiBody(request)),principal=principalForToken(c.token);if(!principal||!principal.grants.some(g=>g.campaignId===c.campaignId))throw new AIError('player_authentication','Player access was not accepted for this campaign.',401);const response=NextResponse.json(summary(principal,c.campaignId),{headers:{'Cache-Control':'no-store'}});response.cookies.set(playerCookie,c.token,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:43200});return response}catch(e){return aiFailure(e)}}
export async function DELETE(request:Request){try{await aiBody(request);const response=NextResponse.json({authenticated:false});response.cookies.set(playerCookie,'',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});return response}catch(e){return aiFailure(e)}}
