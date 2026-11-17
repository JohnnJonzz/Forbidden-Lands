import type {CharacterPrincipal} from '../character-access';
import {mayReadCharacter} from '../character-access';
import type {SqliteCampaignRepository} from '../sqlite';
import type {Consequence,RequestedConsequenceRoll} from '../../lib/consequences/schema';
import {urgencyLevels} from '../../lib/consequences/schema';
import {readConsequences,visibleConsequence} from './store';
import {injurySource} from './registry';
import {setupById} from '../combat/setup-store';
import {characterAwareness} from '../character-awareness';
export function consequenceContext(repo:SqliteCampaignRepository,campaignId:string,principal:CharacterPrincipal|null|undefined){
 const s=repo.get(campaignId)!.session,all=readConsequences(repo,campaignId).filter(c=>visibleConsequence(c,principal));
 const open=all.filter(c=>!['resolved','superseded'].includes(c.status)).filter(c=>{if(c.category!=='aftermath')return true;const e=repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? AND id=?').get(campaignId,c.source.encounterId!);if(!e)return false;const v=JSON.parse(e.state_json as string);return v.sceneHex===s.campaign.hex&&v.sceneLocation===s.campaign.location}).sort((a,b)=>urgencyLevels.indexOf(a.urgency)-urgencyLevels.indexOf(b.urgency)||a.createdAt.localeCompare(b.createdAt));
 const view=(c:Consequence)=>{const {state,...metadata}=c,source=injurySource(repo,c),setup=source?.encounter.setupProposalId?setupById(repo,campaignId,source.encounter.setupProposalId):null;return {...metadata,state:{...state,attempts:state.attempts.map(a=>mayReadCharacter(principal,campaignId,a.healerId)?a:{id:a.id,healerId:a.healerId,status:a.status,rollId:a.rollId,successes:a.successes})},patient:source?{id:source.actor.id,name:source.actor.name,...(mayReadCharacter(principal,campaignId,source.actor.id)&&s.characters.some(ch=>ch.id===source.actor.id)?{currentCharacter:characterAwareness(s.characters.find(c=>c.id===source.actor.id)!,'' )}:{}),sourceCritical:{procedureId:source.procedure.id,rollId:source.procedure.rollId,table:source.procedure.cause,value:source.procedure.value},sourceScene:{location:source.encounter.sceneLocation,hex:source.encounter.sceneHex,currentScene:source.encounter.sceneHex===s.campaign.hex&&source.encounter.sceneLocation===s.campaign.location},survivingNPCs:source.encounter.combatants.filter(a=>a.side==='enemy'&&!a.broken&&!a.withdrawn).map(a=>({id:a.id,name:a.name})),confirmedSetupDeclaration:setup?.proposal.declaration??null}:null};};
 return {open:open.map(view),focus:open[0]?view(open[0]):null,recentResolutions:[...new Map([...all.filter(c=>c.status==='resolved'&&c.state.resolution==='death_verified'&&c.characterIds.some(id=>s.characters.some(ch=>ch.id===id))),...all.filter(c=>c.status==='resolved').slice(-6)].map(c=>[c.id,c])).values()].map(view),policy:'Source-linked workflow records are not replacement injuries or permission to mutate sheets. Prioritize life and mandatory procedures; story threads do not block unrelated actions. Only actual combat progression or explicitly confirmed elapsed-time events advance deadlines. Narrate proposed world actions as intentions, never completed mechanics. Current sheets and source records outrank descriptive text.'};
}
export function requestedConsequenceRoll(repo:SqliteCampaignRepository,campaignId:string,characterId:string,principal:CharacterPrincipal|null|undefined):RequestedConsequenceRoll|null{
 if(!mayReadCharacter(principal,campaignId,characterId))return null;
 const open=readConsequences(repo,campaignId).filter(c=>visibleConsequence(c,principal)&&c.category==='lethal_injury'&&!['resolved','superseded'].includes(c.status));
 for(const c of open){const d=c.state.deadline;if(!d||d.clockReviewRequired)continue;
  if(d.value===null&&c.characterIds.includes(characterId))return {context:{consequenceId:c.id,procedureId:c.id+':deadline',step:'deadline'},label:'Injury deadline',purpose:'Injury deadline',attribute:null,base:0,skill:0,gear:0,modifier:0,isArmor:false,utility:{dice:d.dice,sides:6},instructions:c.nextProcedure};
  const a=c.state.attempts.find(a=>a.healerId===characterId&&a.status==='prepared');if(a)return {context:{consequenceId:c.id,procedureId:a.id,step:'treatment'},label:'Healing',purpose:'Lifesaving Healing',...a.pool,isArmor:false,instructions:'Lifesaving Healing · '+a.pool.base+' Empathy + '+a.pool.skill+' Healing '+(a.pool.modifier>=0?'+':'')+a.pool.modifier+' Skill modifier. Roll on this healer’s sheet; an eligible failed roll may be pushed before attachment and Send. No result or time is assumed.'};
 }
 return null;
}
