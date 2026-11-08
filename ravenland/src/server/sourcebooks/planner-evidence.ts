import type {SourceRequirement,RetrievalPlan} from '../../lib/rules/planner';
import type {RulePassage} from '../../lib/sourcebooks/schema';
const norm=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const contains=(text:string,term:string)=>norm(text).includes(norm(term));
export function referenceIdentity(p:RulePassage){return p.title+' '+('headingPath'in p?p.headingPath?.join(' ')??p.heading??'':p.heading??'')}
export function requirementEvidence(p:RulePassage,r:SourceRequirement):'covered'|'limited'|'missing'{
 const identity=referenceIdentity(p),body=p.text.replace(/^#{1,6}[^\n]*$/gm,'').trim();
 const anchored=r.id==='site'?(p.category==='Adventure'||p.category==='Campaign Reference')&&r.anchors.some(a=>contains(identity+' '+body,a)):r.anchors.some(a=>contains(identity,a));
 const substantive=(body.match(/[\p{L}\p{N}]+/gu)??[]).length>=8;
 const groups=r.contentGroups.every(group=>group.some(term=>contains(body,term)));
 if(anchored&&substantive&&groups)return 'covered';
 return (anchored||r.anchors.some(a=>contains(body,a)))?'limited':'missing';
}
export function planCoverage(passages:RulePassage[],plan:RetrievalPlan){return plan.requirements.map(r=>{const exact=passages.filter(p=>requirementEvidence(p,r)==='covered'),partial=passages.filter(p=>requirementEvidence(p,r)==='limited');return {id:r.id,label:r.label,role:r.role,status:exact.length?'covered' as const:partial.length?'limited' as const:'missing' as const,documentIds:[...new Set((exact.length?exact:partial).map(p=>p.documentId))]}})}
