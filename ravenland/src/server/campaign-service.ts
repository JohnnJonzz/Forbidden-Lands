import { getRepository } from './sqlite';
import { mockGameMaster } from '../lib/mock';
// A future AI adapter receives only this public, typed snapshot, never a DB handle or GM-secret rows.
export async function getPublicCampaign(id:string){const record=await getRepository().get(id);if(!record)throw new Error('Campaign not found');return record.session}
export async function respondToAction(id:string,action:string,character:string){const session=await getPublicCampaign(id);if(!session.characters.some(c=>c.name===character))throw new Error('Character not found');return mockGameMaster.respond(action,character)}

// Future GM adapters request a single submitted quarter-day packet; dice histories are omitted.
export async function getQuarterDaySummary(campaignId:string,entryId:string){const session=await getPublicCampaign(campaignId);const entry=session.dayTracker?.find(e=>e.id===entryId);if(!entry)throw new Error('Completed quarter-day not found');return structuredClone({...entry,corrections:session.dayCorrections?.filter(c=>c.entryId===entryId)??[]})}
