import {distinctMechanicalEvidence} from './mechanical-facts';
import type {RetrievalPlan} from '../../lib/rules/planner';
import type {RulePassage,SelectionDecision} from '../../lib/sourcebooks/schema';
import {requirementEvidence} from './planner-evidence';
import {rankRules,overlap} from './selection';
import {coversSubject,sourceTier,passageTokens} from './coverage';
import type {MechanicalTopic} from '../../lib/rules/topics';
export function selectPlanned(ranked:ReturnType<typeof rankRules>['ranked'],plan:RetrievalPlan,subjects:MechanicalTopic[],budgetTokens:number,maxChunks:number){
 const narrow=!!plan.weaponFacts||plan.requirements.some(r=>r.id.startsWith('action:'));
 const passages:RulePassage[]=[],decisions=new Map<string,SelectionDecision>(),covered=new Set<string>();let estimatedTokens=0,duplicatesRemoved=0;
 function select(next:typeof ranked[number]){const p=next.passage;if(decisions.has(p.chunkId))return decisions.get(p.chunkId)==='selected';if(passages.length>=maxChunks){decisions.set(p.chunkId,'section_limit');return false}if(passages.some(a=>overlap(a,p)&&!distinctMechanicalEvidence(a,p,plan))){duplicatesRemoved++;decisions.set(p.chunkId,'deduplication');return false}const estimated=passageTokens(p);if(estimatedTokens+estimated>budgetTokens){decisions.set(p.chunkId,'token_budget');return false}passages.push(p);estimatedTokens+=estimated;next.topics.forEach(t=>covered.add(t));decisions.set(p.chunkId,'selected');return true}
 for(const next of ranked.filter(r=>sourceTier(r.passage)===0))select(next);
 // Requirements, not keyword frequency, decide which procedures get first use
 // of the shared context budget. One passage may support several requirements.
 for(const requirement of [...plan.requirements].sort((a,b)=>Number(b.role==='governing')-Number(a.role==='governing'))){
  if(passages.some(p=>requirementEvidence(p,requirement)==='covered'))continue;
  const candidates=ranked.filter(r=>requirementEvidence(r.passage,requirement)==='covered').sort((a,b)=>sourceTier(a.passage)-sourceTier(b.passage)||b.score-a.score||a.index-b.index);
  for(const next of candidates)if(select(next))break;
 }
 // Retain the existing topic fallback for unknown/partially indexed procedures.
 for(const subject of subjects){if(passages.some(p=>coversSubject(p,subject)))continue;for(const next of ranked.filter(r=>coversSubject(r.passage,subject)).sort((a,b)=>sourceTier(a.passage)-sourceTier(b.passage)||b.score-a.score))if(select(next))break}
 for(const next of ranked.filter(r=>!('sourceType'in r.passage)&&(!narrow||plan.requirements.some(req=>requirementEvidence(r.passage,req)==='covered'))))if(select(next))break;
 const fromDocument=(id:string)=>passages.filter(p=>p.documentId===id).length;
 const remaining=ranked.filter(r=>!decisions.has(r.passage.chunkId)&&(!narrow||plan.requirements.some(req=>requirementEvidence(r.passage,req)==='covered')));
 while(remaining.length&&passages.length<maxChunks){remaining.sort((a,b)=>(b.score+b.topics.filter(t=>!covered.has(t)).length*22-fromDocument(b.passage.documentId)*12)-(a.score+a.topics.filter(t=>!covered.has(t)).length*22-fromDocument(a.passage.documentId)*12)||a.index-b.index);select(remaining.shift()!)}
 for(const next of ranked)if(!decisions.has(next.passage.chunkId))decisions.set(next.passage.chunkId,passages.length>=maxChunks?'section_limit':'ranking');
 return {passages,estimatedTokens,decisions,duplicatesRemoved};
}
