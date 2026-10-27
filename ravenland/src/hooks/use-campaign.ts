'use client';
import {useEffect,useRef,useState} from 'react';
import type {CampaignRecord,CampaignSummary} from '@/lib/types';
import type {JourneyInput} from '@/lib/journey/schema';
import {sheetFor,type CharacterSheet} from '@/lib/character-sheet';
import type {DiceInput} from '@/lib/dice/schema';
import type {Action} from '@/lib/session';
import {sessionReducer} from '@/lib/session';
async function request(method:string,body?:unknown,path='/api/campaigns'){const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Storage request failed');return data as {record:CampaignRecord;campaigns:CampaignSummary[]}}
export function useCampaign(campaignId?:string){
 const [record,setRecord]=useState<CampaignRecord|null>(null),[campaigns,setCampaigns]=useState<CampaignSummary[]>([]),[error,setError]=useState(''),[status,setStatus]=useState('Loading campaign…'),[generation,setGeneration]=useState(0);
 const saved=useRef<CampaignRecord|null>(null),ref=useRef<CampaignRecord|null>(null),tail=useRef<Promise<void>>(Promise.resolve()),failed=useRef(false),pending=useRef(0);
 function accept(data:{record:CampaignRecord;campaigns:CampaignSummary[]},remount=true){if(remount)setGeneration(value=>value+1);saved.current=data.record;ref.current=data.record;setRecord(data.record);setCampaigns(data.campaigns);failed.current=false;setError('');setStatus('Saved to SQLite')}
 useEffect(()=>{let alive=true;request('GET',undefined,campaignId?'/api/campaigns?id='+encodeURIComponent(campaignId):'/api/campaigns').then(data=>{if(alive)accept(data)}).catch(e=>{if(alive){setError(e.message);setStatus('Could not load campaign')}});return()=>{alive=false}},[campaignId]);
 useEffect(()=>{
  let alive=true,inFlight=false;const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('ravenland-campaigns');
  async function refresh(){const current=ref.current;if(!current||pending.current||failed.current||inFlight)return;inFlight=true;try{const data=await request('GET',undefined,'/api/campaigns?id='+encodeURIComponent(current.id));if(alive&&!pending.current&&!failed.current&&ref.current?.id===current.id&&ref.current.revision===current.revision&&data.record.revision>current.revision)accept(data,false);if(alive)setStatus(value=>value.startsWith('Connection interrupted')?'Saved to SQLite':value)}catch{if(alive)setStatus('Connection interrupted · reconnecting…')}finally{inFlight=false}}
  const timer=setInterval(refresh,1200);channel?.addEventListener('message',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{alive=false;clearInterval(timer);channel?.close();window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh)};
 },[]);
 function announce(){if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('ravenland-campaigns');channel.postMessage({campaignId:ref.current?.id});channel.close()}}
 async function commandMutation(method:string,body:unknown,path:string){pending.current++;setStatus('Saving…');const task=tail.current.then(async()=>{if(failed.current)throw new Error('Resolve unsaved campaign changes before continuing.');const data=await request(method,body,path);accept(data,false);announce()});tail.current=task.catch(()=>{}).finally(()=>{pending.current--});return task}
 async function saveSheet(characterId:string,sheet:CharacterSheet,before?:CharacterSheet){const current=ref.current;if(!current)return;const character=current.session.characters.find(c=>c.id===characterId);if(!character)throw new Error('Character not found');return commandMutation('PATCH',{campaignId:current.id,characterId,before:before??sheetFor(character),sheet},'/api/characters')}
 async function diceCommand(input:DiceInput,actionId:string){const current=ref.current;if(!current)return;return commandMutation('POST',{...input,campaignId:current.id,actionId},'/api/dice')}
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(pending.current||failed.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 async function update(action:Action){if(!ref.current)return;const next={...ref.current,session:sessionReducer(ref.current.session,action)};ref.current=next;setRecord(next);setStatus('Saving…');pending.current++;
  const task=tail.current.then(async()=>{if(failed.current)throw new Error('Unsaved changes remain. Retry saving or export a backup before switching campaigns.');const authoritative=saved.current!;const data=await request('PUT',{id:next.id,revision:authoritative.revision,session:sessionReducer(authoritative.session,action)});saved.current=data.record;if(pending.current<=1){ref.current=data.record;setRecord(data.record)}else{ref.current={...ref.current!,revision:data.record.revision};setRecord(current=>current?{...current,revision:data.record.revision}:current)};setCampaigns(data.campaigns)});
  tail.current=task.catch(e=>{failed.current=true;setError(e.message);setStatus('Not saved')}).finally(()=>{pending.current--;if(!pending.current&&!failed.current)setStatus('Saved to SQLite')});await tail.current;return !failed.current;
 }
 async function operate(method:string,body:unknown,path='/api/campaigns'){await tail.current;if(failed.current)throw new Error('Export your unsaved changes or retry saving before changing campaigns.');setStatus('Loading…');try{accept(await request(method,body,path))}catch(e){setStatus('Operation failed');throw e}}
 async function retry(){
  if(!ref.current){try{accept(await request('GET',undefined,campaignId?'/api/campaigns?id='+encodeURIComponent(campaignId):'/api/campaigns'))}catch(e){setError((e as Error).message)}return}
  pending.current++;setStatus('Saving…');
  const task=tail.current.then(async()=>{const current=ref.current!;const data=await request('PUT',{id:current.id,revision:current.revision,session:current.session});saved.current=data.record;ref.current={...ref.current!,revision:data.record.revision};setRecord(record=>record?{...record,revision:data.record.revision}:record);setCampaigns(data.campaigns);failed.current=false;setError('')});
  tail.current=task.catch(e=>{failed.current=true;setError(e.message);setStatus('Not saved')}).finally(()=>{pending.current--;if(!pending.current&&!failed.current)setStatus('Saved to SQLite')});await tail.current;
 }
 async function reload(){await tail.current;const current=ref.current;if(!current)return;const response=await fetch('/api/campaigns?id='+current.id,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);accept(data)}
 async function journeyCommand(input:JourneyInput,actionId:string){await tail.current;if(!ref.current)return;const current=ref.current;await operate('POST',{...input,campaignId:current.id,revision:current.revision,actionId},'/api/journey')}
 function backup(){if(!ref.current)return;const url=URL.createObjectURL(new Blob([JSON.stringify({format:'ravenland-campaign',version:1,session:ref.current.session},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='ravenland-campaign.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return {record,campaigns,error,status,generation,saveSheet,diceCommand,journeyCommand,update,operate,retry,reload,backup};
}
