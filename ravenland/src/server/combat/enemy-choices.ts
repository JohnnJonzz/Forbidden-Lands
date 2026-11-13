import type {CombatEncounter} from '../../lib/combat/types';

// One legal-action list shared by engine execution and player-facing status.
export function enemyChoices(e:CombatEncounter){const a=e.combatants[e.turn];if(a.side!=='enemy'||a.broken||a.withdrawn)return [];const target=e.combatants.filter(t=>t.side==='player'&&!t.broken&&!t.withdrawn).sort((x,y)=>(x.current.strength??Infinity)-(y.current.strength??Infinity))[0];if(!target)return [];
 if(a.prone)return a.fast||a.slow?[{id:'stand',label:'Stand up',targetId:target.id,weaponIndex:null as number|null}]:[];
 if(!a.slow)return [{id:'end',label:'End turn; preserve unused fast action for a reaction',targetId:target.id,weaponIndex:null as number|null}];
 if(a.enemy!.kind==='monster')return [{id:'monster',label:'Roll the published monster attack table',targetId:target.id,weaponIndex:null as number|null}];
 return a.enemy!.weapons.flatMap((w,i)=>{if(w.skill==='melee'&&e.range!=='Arm')return [];if(w.skill==='marksmanship'&&e.range==='Long'&&w.range!=='Long')return [];return [{id:'weapon:'+i,label:(w.skill==='melee'?(/Edged|Blunt/.test(w.features)?'Slash':'Stab'):'Shoot')+' with '+w.name,targetId:target.id,weaponIndex:i}]});
}
