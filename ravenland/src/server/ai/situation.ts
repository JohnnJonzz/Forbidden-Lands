import type {CampaignRecord,Message} from '../../lib/types';
import type {SqliteCampaignRepository} from '../sqlite';
import type {Memory} from '../../lib/ai/schema';
import {pendingActionReferences} from '../dice/gm-submission';

type Snapshot={campaign?:{hex?:string;location?:string;date?:string;quarter?:string};currentScene?:{narration?:{id:string}[]};history?:{id:string;role:string}[];rules?:{planner?:{plan?:{intent?:string}}};rollSubmission?:unknown};
const short=(s:string,n=1200)=>s.slice(0,n);
const isRollPrompt=(s:string)=>s.length<350&&/^\s*(?:please\s+)?(?:make\b.*\broll|roll\b|you (?:should|need to|can) roll\b|which action\b|the recorded\b.*\bresult)/i.test(s);
export function sceneFrame(repo:SqliteCampaignRepository,record:CampaignRecord,allowed:(m:Message)=>boolean,linkedActionId?:string){
 const s=record.session,c=s.campaign,rows=repo.db.prepare("SELECT id,context_json FROM ai_requests WHERE campaign_id=? AND context_json IS NOT NULL AND kind IN ('chat','roll') AND status='completed' ORDER BY updated_at DESC LIMIT 100").all(record.id);
 const snapshots=new Map(rows.map(r=>[r.id as string,JSON.parse(r.context_json as string) as Snapshot]));
 if(linkedActionId&&!snapshots.has(linkedActionId)){const row=repo.db.prepare("SELECT context_json FROM ai_requests WHERE campaign_id=? AND id=? AND kind='chat' AND status='completed'").get(record.id,linkedActionId);if(row?.context_json)snapshots.set(linkedActionId,JSON.parse(row.context_json as string))}
 const samePlace=(p:Snapshot['campaign'])=>!!p&&p.hex===c.hex&&p.location===c.location&&p.date===c.date&&p.quarter===c.quarter;
 const linked=linkedActionId?snapshots.get(linkedActionId):undefined,previous=[...snapshots.values()].find(p=>samePlace(p.campaign));
 const pinned=[...(samePlace(linked?.campaign)?linked?.currentScene?.narration??linked?.history?.filter(m=>m.role==='gm')??[]:[]),...(previous?.currentScene?.narration??[])].map(m=>m.id);
 const candidates=s.messages.filter(m=>m.role==='gm'&&m.author!=='Quarter-Day Controller'&&m.provider!=='application'&&allowed(m)&&(!m.aiRequestId||snapshots.get(m.aiRequestId)?.rules?.planner?.plan?.intent!=='rules_reference'||!!snapshots.get(m.aiRequestId)?.rollSubmission)&&(!m.aiRequestId||!snapshots.has(m.aiRequestId)||samePlace(snapshots.get(m.aiRequestId)?.campaign)));
 const pool=candidates.filter((m,i)=>i>=candidates.length-100||pinned.includes(m.id));
 const substantive=pool.filter(m=>!isRollPrompt(m.text)),latest=pool.at(-1),selected=[...substantive.slice(-2),...(latest?[latest]:[])].filter((m,i,a)=>a.findIndex(v=>v.id===m.id)===i).slice(-3);
 const narration=selected.map(m=>({id:m.id,text:short(m.text),origin:'AI-generated narration',authority:'unconfirmed' as const,locationVerified:!!m.aiRequestId&&samePlace(snapshots.get(m.aiRequestId)?.campaign)}));
 return {location:{hex:c.hex,name:c.location,terrain:c.terrain,date:c.date,quarter:c.quarter,weather:c.weather,source:'Current persisted campaign state'},narration,
  linkedAction:linkedActionId?{requestId:linkedActionId,location:linked?.campaign??null,sameCurrentSituation:samePlace(linked?.campaign)}:null,
  focusText:[c.location,...narration.map(n=>n.text)].join(' ').slice(0,3000),pool};
}
export function sceneDetails(repo:SqliteCampaignRepository,record:CampaignRecord,frame:ReturnType<typeof sceneFrame>,memories:Memory[],action:string,characterId?:string){
 const mentions=(text:string,m:Memory)=>[m.title,...m.npcIds.map(id=>id.replace(/[-_:]/g,' '))].filter(s=>s.length>2).some(term=>new RegExp('\\b'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(text));
 const npcContext=memories.filter(m=>m.category==='NPC'||m.npcIds.length).map(m=>({m,mention:[...frame.pool].reverse().find(message=>mentions(message.text,m))})).filter(v=>!!v.mention).slice(0,6).map(({m,mention})=>({memoryId:m.id,title:m.title,npcIds:m.npcIds,canonicalSummary:short(m.summary,450),latestNarratedMention:{messageId:mention!.id,text:short(mention!.text,550),authority:'unconfirmed narration'},presence:'Read the latest excerpt; a mention alone does not establish current presence. Departures/deaths override older presence.'}));
 const pendingActions=characterId?pendingActionReferences(repo,record,characterId).slice(0,4):[];
 const threads=memories.filter(m=>m.storyState==='active'&&['Quest','Unresolved Story Thread'].includes(m.category)).slice(0,3).map(m=>({memoryId:m.id,title:m.title,summary:short(m.summary,550),authority:'approved/corrected party-known memory'}));
 return {location:frame.location,narration:frame.narration,linkedAction:frame.linkedAction,immediateAction:{text:short(action,1800),characterId:characterId??null},partyRoster:record.session.characters.map(c=>({id:c.id,name:c.name})),npcContext,pendingActions,unresolvedThreads:threads,
  knowledgePolicy:'Campaign location/time are authoritative. Approved/corrected facts override narration. Scene excerpts carry immediate threats/obstacles, not confirmed new canon. A party roster or NPC mention is not proof of presence. Player-known backgrounds are not automatically known to NPCs. Never move the party or commit a new development from this view.'};
}
