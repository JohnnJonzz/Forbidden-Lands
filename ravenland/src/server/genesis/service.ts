import {assertCurrentRequest} from '../request-epoch';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {SqliteCampaignRepository} from '../sqlite';
import {villages} from '../campaign-lifecycle';
import {requireController} from '../mutation-authority';
import type {CharacterPrincipal} from '../character-access';
import type {GMTurn,AIReply} from '../../lib/ai/schema';
import {AIError} from '../ai/config';
import {characterBackground} from '../character-background';
import {generateVillage} from './village';
import {genesisDecisionSchema,type Foundation,type GenesisChooser} from './schema';
export interface GenesisState {version:1;openingRequestId:string;phase:'village_proposed'|'party_discussion'|'foundation_proposed'|'adventure_started';villageId:string;mapChecksum:string;hex:string;participants:string[];draft:Foundation;acceptedVillage:Foundation|null;generation:ReturnType<typeof generateVillage>;history:{draft:Foundation;reason:string}[];confirmed:Foundation|null;conversation:{requestId:string;player:string;gm:string}[];reviewRevision:number|null}
export function genesis(repo:SqliteCampaignRepository,id:string){const r=repo.db.prepare('SELECT revision,state_json FROM campaign_genesis WHERE campaign_id=?').get(id);return r?{revision:Number(r.revision),state:JSON.parse(String(r.state_json)) as GenesisState}:null;}
export function initializeGenesis(repo:SqliteCampaignRepository,id:string){const r=repo.get(id)!,v=r.session.campaign.startingVillage!;const state:GenesisState={version:1,openingRequestId:randomUUID(),phase:'village_proposed',villageId:v.id,mapChecksum:v.mapChecksum,hex:v.hex,participants:r.session.characters.map(c=>c.id),draft:{name:v.name,description:'',npcs:[],relationships:[],motivations:[],purpose:'',opening:'',tone:'',initiative:'Balanced',rumors:[]},acceptedVillage:null,generation:generateVillage(repo,id),history:[],confirmed:null,conversation:[],reviewRevision:null};repo.db.prepare('INSERT INTO campaign_genesis VALUES (?,1,?) ON CONFLICT(campaign_id) DO UPDATE SET revision=campaign_genesis.revision+1,state_json=excluded.state_json').run(id,JSON.stringify(state));}
const summary=(s:GenesisState)=>{const f=s.draft;return `Campaign foundation — ${f.name} · ${s.hex}\n\n${f.description}\n\nNPCs: ${f.npcs.join('; ')||'None established'}\nRelationships: ${f.relationships.join('; ')||'None established'}\nMotivations: ${f.motivations.map(m=>m.text).join('; ')||'None established'}\nShared purpose: ${f.purpose}\nOpening: ${f.opening}\nTone: ${f.tone} · GM initiative: ${f.initiative}\nRumors (unverified): ${f.rumors.join('; ')||'None'}\n\nConfirm this foundation and begin, or tell me what to change.`};
export async function genesisTurn(repo:SqliteCampaignRepository,c:GMTurn,principal:CharacterPrincipal|null,chooser?:GenesisChooser):Promise<AIReply>{
 requireController(principal,c.campaignId);assertCurrentRequest(repo,c.campaignId,c.requestId);if(c.kind!=='chat')throw new AIError('genesis_pending','Finish Session Zero before submitting gameplay procedures.',409);
 const fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex'),receipt=repo.db.prepare('SELECT * FROM genesis_receipts WHERE campaign_id=? AND request_id=?').get(c.campaignId,c.requestId);
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new AIError('genesis_replay','Request reused with different inputs.',409);return {...JSON.parse(String(receipt.response_json)),replayed:true};}
 const saved=genesis(repo,c.campaignId);if(!saved)throw Error('Genesis not initialized');const state=structuredClone(saved.state),record=repo.get(c.campaignId)!;
 if(state.phase==='adventure_started')throw new AIError('genesis_complete','Genesis is already historical.',409);
 if(!state.participants.includes(c.characterId))throw new AIError('genesis_participant','Choose a participating character.',403);
 const validateAnchor=()=>{const v=villages(repo).find(v=>v.id===state.villageId);if(!v||v.mapChecksum!==state.mapChecksum||v.hex!==state.hex)throw new AIError('genesis_map','The village registry or map changed. Start a fresh Genesis at a verified village.',409);return v;};validateAnchor();
 const privateValues=record.session.characters.map(ch=>ch.sheet?.['dark-secret']).filter((v):v is string=>typeof v==='string'&&!!v.trim());if(privateValues.some(s=>c.action.toLowerCase().includes(s.trim().toLowerCase())))throw new AIError('genesis_privacy','This shared channel cannot publish saved Dark Secrets. Discuss public background instead.',409);
 const roster=record.session.characters.filter(ch=>state.participants.includes(ch.id)).map(ch=>{const b=characterBackground(ch);return {id:ch.id,name:ch.name,kin:ch.kin,profession:ch.profession,age:ch.sheet?.age??null,pride:b.fields.pride,relationships:b.fields.relationships,darkSecret:{status:b.fields.darkSecret.status,value:null,policy:'Private channel unavailable: do not infer, use or publish this secret.'}}});
 const input={state,characters:roster,eligibleVillages:villages(repo),playerMessage:c.action,policy:'Everything is a proposal until confirmed. Interpret intent only from the current player message. Do not repeat questions answered in the draft. Modify draft freely without claiming acceptance. Never invent sheet facts or official dice. All narration is shared: secrets are withheld. Do not start adventure or any mechanics; application supplies confirmation and scene boundaries.'};
 let decision=chooser?genesisDecisionSchema.parse(await chooser(input)):mockDecision(state,c.action);
 // Explicit controls are also ordinary chat utterances. A model cannot confirm on its own.
 const explicitConfirm=/^(?:(?:let'?s |i |we )?(?:accept|confirm)(?: this| the foundation| everything| this foundation)?(?: and (?:begin|start)(?: the adventure)?)?|confirm and begin adventure)[.!]?$/i.test(c.action.trim())||(state.phase==='foundation_proposed'&&/^(?:yes(?:,? (?:let'?s |please )?(?:begin|start)(?: the adventure)?)?|let'?s (?:begin|start)(?: the adventure)?|go ahead)[.!]?$/i.test(c.action.trim()));
 if(decision.intent==='confirm'&&!explicitConfirm){decision={...decision,intent:'review'};}
 const secrets=record.session.characters.map(ch=>ch.sheet?.['dark-secret']).filter((v):v is string=>typeof v==='string'&&v.trim().length>0);
 const submitted=JSON.stringify(decision).toLowerCase();if(secrets.some(s=>submitted.includes(s.trim().toLowerCase())))throw new AIError('genesis_privacy','Response contains private character material; no proposal was saved.',409);
 const names=validateAnchor();if(names.canonical&&decision.draft.name!==names.name&&!(decision.intent==='retry_village'&&decision.villageId))throw new AIError('genesis_canonical','Canonical village names cannot change.',409);
 if(decision.draft.motivations.some(m=>!state.participants.includes(m.characterId)))throw new AIError('genesis_roster','Motivations reference an unselected character.',409);
 if(['confirm','accept_village'].includes(decision.intent)&&c.campaignRevision!==record.revision)throw new AIError('genesis_stale','The reviewed campaign revision changed. Refresh and review before accepting.',409);
 let narration=decision.narration,changed=JSON.stringify(decision.draft)!==JSON.stringify(state.draft);
 if(decision.intent==='confirm'){
  if(state.phase!=='foundation_proposed'||state.reviewRevision!==saved.revision)throw new AIError('genesis_review','Review the current campaign foundation before confirming.',409);
  if(changed)throw new AIError('genesis_stale','The proposed foundation changed during confirmation. Review it again.',409);
  if(!state.acceptedVillage)throw new AIError('genesis_village','Accept the village first.',409);if(/^(?:unnamed village|village)$/i.test(state.draft.name))throw new AIError('genesis_name','Establish a proper settlement name before confirmation.',409);
  state.confirmed=state.draft;state.phase='adventure_started';
  narration=decision.openingScene||`${state.draft.description}\n\nAt ${state.draft.name}, ${state.draft.npcs[0]||'a villager'} pauses beside the meeting place. ${state.draft.rumors[0]?'A rumor hangs over the conversation: '+state.draft.rumors[0]:state.draft.purpose} What do you attend to first?`;
 }else if(decision.intent==='retry_village'){
  state.history.push({draft:state.draft,reason:c.action});if(decision.villageId){const replacement=villages(repo).find(v=>v.id===decision.villageId);if(!replacement||!c.action.includes(replacement.hex))throw new AIError('genesis_anchor','Changing hex requires an explicit player request for that verified hex.',409);state.villageId=replacement.id;state.hex=replacement.hex;state.mapChecksum=replacement.mapChecksum;decision.draft.name=replacement.canonical?replacement.name:decision.draft.name;}
  state.generation=generateVillage(repo,c.campaignId);state.acceptedVillage=null;state.phase='village_proposed';state.draft={...decision.draft,description:'',npcs:[],rumors:[]};state.reviewRevision=null;
  const freshInput={...input,state,playerMessage:'Describe the fresh replacement village now using its newly recorded results. Retain player constraints and preferences from the discussion. This remains an unaccepted creative proposal, never an acceptance or gameplay transition.'};
  const refreshed=chooser?genesisDecisionSchema.parse(await chooser(freshInput)):mockDecision(state,'Describe our village proposal');
  const anchor=validateAnchor();if(anchor.canonical&&refreshed.draft.name!==anchor.name)throw new AIError('genesis_canonical','Canonical village names cannot change.',409);
  if(secrets.some(secret=>JSON.stringify(refreshed).toLowerCase().includes(secret.trim().toLowerCase())))throw new AIError('genesis_privacy','Replacement proposal contains private character material.',409);
  state.draft={...state.draft,name:refreshed.draft.name,description:refreshed.draft.description,npcs:refreshed.draft.npcs,rumors:refreshed.draft.rumors};narration=refreshed.narration+(state.generation.missing?'\n\nOfficial generation is incomplete: '+state.generation.missing+'. These creative details are proposals, not unsupported official results.':'');
 }else{
  state.draft=decision.draft;if(changed)state.reviewRevision=null;const villageChanged=state.acceptedVillage&&(['name','description','npcs'] as const).some(k=>JSON.stringify(state.acceptedVillage![k])!==JSON.stringify(state.draft[k]));if(villageChanged){state.acceptedVillage=null;state.phase='village_proposed';}
  if(decision.intent==='modify_village'){state.acceptedVillage=null;state.phase='village_proposed';}
  if(decision.intent==='accept_village'){state.acceptedVillage=structuredClone(state.draft);state.phase='party_discussion';}
  if(decision.intent==='review'){
   if(!state.acceptedVillage)throw new AIError('genesis_village','Accept the village before reviewing the foundation.',409);
   if(!state.draft.description||!state.draft.purpose||!state.draft.opening||!state.draft.tone)throw new AIError('genesis_incomplete','Discuss the village, shared purpose, opening situation and tone before final review.',409);
   state.phase='foundation_proposed';state.reviewRevision=saved.revision+1;narration=summary(state);
  }
 }
 if(state.generation.missing&&!state.conversation.length)narration+='\n\nOfficial village generation is incomplete: '+state.generation.missing+'. Any other details are creative proposals, not official table results.';
 state.conversation.push({requestId:c.requestId,player:c.action,gm:narration});state.history=state.history.slice(-30);state.conversation=state.conversation.slice(-80);
 const reply:AIReply={requestId:c.requestId,provider:chooser?'openai':'mock',narration,actions:[],selectedImageId:null,partyProposals:0};
 const db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const prior=db.prepare('SELECT fingerprint,response_json FROM genesis_receipts WHERE campaign_id=? AND request_id=?').get(c.campaignId,c.requestId);if(prior){if(prior.fingerprint!==fingerprint)throw Error('Request changed');db.exec('COMMIT');return {...JSON.parse(String(prior.response_json)),replayed:true};}
  if(repo.get(c.campaignId)?.revision!==record.revision)throw new AIError('genesis_stale','Campaign changed while the GM was responding; retry with the current record.',409);
  validateAnchor();const applied=db.prepare('UPDATE campaign_genesis SET revision=revision+1,state_json=? WHERE campaign_id=? AND revision=?').run(JSON.stringify(state),c.campaignId,saved.revision);if(!applied.changes)throw new AIError('genesis_stale','Genesis changed in another request. Review the current proposal.',409);
  const next=record.session;
  if(state.confirmed){const f=state.confirmed,v=validateAnchor();next.campaign.startingVillage={id:v.id,sourceVillageId:v.id,sourceName:v.name,name:f.name,nameOrigin:v.canonical?'canonical':next.campaign.startingVillage?.nameOrigin==='unestablished'?'gm':'user',hex:v.hex,mapChecksum:v.mapChecksum};next.campaign.hex=v.hex;next.campaign.location=f.name;next.campaign.objective=f.purpose;next.campaign.description=f.description;next.locations=[{id:v.id,canonicalLocationId:v.id,name:f.name,hex:v.hex,type:'Village',status:'Visited',notes:f.description,discoveredOn:next.campaign.date,quarter:next.campaign.quarter,updatedAt:new Date().toISOString()}];next.exploration={enabled:true,opacity:.9,explored:[v.hex]};next.journal.push({id:'genesis:'+c.campaignId,title:('Campaign Beginnings — '+f.name).slice(0,100),text:summary(state).replace(/\n\nConfirm this foundation[\s\S]*$/,'')+'\nParticipating adventurers: '+roster.map(c=>c.name).join(', ')});}
  next.messages.push({id:'ai-player:'+c.requestId,role:'player',author:roster.find(ch=>ch.id===c.characterId)!.name,text:c.action},{id:'ai-gm:'+c.requestId,role:'gm',author:'The Game Master',text:narration,provider:reply.provider});
  repo.update(record.id,record.revision,next,{locationsValidated:true,explorationValidated:true});db.prepare('INSERT INTO genesis_receipts VALUES (?,?,?,?)').run(c.campaignId,c.requestId,fingerprint,JSON.stringify(reply));db.exec('COMMIT');return reply;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
