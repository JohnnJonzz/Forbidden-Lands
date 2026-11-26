import {isTrustedLocalRequest} from '@/server/local-play';
import {getLocalRepository} from '@/server/sqlite';
import {genesis} from '@/server/genesis/service';
export const runtime='nodejs';
export async function GET(request:Request){if(!isTrustedLocalRequest(request))return Response.json({error:'Genesis review requires the trusted local controller.'},{status:403});const id=new URL(request.url).searchParams.get('campaignId');return Response.json({genesis:id?genesis(getLocalRepository(),id):null},{headers:{'Cache-Control':'no-store'}});}
