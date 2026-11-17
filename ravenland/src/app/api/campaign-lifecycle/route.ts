import {z} from 'zod';
import {inheritLibraries,setInheritedRuleApplicability} from '@/server/installation-libraries';
import {requireGM} from '@/server/ai/config';
import {mutationDenial} from '@/server/mutation-authority';
import {isTrustedLocalRequest} from '@/server/local-play';
import {getLocalRepository} from '@/server/sqlite';
import {aiBody} from '@/server/ai/http';
import {lifecycleOptions,nameStartingVillage,verifyVillage,shareLibrary,resetCampaign} from '@/server/campaign-lifecycle';
export const runtime='nodejs';
export async function GET(request:Request){if(!isTrustedLocalRequest(request))return Response.json({error:'Library sharing and village verification require the trusted local controller.'},{status:403});return Response.json(lifecycleOptions(getLocalRepository()),{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const raw=await aiBody(request),{operation,...input}=raw,repo=getLocalRepository();if(operation==='sync_libraries'){const {campaignId}=z.object({campaignId:z.string().uuid()}).strict().parse(input);return Response.json({synced:inheritLibraries(repo,campaignId,{trustedLocal:isTrustedLocalRequest(request)})});}if(operation==='rule_applicability'){requireGM(request.headers.get('x-ravenland-gm-token'));return Response.json(setInheritedRuleApplicability(repo,input));}if(operation==='name_village'){const record=nameStartingVillage(repo,input);return Response.json({record,campaigns:repo.list()});}if(operation==='verify_village')return Response.json({villages:verifyVillage(repo,input)});if(operation==='share'){if(input.kind==='sourcebook')requireGM(request.headers.get('x-ravenland-gm-token'));return Response.json(shareLibrary(repo,input));}if(operation==='reset'){const record=resetCampaign(repo,input,{trustedLocal:isTrustedLocalRequest(request)});return Response.json({record,campaigns:repo.list()});}throw Error('Unknown lifecycle operation.');}catch(e){return Response.json({error:e instanceof Error?e.message:'Lifecycle operation failed'},{status:409});}}
