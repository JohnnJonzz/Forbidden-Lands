import {createHash,randomUUID} from 'node:crypto';
import {gmTurnSchema,type GMTurn,type AIReply,type GMStreamEvent,type GMOutput} from '../../lib/ai/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {getLocalRepository} from '../sqlite';
import {mockGameMaster} from '../../lib/mock';
import {AIError,publicAIError,serverAIConfig,estimatedCost} from './config';
import {aiConfig,sceneImages,type SessionCursor} from './store';
import {assembleContext} from './context';
import {SqliteMemoryRepository} from './memory';
import {OpenAIProvider,type GMProvider,type ProviderResult} from './provider';
import {quarterDayGM} from '../journey/gm-contract';
interface RequestRow {id:string;kind:string;fingerprint:string;status:string;attempts:number;payload:string;response_json:string|null;started_at:string;updated_at:string}
const playerId=(id:string)=>'ai-player:'+id,gmId=(id:string)=>'ai-gm:'+id;
export function recentAIRequests(repo:SqliteCampaignRepository,campaignId:string){return (repo.db.prepare('SELECT id,kind,status,payload,error_code AS errorCode,updated_at AS updatedAt FROM ai_requests WHERE campaign_id=? ORDER BY updated_at DESC LIMIT 15').all(campaignId)).map(row=>({...row,payload:JSON.parse(row.payload as string)}))}
export class AIService {
 constructor(readonly repo:SqliteCampaignRepository=getLocalRepository(),readonly provider:GMProvider=new OpenAIProvider()){}
 private reply(row:RequestRow):AIReply {const raw=JSON.parse(row.response_json!);return {...raw.reply,replayed:true}}
 private claim(c:GMTurn){const db=this.repo.db,fingerprint=createHash('sha256').update(JSON.stringify(c.kind==='quarter'?{kind:c.kind,entryId:c.entryId}:{kind:c.kind,action:c.action,characterId:c.characterId,entryId:c.entryId})).digest('hex');db.exec('BEGIN IMMEDIATE');try{
  const record=this.repo.get(c.campaignId);if(!record)throw new AIError('not_found','Campaign not found',404);const config=aiConfig(this.repo,c.campaignId);
  if(c.kind==='recap'){const prior=db.prepare('SELECT request_id FROM ai_recaps WHERE campaign_id=? AND session_id=?').get(c.campaignId,config.sessionId) as {request_id:string}|undefined;if(prior){const row=db.prepare('SELECT * FROM ai_requests WHERE campaign_id=? AND id=?').get(c.campaignId,prior.request_id) as unknown as RequestRow;db.exec('COMMIT');return {cached:this.reply(row),attempt:0}}}
  const prior=db.prepare('SELECT * FROM ai_requests WHERE campaign_id=? AND id=?').get(c.campaignId,c.requestId) as unknown as RequestRow|undefined;
  if(prior&&prior.fingerprint!==fingerprint)throw new AIError('duplicate','Request ID reused for a different message',409);
  if(prior?.status==='completed'){db.exec('COMMIT');return {cached:this.reply(prior),attempt:0}}
  if(prior?.status==='running'&&Date.now()-Date.parse(prior.updated_at)<150000)throw new AIError('in_progress','This GM request is still running. Wait before retrying.',409);
  const concurrent=db.prepare("SELECT id FROM ai_requests WHERE campaign_id=? AND status='running' AND id<>? AND updated_at>?").get(c.campaignId,c.requestId,new Date(Date.now()-150000).toISOString());if(concurrent)throw new AIError('in_progress','Another GM request is running for this campaign. Wait for its reply.',409);
  const now=new Date().toISOString();
  if(c.kind==='chat'){const character=record.session.characters.find(ch=>ch.id===c.characterId);if(!character)throw new AIError('character','Choose a current party member');if(!record.session.messages.some(m=>m.id===playerId(c.requestId)))this.repo.update(record.id,record.revision,{...record.session,messages:[...record.session.messages,{id:playerId(c.requestId),role:'player',author:character.name,text:c.action}]})}
  if(prior)db.prepare("UPDATE ai_requests SET status='running',attempts=attempts+1,error_code=NULL,updated_at=? WHERE campaign_id=? AND id=?").run(now,c.campaignId,c.requestId);
  else db.prepare('INSERT INTO ai_requests (id,campaign_id,kind,fingerprint,status,payload,started_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(c.requestId,c.campaignId,c.kind,fingerprint,'running',JSON.stringify(c),now,now);
  db.exec('COMMIT');return {cached:null,attempt:(prior?.attempts??0)+1};
 }catch(e){db.exec('ROLLBACK');throw e}}
 private usage(campaignId:string,id:string,result:Pick<ProviderResult,'provider'|'model'|'inputTokens'|'outputTokens'>,errorCode:string|null){this.repo.db.prepare('INSERT INTO ai_usage VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),campaignId,id,result.provider,result.model,result.inputTokens,result.outputTokens,result.provider==='mock'?0:estimatedCost(result.inputTokens,result.outputTokens),errorCode,new Date().toISOString())}
 async run(raw:unknown,emit:(e:GMStreamEvent)=>void=()=>{}):Promise<AIReply>{const c=gmTurnSchema.parse(raw),claim=this.claim(c);if(claim.cached){emit({type:'done',reply:claim.cached});return claim.cached}let result:ProviderResult|undefined;
 try{const config=aiConfig(this.repo,c.campaignId),context=assembleContext(this.repo,c.campaignId,c.action,{kind:c.kind,entryId:c.entryId,excludeMessageId:playerId(c.requestId)}),start=this.repo.get(c.campaignId)!,captureEnd:SessionCursor={messages:start.session.messages.length,journal:start.session.journal.length,days:start.session.dayTracker?.length??0};
  this.repo.db.prepare('UPDATE ai_requests SET context_json=? WHERE campaign_id=? AND id=?').run(JSON.stringify(context),c.campaignId,c.requestId);
  const model=serverAIConfig();if(model.provider==='mock'){
   const character=start.session.characters.find(ch=>ch.id===c.characterId)?.name??'The party';const narration=c.kind==='recap'?`Mock recap · ${start.session.campaign.date}: Review the recorded session events and add your own summary. No AI API was called.`:mockGameMaster.respond(c.action||'Review the submitted quarter-day activities',character);
   result={provider:'mock',model:'mock',inputTokens:0,outputTokens:0,output:{narration,memoryProposals:[],actions:[],selectedImageId:null}};emit({type:'text',text:narration});
  }else result=await this.provider.generate({kind:c.kind,context,playerAction:c.action,actingCharacterId:c.characterId},config.settings,text=>emit({type:'text',text}));
  const output=result.output,db=this.repo.db;db.exec('BEGIN IMMEDIATE');try{
   const lease=db.prepare('SELECT attempts,status FROM ai_requests WHERE campaign_id=? AND id=?').get(c.campaignId,c.requestId);if(lease?.attempts!==claim.attempt||lease?.status!=='running')throw new AIError('superseded','This request attempt was superseded; reload its saved response.',409);
   const current=this.repo.get(c.campaignId)!;let next=current.session;const memory=new SqliteMemoryRepository(this.repo);let partyProposals=0;
   for(const proposal of output.memoryProposals){try{const {targetMemoryId,...content}=proposal;const saved=memory.propose(c.campaignId,content,{kind:c.kind==='recap'?'request':'chat',id:c.kind==='recap'?c.requestId:gmId(c.requestId)},targetMemoryId);if(saved?.visibility==='Party Known'&&saved.status==='proposed')partyProposals++}catch(e){if(e instanceof AIError)continue;throw e}}
   const actions=this.validActions(c,output.actions),selectedImageId=sceneImages(this.repo,c.campaignId).some(i=>i.id===output.selectedImageId)?output.selectedImageId:null;
   const reply:AIReply={requestId:c.requestId,provider:result.provider,narration:output.narration,actions,selectedImageId,partyProposals};
   if(c.kind==='recap'){const id=randomUUID();db.prepare('INSERT INTO ai_recaps (id,campaign_id,session_id,request_id,text,capture_end,created_at) VALUES (?,?,?,?,?,?,?)').run(id,c.campaignId,config.sessionId,c.requestId,output.narration,JSON.stringify(captureEnd),new Date().toISOString());reply.recapId=id}
   else if(!next.messages.some(m=>m.id===gmId(c.requestId))){next={...next,messages:[...next.messages,{id:gmId(c.requestId),role:'gm',author:'The Game Master',text:output.narration,provider:result.provider,aiRequestId:c.requestId,...(selectedImageId?{sceneImageId:selectedImageId}:{})}]};this.repo.update(current.id,current.revision,next)}
   this.usage(c.campaignId,c.requestId,result,null);db.prepare("UPDATE ai_requests SET status='completed',response_json=?,error_code=NULL,updated_at=? WHERE campaign_id=? AND id=?").run(JSON.stringify({reply,output}),new Date().toISOString(),c.campaignId,c.requestId);db.exec('COMMIT');emit({type:'done',reply});return reply;
  }catch(e){db.exec('ROLLBACK');throw e}
 }catch(error){const safe=publicAIError(error),config=serverAIConfig();this.repo.db.prepare("UPDATE ai_requests SET status='failed',error_code=?,updated_at=? WHERE campaign_id=? AND id=? AND attempts=?").run(safe.code,new Date().toISOString(),c.campaignId,c.requestId,claim.attempt);this.usage(c.campaignId,c.requestId,result??{provider:config.provider,model:config.model,inputTokens:null,outputTokens:null,...(error instanceof AIError?error.usage:{})},safe.code);throw safe}
 }
 private validActions(c:GMTurn,actions:GMOutput['actions']){const s=this.repo.get(c.campaignId)!.session;return actions.filter(a=>a.type==='request_quarter_day'||a.entryId&&s.dayTracker?.some(e=>e.id===a.entryId)&&!s.chatJourney?.updates.some(u=>u.entryId===a.entryId&&u.kind==='completed')).filter(a=>a.type!=='propose_quarter_resolution'||!!a.resolution).map(a=>({...a,text:a.text.slice(0,5000)}))}
 async test(campaignId:string){if(!this.repo.get(campaignId))throw new AIError('not_found','Campaign not found',404);const requestId='connection:'+randomUUID();try{const result=await this.provider.test();this.usage(campaignId,requestId,{...result,provider:'openai'},null);return {connected:true,model:result.model}}catch(e){const error=publicAIError(e);this.usage(campaignId,requestId,{provider:'openai',model:serverAIConfig().model,inputTokens:null,outputTokens:null},error.code);throw error}}
 confirmAction(campaignId:string,requestId:string,index:number){const db=this.repo.db;db.exec('BEGIN IMMEDIATE');try{const row=db.prepare("SELECT response_json FROM ai_requests WHERE campaign_id=? AND id=? AND status='completed'").get(campaignId,requestId);if(!row)throw new AIError('action','Completed GM response not found');if(db.prepare('SELECT 1 FROM ai_action_receipts WHERE campaign_id=? AND request_id=? AND action_index=?').get(campaignId,requestId,index)){db.exec('COMMIT');return {replayed:true}}const reply=JSON.parse(row.response_json as string).reply as AIReply,action=reply.actions[index];if(!action)throw new AIError('action','Proposed action not found');
  // Release the transaction before calling the existing transactional journey service.
  db.exec('COMMIT');const actionId=createHash('sha256').update(campaignId+':'+requestId+':'+index).digest('hex');const uuid=actionId.slice(0,8)+'-'+actionId.slice(8,12)+'-4'+actionId.slice(13,16)+'-a'+actionId.slice(17,20)+'-'+actionId.slice(20,32),gm=quarterDayGM(this.repo);
  if(action.type==='request_quarter_day')gm.requestForm(campaignId,uuid);
  else if(action.type==='ask_quarter_question')gm.requestInformation(campaignId,action.entryId!,action.text,uuid);
  else if(action.type==='narrate_quarter_day')gm.publishNarrative(campaignId,action.entryId!,action.text,uuid);
  else gm.proposeResolution(campaignId,action.entryId!,action.resolution!,uuid);
  db.prepare('INSERT OR IGNORE INTO ai_action_receipts VALUES (?,?,?,?)').run(campaignId,requestId,index,new Date().toISOString());return {replayed:false};
 }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}}
}
