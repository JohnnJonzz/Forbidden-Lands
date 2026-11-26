import {savedLogisticsCommand} from '@/server/logistics/ai-proposal';
import {carryingScope,resolveCarrying} from '@/server/logistics/overload';
import {isTrustedLocalRequest} from '@/server/local-play';
import {mutationDenial} from '@/server/mutation-authority';
import {gameplayPrincipal} from '@/server/character-access';
import {getLocalRepository} from '@/server/sqlite';
import {executeLogistics,logisticsContext} from '@/server/logistics/service';
import {aiBody,aiFailure} from '@/server/ai/http';
export const runtime='nodejs';
export async function GET(request:Request){if(!isTrustedLocalRequest(request))return Response.json({error:'Supplies and commitments require the trusted local controller.'},{status:403});const id=new URL(request.url).searchParams.get('campaignId');if(!id)return Response.json({error:'Campaign required'},{status:400});return Response.json({...logisticsContext(getLocalRepository(),id),scopes:{Hike:carryingScope(getLocalRepository(),id,'Hike'),Run:(()=>{try{return carryingScope(getLocalRepository(),id,'Run')}catch{return null}})()}},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const {preview=false,...raw}=await aiBody(request);if(typeof preview!=='boolean')throw Error('Invalid preview flag');if(raw.aiRequestId){if(!isTrustedLocalRequest(request))throw Error('Controller required');return Response.json(executeLogistics(getLocalRepository(),savedLogisticsCommand(getLocalRepository(),raw.campaignId,raw.aiRequestId,raw.actionIndex),gameplayPrincipal(request,raw.campaignId,'controller'),preview));}if(raw.type==='overload'){const {type,...input}=raw;return Response.json(resolveCarrying(getLocalRepository(),input,gameplayPrincipal(request,raw.campaignId,'controller')));}return Response.json(executeLogistics(getLocalRepository(),raw,gameplayPrincipal(request,raw.campaignId,'controller'),preview));}catch(e){return aiFailure(e);}}
