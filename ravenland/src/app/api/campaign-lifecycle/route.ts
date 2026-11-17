import {requireGM} from '@/server/ai/config';
import {mutationDenial} from '@/server/mutation-authority';
import {isTrustedLocalRequest} from '@/server/local-play';
import {getLocalRepository} from '@/server/sqlite';
import {aiBody} from '@/server/ai/http';
import {lifecycleOptions,verifyVillage,shareLibrary,resetCampaign} from '@/server/campaign-lifecycle';
export const runtime='nodejs';
export async function GET(request:Request){if(!isTrustedLocalRequest(request))return Response.json({error:'Library sharing and village verification require the trusted local controller.'},{status:403});return Response.json(lifecycleOptions(getLocalRepository()),{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const raw=await aiBody(request),{operation,...input}=raw,repo=getLocalRepository();if(operation==='verify_village')return Response.json({villages:verifyVillage(repo,input)});if(operation==='share'){if(input.kind==='sourcebook')requireGM(request.headers.get('x-ravenland-gm-token'));return Response.json(shareLibrary(repo,input));}if(operation==='reset'){const record=resetCampaign(repo,input);return Response.json({record,campaigns:repo.list()});}throw Error('Unknown lifecycle operation.');}catch(e){return Response.json({error:e instanceof Error?e.message:'Lifecycle operation failed'},{status:409});}}
