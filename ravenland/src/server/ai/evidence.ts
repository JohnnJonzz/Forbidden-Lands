import type {Session} from '../../lib/types';
import type {GMTurn,MemoryContent,MemoryProvenance,ProposalEvidence} from '../../lib/ai/schema';
import {factWords,normalized,recallIntent,relatedToQuestion} from '../../lib/ai/canon';
import type {SqliteCampaignRepository} from '../sqlite';
import {aiConfig} from './store';
export interface EvidenceSource {sourceType:ProposalEvidence['sourceType'];sourceId:string;text:string;origin:MemoryProvenance['origin'];authority:'canonical'|'supporting'|'unconfirmed';knowledge:'event'|'statement';sessionId:string;visibility:'Party Known';historicalGuess?:boolean;index?:number;recap?:boolean}
export function rejectedEvidenceIds(repo:SqliteCampaignRepository,campaignId:string){const ids=new Set<string>();for(const r of repo.db.prepare("SELECT data FROM campaign_memories WHERE campaign_id=? AND visibility='Party Known' AND json_extract(data,'$.decision')='rejected'").all(campaignId)){const data=JSON.parse(r.data as string);if(data.source?.kind==='chat')ids.add(data.source.id);if(data.provenance?.generatedBy)ids.add(data.provenance.generatedBy);if(data.provenance?.sourceType==='chat'&&data.provenance.origin==='AI-generated')ids.add(data.provenance.sourceId)}return ids}
export function rejectedJournalIds(repo:SqliteCampaignRepository,campaignId:string){return new Set(repo.db.prepare("SELECT json_extract(data,'$.source.id') AS id FROM campaign_memories WHERE campaign_id=? AND visibility='Party Known' AND json_extract(data,'$.decision')='rejected' AND json_extract(data,'$.source.kind')='journal'").all(campaignId).map(r=>r.id as string))}
export interface EvidenceScope {session:Session;sessionId:string;rejected:Set<string>;rejectedJournals:Set<string>}
export function evidenceSource(repo:SqliteCampaignRepository,campaignId:string,type:ProposalEvidence['sourceType'],id:string,scope?:EvidenceScope):EvidenceSource|null{
 const s=scope?.session??repo.get(campaignId)?.session;if(!s)return null;const sessionId=scope?.sessionId??aiConfig(repo,campaignId).sessionId,base={sourceType:type,sourceId:id,sessionId,visibility:'Party Known' as const};
 if(type==='chat'){const index=s.messages.findIndex(m=>m.id===id),m=s.messages[index];if(!m||m.quarterDayFormId||(scope?.rejected??rejectedEvidenceIds(repo,campaignId)).has(id)||s.dice?.some(d=>d.id===id))return null;
  if(m.author==='Quarter-Day Controller')return {...base,text:m.text,origin:'Application-maintained',authority:'supporting',knowledge:'event',index};
  if(m.role==='player')return {...base,text:m.text,origin:'Player-established',authority:'supporting',knowledge:'statement',index};
  const request=m.aiRequestId?repo.db.prepare('SELECT payload FROM ai_requests WHERE campaign_id=? AND id=?').get(campaignId,m.aiRequestId):null;
  const payload=request?JSON.parse(request.payload as string):null,historicalGuess=!!payload&&recallIntent(payload.action??'').mode==='historical_recall'||/\b(?:previously|earlier|you (?:had |once )?promised|last session|remember when)\b/i.test(m.text);
  return {...base,text:m.text,origin:'AI-generated',authority:'unconfirmed',knowledge:'event',historicalGuess,index};
 }
 if(type==='journal'){const entry=s.journal.find(j=>j.id===id);if(!entry||(scope?.rejectedJournals??rejectedJournalIds(repo,campaignId)).has(id))return null;const recap=repo.db.prepare('SELECT session_id FROM ai_recaps WHERE campaign_id=? AND journal_entry_id=?').get(campaignId,id);return {...base,sessionId:recap?.session_id as string??sessionId,text:entry.title+'\n'+entry.text,origin:'Player-established',authority:'supporting',knowledge:recap?'event':'statement',recap:!!recap}}
 if(type==='memory'){const row=repo.db.prepare("SELECT data FROM campaign_memories WHERE campaign_id=? AND id=? AND visibility='Party Known' AND status IN ('approved','corrected')").get(campaignId,id);if(!row)return null;const m=JSON.parse(row.data as string);return {...base,text:m.title+'\n'+m.summary,origin:'GM-established',authority:'canonical',knowledge:m.category==='Rumor'?'statement':'event'}}
 if(type==='campaign_record'){let value:unknown=null;if(id==='campaign')value=s.campaign;else if(id.startsWith('character:')){const c=s.characters.find(c=>c.id===id.slice(10));if(c)value={name:c.name,kin:c.kin,profession:c.profession}}else if(id.startsWith('location:'))value=s.locations?.find(l=>l.id===id.slice(9));else if(id.startsWith('quarter:'))value=s.dayTracker?.find(d=>d.id===id.slice(8));if(!value)return null;const rumor=typeof value==='object'&&value!==null&&'status' in value&&value.status==='Rumored';return {...base,text:JSON.stringify(value),origin:'Application-maintained',authority:rumor?'unconfirmed':'canonical',knowledge:rumor?'statement':'event'}}
 return null;
}
export interface EvidenceIndex {sourceType:ProposalEvidence['sourceType'];sourceId:string;origin:MemoryProvenance['origin'];authority:EvidenceSource['authority'];knowledge:EvidenceSource['knowledge'];excerpt:string}
export function evidenceIndex(source:EvidenceSource):EvidenceIndex {return {sourceType:source.sourceType,sourceId:source.sourceId,origin:source.origin,authority:source.authority,knowledge:source.knowledge,excerpt:source.text.slice(0,240)}}
function playerAccepts(source:EvidenceSource){return source.origin==='Player-established'&&!source.text.trim().endsWith('?')&&recallIntent(source.text).mode!=='historical_recall'&&!/\b(?:no|never|not|wrong|false|disagree|reject|didn't|don't)\b/i.test(source.text)&&(/\b(?:I|we|the party)\s+(?:(?:now|later|then|also)\s+)?(?:accept|agre|promis|help|follow|return|recover|tak|approach|speak|talk|retriev|find|found|giv|hand|deliver|carry)\w*\b/i.test(source.text)||/^(?:yes|agreed|accepted)\b/i.test(source.text))}

