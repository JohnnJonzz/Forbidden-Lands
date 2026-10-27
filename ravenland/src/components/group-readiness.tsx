'use client';
import {useRef,useState} from 'react';
import type {Session} from '@/lib/types';
import type {DiceInput} from '@/lib/dice/schema';
import {groupReadiness,groupsFor} from '@/lib/dice/groups';
import type {DiceAction} from './dice-card';
export function GroupReadiness({session,actorId,onCommand}:{session:Session;actorId:string;onCommand:DiceAction}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),retry=useRef<{key:string;id:string}|null>(null),state=groupReadiness(session),groups=groupsFor(session);
 if(!state.plan||state.plan.status==='DRAFT')return null;
 const coordinator=session.characters.find(c=>c.id===groups.coordinatorId),isCoordinator=actorId===groups.coordinatorId;
 async function run(input:DiceInput){const key=JSON.stringify(input);if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()};setBusy(true);setError('');try{await onCommand(input,retry.current.id);retry.current=null}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="group-readiness" aria-label="Quarter-day group results"><strong>{state.batch?'Quarter-day results submitted':state.label}</strong><span>Coordinator: {coordinator?.name??'Choose a party member'}{!isCoordinator?' · Waiting for coordinator':''}</span>{!state.batch&&<>{isCoordinator&&<label>Party coordinator<select aria-label="Party coordinator" disabled={busy} value={groups.coordinatorId??''} onChange={e=>run({type:'group-coordinator',actorId,coordinatorId:e.target.value})}>{session.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<button className="gold-button" disabled={busy||!state.canSubmit||!isCoordinator} onClick={()=>run({type:'submit-group',planId:state.plan!.id,actorId})}>Submit Quarter-Day Results</button><small>{state.missing.length?`${state.missing.length} mandatory request(s) still need a Ready roll or manual ruling.`:'All mandatory requests are ready or explicitly resolved.'} No time or movement is applied by submission.</small></>}{state.batch&&<details><summary>Consolidated activity summary</summary><p>{state.batch.narration.summary}</p><small>Saved for future AI narration · AI not connected</small></details>}{error&&<p role="alert">{error} Retry to check the saved batch.</p>}</section>
}