function mockDecision(s:GenesisState,action:string){
 const draft=structuredClone(s.draft);if(/^(?:unnamed village|village)$/i.test(draft.name))draft.name='Bellhaven';let intent:'discuss'|'modify_village'|'retry_village'|'accept_village'|'review'|'confirm'='discuss';
 if(!draft.description){draft.description='Rain beads on the forge canopy above a muddy causeway. A cracked bell hangs by the meeting house.';draft.npcs=['A smith examining the cracked bell'];draft.rumors=['Someone reports lights near the old road; the report is unverified.'];}
 if(/siblings/i.test(action))draft.relationships=['The participating adventurers are siblings.'];
 const goal=/(?:our (?:main )?goal is|we want to) ([^.]+)/i.exec(action);if(goal)draft.purpose=goal[1];
 if(/darker|dark|myster/i.test(action))draft.tone='Dark mystery';
 if(/reactive/i.test(action))draft.initiative='Reactive';else if(/active gm/i.test(action))draft.initiative='Active';
 if(/live|living/i.test(action))draft.opening='Already living in the village, with individual whereabouts to be established by the players.';
 if(/mostly dwarven/i.test(action)){draft.description+=' Player-requested modification: most inhabitants are dwarves.';intent='modify_village';}
 if(/try (?:another|again)|different village/i.test(action))intent='retry_village';else if(/accept village|accept the village/i.test(action))intent='accept_village';else if(/review/i.test(action))intent='review';else if(/confirm|accept this and begin/i.test(action))intent='confirm';
 if(intent==='confirm')Object.assign(draft,s.draft);
 return {intent,villageId:null,draft,narration:`Creative proposal for ${draft.name} · ${s.hex}: ${draft.description} ${s.generation.results.length?'Official table results are recorded separately; this mock prose is illustrative.':''} ${draft.relationships.length?'Your proposed relationships are noted.':'How might these characters know one another?'} ${draft.purpose?'Your shared purpose is noted.':'What could draw you into the wilderness?'} Tell me what you would keep or change.`,openingScene:''};
}
