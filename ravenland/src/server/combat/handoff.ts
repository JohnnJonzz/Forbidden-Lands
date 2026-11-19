import type {CombatEncounter} from '../../lib/combat/types';
import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {mayReadCharacter} from '../character-access';
import {setupById} from './setup-store';
import {SqliteMemoryRepository} from '../ai/memory';
// The newest encounter defines the scene boundary: never resurrect a previous
// defeat once a later encounter has started, even if it occurred at the same hex.
export function encounterHandoff(repo:SqliteCampaignRepository,campaignId:string,principal:CharacterPrincipal|null|undefined){
 const row=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 1').get(campaignId),record=repo.get(campaignId);if(!row||!record)return null;
 const e=JSON.parse(row.state_json as string) as CombatEncounter;
 if(e.administrativeAbort)return {encounterId:e.id,kind:'administratively_aborted',players:e.outcome?.players.map(p=>mayReadCharacter(principal,campaignId,p.id)?p:{id:p.id,name:p.name,broken:p.broken,withdrawn:p.withdrawn})??[],reason:e.administrativeAbort.reason,policy:e.outcome?.policy,actualPosition:{hex:record.session.campaign.hex,quarter:record.session.campaign.quarter},sceneMismatch:e.sceneHex!==record.session.campaign.hex,dispositions:e.administrativeAbort.dispositions,continuationPolicy:'Administrative stop only. No attack outcome or fictional escape, defeat or surrender. Preserve recorded consequences and resume the existing expedition at the actual position.'};
 if(e.status!=='ended'||!e.outcome||e.sceneHex!==record.session.campaign.hex||e.sceneLocation!==record.session.campaign.location)return null;
 const setup=e.setupProposalId?setupById(repo,campaignId,e.setupProposalId):null;
 const known=new SqliteMemoryRepository(repo).retrieve(campaignId,e.combatants.map(a=>a.name).join(' ')+' '+e.sceneLocation,e.sceneHex).filter(m=>m.storyState==='active').slice(0,6).map(m=>({id:m.id,title:m.title,summary:m.summary,authority:'approved party-known memory'}));
 return {encounterId:e.id,...e.outcome,players:e.outcome.players.map(p=>mayReadCharacter(principal,campaignId,p.id)?p:{id:p.id,name:p.name,broken:p.broken,withdrawn:p.withdrawn}),confirmedSetupDeclaration:setup?.proposal.declaration??null,establishedScene:e.sceneDescription??null,establishedGoalsAndFacts:known,continuationPolicy:e.outcome.policy+' The original declaration establishes the agreed scene and stated motives, not automatic success of subsequent NPC actions. Current sheets override the historical snapshot for current conditions. Respect the remaining awareness/capabilities of Broken characters. Continue the scene; do not request an illegal combat turn.'};
}
