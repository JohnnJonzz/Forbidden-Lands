import type {SqliteCampaignRepository} from '../sqlite';
import type {CombatEncounter,CombatHistoryRound} from '../../lib/combat/types';

// Project canonical encounter records and command receipts; never maintain a
// second history. Missing legacy round data stays unknown, not inferred.
export function combatHistory(e:CombatEncounter,repo?:SqliteCampaignRepository):CombatHistoryRound[]{
 const rounds=new Map<number|null,{round:number|null;entries:{id:string;kind:string;text:string;at:string}[]}>();
 const name=(id:string)=>e.combatants.find(a=>a.id===id)?.name??'Former participant';
 const add=(round:number|undefined,id:string,kind:string,text:string,at:string)=>{
  const key=round??null;if(!rounds.has(key))rounds.set(key,{round:key,entries:[]});
  rounds.get(key)!.entries.push({id,kind,text,at});
 };
 const completedAt=(id:string,fallback:string)=>e.rolls.filter(r=>r.actionId===id).at(-1)?.createdAt??fallback;
 for(const r of e.rolls){
  add(r.round,r.id,r.type,`${name(r.combatantId)} · ${r.type}: ${r.result?`${r.result.successes} successes${r.pushed?' (pushed)':''}`:`${r.type==='initiative'?'Initiative card':'Table result'} ${r.table?.value}`}`,r.createdAt);
  if(r.result?.pushed){const v=r.result;add(r.round,r.id+':push','push',`Recorded push: Attribute damage ${v.attributeDamage} · Gear damage ${v.gearDamage} · Willpower ${v.willpower}. Already handled by the dice system.`,r.createdAt)}
 }
 for(const a of e.history)for(const r of a.results)add(a.round,a.id+':'+r.targetId,'resolved',`${name(a.actorId)} → ${name(r.targetId)} · ${a.kind}: ${r.remaining===0?'miss / defended, 0 damage':`${r.remaining} uncanceled successes · ${r.beforeArmor} damage before armor · ${r.afterArmor} after armor`}${r.effects.length?' · '+r.effects.join(', '):''}`,completedAt(a.id,a.openedAt));
 if(e.pending)add(e.pending.round,e.pending.id,'pending',`${name(e.pending.actorId)} → ${e.pending.targets.map(name).join(', ')} · ${e.pending.kind} · ${e.pending.phase}${e.pending.notes.length?' · '+e.pending.notes.join(' '):''}`,completedAt(e.pending.id,e.pending.openedAt));
 for(const a of e.combatants.filter(a=>a.broken)){
  const cause=[...e.history].reverse().find(h=>h.results.some(r=>r.targetId===a.id&&r.afterArmor!==null&&r.afterArmor>0));
  add(cause?.round,a.id+':broken','status',`${a.name} is Broken${a.critical?.status==='required'?'; critical injury unresolved':a.critical?.status==='resolved'?'; critical injury recorded':''}. Broken does not by itself establish death.`,cause?completedAt(cause.id,cause.openedAt):e.startedAt);
 }
 if(repo)for(const row of repo.db.prepare('SELECT request_id,result_json,created_at FROM combat_commands WHERE campaign_id=? AND encounter_id=? ORDER BY created_at,request_id').all(e.campaignId,e.id)){
  const result=JSON.parse(row.result_json as string);if(result.packet||!result.checkpoint)continue;
  const before=result.checkpoint,after=result.encounter,at=row.created_at as string;
  if(before.activeId&&after&&(before.activeId!==after.activeId||before.round!==after.round))add(before.round??undefined,String(row.request_id),'turn',`${name(before.activeId)} finishes the turn; ${name(after.activeId)} acts next${before.round!==after.round?' in round '+after.round:''}.`,at);
  if(['stand','draw','stand and draw'].includes(result.command))add(before.round??undefined,String(row.request_id)+':fast','action',`${name(before.activeId)} ${result.command==='stand'?'stands up':result.command==='draw'?'draws a recorded weapon':'stands up and draws a recorded weapon'} (${result.command==='stand and draw'?'two fast actions':'fast action'}).`,at);
  if(result.drawnWeapon)add(before.round??undefined,String(row.request_id)+':draw','action',`${name(before.activeId)} draws ${result.drawnWeapon} (fast action), before attacking.`,at);
 }
 if(e.status==='ended')add(e.round,e.id+':ended','conclusion','Encounter concluded. Surviving and Broken opponents remain distinct from confirmed deaths.',e.endedAt??e.startedAt);
 return [...rounds.values()].sort((a,b)=>(a.round??0)-(b.round??0)).map(r=>({round:r.round,entries:r.entries.sort((a,b)=>a.at.localeCompare(b.at)).map(({at:_,...entry})=>entry)}));
}
