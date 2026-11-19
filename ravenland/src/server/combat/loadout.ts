import type {EnemyTemplate} from '../../lib/combat/types';
import {AIError} from '../ai/config';
import {catalogWeapon} from '../../lib/equipment-catalog';

// Restrict published equipment; never synthesize statistics or give an NPC an
// extra weapon from a narrative noun. Multi-group assignments need clarification.
export function applyDeclaredLoadout(enemies:EnemyTemplate[],declaration:string){
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),subject=new RegExp('(?:\\b(?:'+enemies.flatMap(e=>[escape(e.name),escape(e.name.split(/\s+/).at(-1)!)]).concat(['enemy','opponent']).join('|')+')(?:\\s+\\d+)?(?:\\s+(?:is|was|who is))?\\s*)$','i');
 const belongsToEnemy=(m:RegExpMatchArray)=>subject.test(declaration.slice(0,m.index));
 const match=[...declaration.matchAll(/\b(?:armed with|equipped with|wielding)\s+([^.!?\n]{1,100}?)(?=\s+(?:emerges|steps|and threatens|who|when)\b|[.!?\n]|$)/gi)].find(belongsToEnemy)??declaration.match(/\b(sword|sling|bow|crossbow|dagger)-armed\b/i);
 const denied=[...declaration.matchAll(/\b(?:has|carries|uses)\s+no\s+([^.!?\n]{1,140})/gi)].filter(belongsToEnemy).flatMap(m=>m[1].split(/\s*(?:,|\band\b|\bor\b)\s*/)).map(s=>s.replace(/^(?:any |a |an |the )/i,'').trim()).filter(Boolean);
 if(!match&&!denied.length)return;
 if(enemies.length!==1)throw new AIError('combat_loadout','Which enemy uses that equipment? Individual loadouts for multiple enemies need adjudication before starting.',409);
 const terms=match?.[1].replace(/\s+at\s+(?:Arm(?:['’]s length)?|Near|Short|Long)(?:\s+range)?\b.*$/i,'').toLowerCase().replace(/\b(?:a|an|the|only|one)\b/g,'').trim().split(/\s*(?:,|\band\b)\s*/).filter(Boolean)??[];
 const matches=(w:EnemyTemplate['weapons'][number],term:string)=>w.name.toLowerCase()===term||!!catalogWeapon(term)&&catalogWeapon(term)?.id===catalogWeapon(w.name)?.id||term==='sword'&&/sword$/i.test(w.name)||term==='bow'&&/bow$/i.test(w.name)&&!/crossbow/i.test(w.name)||term==='crossbow'&&/crossbow/i.test(w.name);
 for(const enemy of enemies){const selected=new Set<number>();for(const term of terms){const found=enemy.weapons.map((w,i)=>({w,i})).filter(({w})=>matches(w,term));if(found.length!==1)throw new AIError('combat_loadout',`The verified ${enemy.name} loadout cannot represent “${term}”. Describe a new encounter with verified equipment or request adjudication; no substitute has been equipped.`,409);selected.add(found[0].i)}
  let weapons=enemy.weapons.filter((_,i)=>!match||selected.has(i));
  for(const denial of denied){const other=/^other\s+/i.test(denial),term=denial.replace(/^other\s+/i,'').toLowerCase(),category=/^(?:ranged|melee) weapons?$/.test(term)?term.startsWith('ranged')?'marksmanship':'melee':null;
   if(!category&&!['sword','bow','crossbow'].includes(term)&&!catalogWeapon(term))throw new AIError('combat_loadout','The equipment exclusion is not recognized. Name a verified weapon or ranged/melee weapons; no substitute has been equipped.',409);
   const excluded=weapons.filter(w=>(category?w.skill===category:matches(w,term))&&!(other&&match));
   if(match&&excluded.length)throw new AIError('combat_loadout','The requested equipment is both included and excluded. Clarify the enemy loadout before starting.',409);
   weapons=weapons.filter(w=>!excluded.includes(w));
  }
  enemy.weapons=weapons;enemy.notes.push('Encounter loadout explicitly restricted to '+(weapons.map(w=>w.name).join(', ')||'no listed weapons')+'.');
 }
}
