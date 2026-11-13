import type {EnemyTemplate} from '../../lib/combat/types';
import {AIError} from '../ai/config';

// Restrict published equipment; never synthesize statistics or give an NPC an
// extra weapon from a narrative noun. Multi-group assignments need clarification.
export function applyDeclaredLoadout(enemies:EnemyTemplate[],declaration:string){
 const match=declaration.match(/\b(?:armed with|wielding)\s+([^.!?\n]{1,100}?)(?=\s+(?:emerges|steps|and threatens|who|when)\b|[.!?\n]|$)/i);if(!match)return;
 if(enemies.length!==1)throw new AIError('combat_loadout','Which enemy uses that equipment? Individual loadouts for multiple enemies need adjudication before starting.',409);
 const terms=match[1].toLowerCase().replace(/\b(?:a|an|the|only|one)\b/g,'').trim().split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
 for(const enemy of enemies){const selected=new Set<number>();for(const term of terms){const found=enemy.weapons.map((w,i)=>({w,i})).filter(({w})=>w.name.toLowerCase()===term||term==='sword'&&/sword$/i.test(w.name));if(found.length!==1)throw new AIError('combat_loadout',`The verified ${enemy.name} loadout cannot represent “${term}”. Revise the setup or request equipment adjudication before starting; no substitute has been equipped.`,409);selected.add(found[0].i)}enemy.weapons=enemy.weapons.filter((_,i)=>selected.has(i));enemy.notes.push('Encounter loadout explicitly restricted to '+enemy.weapons.map(w=>w.name).join(', ')+'.');}
}
