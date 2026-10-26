import { getRepository } from './sqlite';
import { mockGameMaster } from '../lib/mock';
// A future AI adapter receives only this public, typed snapshot, never a DB handle or GM-secret rows.
export async function getPublicCampaign(id:string){const record=await getRepository().get(id);if(!record)throw new Error('Campaign not found');return record.session}
export async function respondToAction(id:string,action:string,character:string){const session=await getPublicCampaign(id);if(!session.characters.some(c=>c.name===character))throw new Error('Character not found');return mockGameMaster.respond(action,character)}
