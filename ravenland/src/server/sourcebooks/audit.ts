import type {CandidateDiagnostic,RetrievalAudit,SelectionDecision} from '../../lib/sourcebooks/schema';
import type {SqliteCampaignRepository} from '../sqlite';
import {CompendiumStore} from '../compendium/store';
export function retrievalAudit(repo:SqliteCampaignRepository,campaignId:string,candidates:CandidateDiagnostic[],title?:string):RetrievalAudit {
 const documents=new Map<string,RetrievalAudit['curatedDocuments'][number]>();
 for(const c of candidates){if(c.sourceType==='pdf')continue;let d=documents.get(c.documentId);if(!d){d={id:c.documentId,title:c.title,consideredSections:0,selectedSections:0,omittedReasons:[]};documents.set(c.documentId,d)}d.consideredSections++;if(c.decision==='selected')d.selectedSections++;else if(!d.omittedReasons.includes(c.decision))d.omittedReasons.push(c.decision as SelectionDecision)}
 const allHealth=new CompendiumStore(repo).indexHealth(campaignId,title);const index=title?allHealth:allHealth.filter(d=>documents.has(d.id)||d.state!=='indexed');
 return {candidates:candidates.slice(0,100),curatedDocuments:[...documents.values()].slice(0,100),index,candidatesTruncated:candidates.length>100};
}
