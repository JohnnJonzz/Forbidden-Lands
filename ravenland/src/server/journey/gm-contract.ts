import {randomUUID} from 'node:crypto';
import {executeJourney} from './service';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import {publicQuarterPacket,activeChatForm} from '../../lib/journey/chat-engine';
import type {QuarterResolution} from '../../lib/journey/chat-schema';
// Typed server boundary for a future GM adapter. No HTML generation, AI transport,
// raw dice access or direct mechanical database writes are exposed here.
export function quarterDayGM(repo:SqliteCampaignRepository=getLocalRepository()){
 const run=(campaignId:string,input:Record<string,unknown>,actionId:string)=>{const record=repo.get(campaignId);if(!record)throw new Error('Campaign not found');const result=executeJourney({...input,campaignId,revision:record.revision,actionId},repo);return {campaignId,revision:result.record.revision,replayed:result.replayed,...(typeof input.entryId==='string'?{submission:publicQuarterPacket(result.record.session,input.entryId)}:{form:structuredClone(activeChatForm(result.record.session))})}};
 return {
  requestForm:(campaignId:string,actionId=randomUUID())=>run(campaignId,{type:'quarter-chat-request'},actionId),
  readSubmission:(campaignId:string,entryId:string)=>{const record=repo.get(campaignId);if(!record)throw new Error('Campaign not found');return publicQuarterPacket(record.session,entryId)},
  requestInformation:(campaignId:string,entryId:string,text:string,actionId=randomUUID())=>run(campaignId,{type:'quarter-chat-question',entryId,text},actionId),
  publishNarrative:(campaignId:string,entryId:string,text:string,actionId=randomUUID())=>run(campaignId,{type:'quarter-chat-narrative',entryId,text},actionId),
  proposeResolution:(campaignId:string,entryId:string,resolution:QuarterResolution,actionId=randomUUID())=>run(campaignId,{type:'quarter-chat-propose',entryId,resolution},actionId)
 };
}