export function validateAutomaticEvidence(repo:SqliteCampaignRepository,campaignId:string,candidate:MemoryContent,evidence:ProposalEvidence|null,turn:GMTurn,index:EvidenceIndex[],generatedBy:string):MemoryProvenance|null{
 // Recall is read-only for automatic memory generation, even if a model ignores
 // the instructions. A GM can still record an explicit manual correction.
 if(turn.kind==='chat'&&recallIntent(turn.action).mode==='historical_recall'||!evidence||evidence.claimType==='historical_recall')return null;
 if(!index.some(i=>i.sourceType===evidence.sourceType&&i.sourceId===evidence.sourceId))return null;
 const source=evidenceSource(repo,campaignId,evidence.sourceType,evidence.sourceId);if(!source||source.historicalGuess)return null;
 const quote=normalized(evidence.excerpt);if(quote.length<12||!normalized(source.text).includes(quote))return null;
 const npcNames=candidate.npcIds.map(id=>id.split(/[-_:]/).find(part=>/^[a-zA-Z]{3,}$/.test(part)&&!['npc','character'].includes(part.toLowerCase()))).filter((name):name is string=>!!name);if(npcNames.some(name=>!quote.includes(normalized(name))))return null;
 if(/\b(?:recovered|found|returned|retrieved)\b/i.test(candidate.summary)&&!/\b(?:recovered|found|returned|retrieved)\b/i.test(quote))return null;
 const summaryWords=factWords(candidate.summary),quoteWords=factWords(quote);if(summaryWords.length&&summaryWords.filter(w=>quoteWords.includes(w)||quote.includes(w)).length<Math.min(2,summaryWords.length))return null;
 // Reported speech establishes that a statement was made, not that it is true.
 if((source.knowledge==='statement'&&/\b(?:says?|said|claims?|claimed|believes?|rumou?r|told)\b/i.test(source.text))&&!/\b(?:says?|said|claims?|claimed|believes?|rumou?r|told|reported)\b/i.test(candidate.summary))return null;
 let acceptedBy:EvidenceSource|null=null;
 if(source.origin==='AI-generated'){if(!evidence.acceptedByMessageId)return null;acceptedBy=evidenceSource(repo,campaignId,'chat',evidence.acceptedByMessageId);if(!acceptedBy||!playerAccepts(acceptedBy)||(acceptedBy.index??-1)<=(source.index??Infinity))return null;const subject=factWords(candidate.title+' '+candidate.npcIds.join(' '));if(subject.length&&!subject.some(w=>normalized(acceptedBy!.text).includes(w)))return null}
 // A valid citation to an NPC's identity is not evidence for a different promise.
 const obligation=/\b(?:promis\w*|pledge\w*|owe\w*|agreed)\b([\s\S]*)/i.exec(candidate.summary),goal=obligation?factWords(obligation[1]).filter(w=>!['him','her','them','help'].includes(w)):[];
 const support=normalized(quote+' '+(acceptedBy?.text??''));if(goal.length&&goal.filter(w=>support.includes(w)).length<Math.min(2,goal.length))return null;
 const claimType=source.knowledge==='statement'&&!playerAccepts(source)?'statement':evidence.claimType;
 return {sourceType:source.recap?'session_recap':source.sourceType,sourceId:source.sourceId,sessionId:source.sessionId,excerpt:evidence.excerpt.slice(0,600),origin:source.origin,claimType,visibility:source.visibility,...(acceptedBy?{acceptedByMessageId:acceptedBy.sourceId}:{}),generatedBy};
}
export function recallHasEvidence(sources:EvidenceSource[],query:string){const intent=recallIntent(query);return sources.some(s=>s.authority!=='unconfirmed'&&s.origin!=='AI-generated'&&(s.knowledge==='event'||s.recap||playerAccepts(s)||/\b(?:say|said|tell|told|claim|statement)\b/i.test(query))&&!(s.knowledge==='statement'&&recallIntent(s.text).mode==='historical_recall')&&(!/promis|pledge|owe/i.test(query)||/promis|pledge|owe/i.test(s.text))&&relatedToQuestion(s.text,query,intent.subjects))}
