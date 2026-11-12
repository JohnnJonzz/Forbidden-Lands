import {randomUUID} from 'node:crypto';
import type {CombatEncounter} from '../../lib/combat/types';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import {poolRoll,type Die} from './engine';
// Resolve only exact source rows. Timers, healing and permanent effects remain
// encounter notes; combat never advances campaign time to service these timers.
export function resolveEnemyCritical(e:CombatEncounter,pages:SourcePassage[],die:Die){
 for(const a of e.combatants.filter(a=>a.side==='enemy'&&a.critical?.status==='required')){
  const c=a.critical!,label=c.table==='stab'?'STAB WOUNDS':c.table==='blunt'?'BLUNT FORCE':'SLASH WOUNDS',p=pages.find(p=>p.text.includes('CRITICAL INJURIES')&&p.text.includes(label));if(!p)continue;
  let value=c.roll;if(value===null){const tens=die(6),ones=die(6);if(![tens,ones].every(n=>Number.isInteger(n)&&n>=1&&n<=6))throw Error('Invalid critical injury dice');value=tens*10+ones;c.roll=value;e.rolls.push({id:randomUUID(),round:e.round,combatantId:a.id,actionId:e.history.at(-1)?.id??e.pending?.id??e.id,type:'table',pool:{base:0,skill:0,gear:0},result:null,table:{sides:66,faces:[tens,ones],value},pushed:false,createdAt:new Date().toISOString(),source:[{documentId:p.documentId,chunkId:p.chunkId,page:p.startPage,title:p.title}]})}
  const rows=[...p.text.matchAll(/(?:^|\n)(\d{2})(?:[–−-](\d{2}))?\s+([\s\S]*?)(?=\n\d{2}(?:[–−-]\d{2})?\s|\nJohn Hadley|$)/g)],row=rows.find(m=>value!>=Number(m[1])&&value!<=Number(m[2]??m[1]));if(!row)continue;
  // Published helmet exceptions are an additional real Gear roll, never an
  // invented flat save. The helmet is destroyed only when the save succeeds.
  const helmetCase=c.table==='slash'&&value===65||c.table==='stab'&&value===64||c.table==='blunt'&&value>=64;
  if(helmetCase&&a.helmet>0){const r=poolRoll(e,a,e.history.at(-1)?.id??e.id,'armor',{base:0,skill:0,gear:a.helmet},die,'Helmet critical protection');if(r.result!.successes>0){a.helmet=0;c.status='resolved';c.note='Helmet protection succeeded: use the published 11–12 blunt-force injury. Helmet Armor Rating is now zero.';continue}}
  c.status='resolved';c.note='D66 '+value+' · '+label+' · '+row[3].replace(/\s+/g,' ').trim().slice(0,800)+' (physical PDF p. '+p.startPage+').';
 }
}
