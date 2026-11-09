import {weaponRow,damageRule,hitThresholdRule,rangedAttackRoll,mechanicalFactCoverage} from './mechanical-facts';
import type {SourceRequirement,RetrievalPlan} from '../../lib/rules/planner';
import type {RulePassage} from '../../lib/sourcebooks/schema';
const norm=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const contains=(text:string,term:string)=>norm(text).includes(norm(term));
export function referenceIdentity(p:RulePassage){return p.title+' '+('primaryTopic'in p?p.primaryTopic??'':'')+' '+('headingPath'in p?p.headingPath?.join(' ')??p.heading??'':p.heading??'')}
export function requirementEvidence(p:RulePassage,r:SourceRequirement):'covered'|'limited'|'missing'{
 if(r.id.startsWith('action:')){const name=r.anchors[0].replace(/ /g,'\\s+'),m=p.text.match(new RegExp('\\b'+name+'\\s*:\\s*(?:Fast|Slow)\\s+action\\b','i'));return m&&p.text.slice(m.index).split(/\s+/).length>=8?'covered':r.anchors.some(a=>contains(p.text,a))?'limited':'missing'}
 if(r.fact){const eligible=!('sourceType'in p)||p.sourceType==='house-rule';if(!eligible)return 'missing';if(r.fact.kind==='weapon'){const row=weaponRow(p,r.fact.weapon);return r.fact.fields.every(field=>row[field])?'covered':p.text.toLowerCase().includes(r.fact.weapon.toLowerCase())?'limited':'missing'}const found=r.fact.kind==='extra_damage'?damageRule(p).extra:hitThresholdRule(p)?.fact??rangedAttackRoll(p);return found?'covered':'missing'}
 const identity=referenceIdentity(p);let body=p.text.replace(/^#{1,6}[^\n]*$/gm,'').trim();
 // PDF chunks often start with a running page number/header rather than the
 // entry heading. Recognize a standalone entry inside the extracted body,
 // bounded before another all-caps entry; a prose mention alone is insufficient.
 let bodyAnchor=false;
 if(!('sourceType'in p)&&(r.id==='entry'||r.role==='governing'&&r.id!=='site')){
  const lines=body.split('\n'),start=lines.findIndex(line=>r.anchors.some(a=>norm(line)===norm(a)||norm(line)===norm(a)+' profession'||norm(line)===norm(a)+' skill'||r.id!=='entry'&&norm(line).startsWith(norm(a)+' ')&&line.trim().length<=80));
  if(start>=0){let end=lines.length;for(let i=start+1;i<lines.length;i++){const line=lines[i].trim();if(/^[A-Z][A-Z -]{2,60}$/.test(line)&&!['KEY ATTRIBUTE','SKILLS','SKILL','PROFESSION','KIN','TALENTS','TALENT'].includes(line)&&!['KEY ATTRIBUTE','SKILLS'].includes(lines[i-1]?.trim())){end=i;break}}body=lines.slice(start,end).join('\n');bodyAnchor=true}
 }
 const anchored=r.id==='site'?(p.category==='Adventure'||p.category==='Campaign Reference')&&r.anchors.some(a=>contains(identity+' '+body,a)):bodyAnchor||r.anchors.some(a=>contains(identity,a));
 const substantive=(body.match(/[\p{L}\p{N}]+/gu)??[]).length>=8;
 const groups=r.contentGroups.every(group=>group.some(term=>contains(body,term)));
 if(anchored&&substantive&&groups)return 'covered';
 return (anchored||r.anchors.some(a=>contains(body,a)))?'limited':'missing';
}
export function planCoverage(passages:RulePassage[],plan:RetrievalPlan){const facts=plan.weaponFacts?mechanicalFactCoverage(passages,plan.weaponFacts):undefined;return plan.requirements.map(r=>{const exact=passages.filter(p=>requirementEvidence(p,r)==='covered'),partial=passages.filter(p=>requirementEvidence(p,r)==='limited');const threshold=r.fact?.kind==='first_hit'?facts?.firstHit:undefined;return {id:r.id,label:r.label,role:r.role,status:threshold?(threshold.status==='verified'?'covered' as const:exact.length?'limited' as const:'missing' as const):exact.length?'covered' as const:partial.length?'limited' as const:'missing' as const,documentIds:[...new Set((exact.length?exact:partial).map(p=>p.documentId))]}})}
