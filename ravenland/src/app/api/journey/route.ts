import {executeQuarterResolution} from '@/server/quarter-resolution/service';
import {stableId} from '@/server/quarter-resolution/store';
import {gameplayPrincipal} from '@/server/character-access';
import {deliverTransition} from '@/server/transitions/service';
import {privateCharacterRecord} from '@/server/creatures/context';
import {mutationDenial} from '@/server/mutation-authority';
import {authorizeJourneyRequest} from '@/server/mutation-authority';
import {commandSchema} from '@/lib/journey/schema';
import {AIError} from '@/server/ai/config';
import {aiFailure} from '@/server/ai/http';
import {ZodError} from 'zod';
import {NextResponse} from 'next/server';
import {executeJourney,JourneyInputError} from '@/server/journey/service';
import {mapBody,mapFailure} from '@/server/map/http';
import {getRepository,getLocalRepository} from '@/server/sqlite';
export const runtime='nodejs';
export async function POST(request:Request){const denied=mutationDenial(request);if(denied)return denied;try{const c=commandSchema.parse(await mapBody(request));authorizeJourneyRequest(request,c);const result=executeJourney(c);if(c.type==='quarter-chat-submit'&&c.assisted){executeQuarterResolution(getLocalRepository(),{campaignId:c.campaignId,entryId:c.actionId,actorId:c.actorId,requestId:stableId(c.actionId,'start'),revision:result.record.revision,operation:'start',options:c.assisted,confirmed:true},gameplayPrincipal(request,c.campaignId,c.actorId));result.record=getLocalRepository().get(c.campaignId)!;await deliverTransition(getLocalRepository(),c.campaignId);result.record=getLocalRepository().get(c.campaignId)!;}if(c.type==='quarter-chat-complete'){await deliverTransition(getLocalRepository(),c.campaignId);result.record=getLocalRepository().get(c.campaignId)!;}return NextResponse.json({...result,record:privateCharacterRecord(request,result.record),campaigns:await getRepository().list()})}catch(e){if(e instanceof AIError)return aiFailure(e);if(e instanceof ZodError)return NextResponse.json({error:'Invalid journey command, expenditure, or required confirmation.'},{status:400});if(e instanceof JourneyInputError)return NextResponse.json({error:e.message},{status:400});return mapFailure(e)}}
