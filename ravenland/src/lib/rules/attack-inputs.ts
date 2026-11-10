// Player statements only. Rule thresholds and weapon ratings come from evidence.
export interface AttackInputs {attackSuccesses:number|null;damageSuccesses:number|null;inputIssues:string[]}
const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
export const successCountPattern='(?:\\d{1,3}|'+words.join('|')+')';
export const successNumber=(s:string)=>/^\d+$/.test(s)?Number(s):words.indexOf(s.toLowerCase());
export function attackInputs(action:string):AttackInputs {
 const totals:number[]=[],allocated:number[]=[],inputIssues:string[]=[];let ambiguousTotal=false;
 const precedingNumber=new RegExp('\\b(?:\\d+|'+words.join('|')+')\\s*$','i');
 const pattern=new RegExp('\\b('+successCountPattern+')\\s+(?:(extra|additional|attack|rolled|required)\\s+)?(success(?:es)?|sixes)\\b','gi');
 for(const m of action.matchAll(pattern)){
  const before=action.slice(Math.max(0,m.index!-100),m.index),after=action.slice(m.index!+m[0].length,m.index!+m[0].length+100),qualifier=m[2]?.toLowerCase();
  const clause=before.split(/[.!?;,]/).at(-1)??'',spending=/\b(?:spend|spent|allocat\w*|use|used)\s+(?:(?:only|just)\s+)?$/i.test(clause),damage=/^\s*(?:on\s+|to\s+|for\s+)?(?:increas\w*\s+)?damage\b/i.test(after);
  const allocation=spending&&(qualifier==='extra'||qualifier==='additional'||damage)||!!qualifier&&['extra','additional'].includes(qualifier)&&damage;
  if(/(?:\d\.|-|\bminus)\s*$/i.test(before)||/\b(?:or|to)\s*$/i.test(clause)||precedingNumber.test(before)){inputIssues.push('Clarify the exact '+(allocation?'damage allocation':'attack-success count')+'.');if(!allocation)ambiguousTotal=true;continue}
  if(allocation){allocated.push(successNumber(m[1]));continue}
  if(qualifier==='extra'||qualifier==='additional'||qualifier==='required'||/\b(?:requires?|needs?|at least|minimum|threshold)\s*$/i.test(clause)||/^\s*(?:(?:is|are)\s+)?(?:required|needed|necessary|to hit)\b/i.test(after))continue;
  totals.push(successNumber(m[1]));
 }
 const unique=[...new Set(totals)],allocations=[...new Set(allocated)];
 if(unique.length>1)inputIssues.push('Multiple attack-success counts were supplied; clarify which roll to use.');
 if(allocations.length>1)inputIssues.push('Multiple damage allocations were supplied; clarify how many additional successes are spent on damage.');
 if(/\b(?:some|several|a few)\s+(?:extra|additional)\s+success(?:es)?[^.!?]{0,50}\bdamage\b/i.test(action))inputIssues.push('Clarify how many additional successes are spent on damage.');
 return {attackSuccesses:unique.length===1&&!ambiguousTotal?unique[0]:null,damageSuccesses:allocations.length===1?allocations[0]:null,inputIssues:[...new Set(inputIssues)]};
}
