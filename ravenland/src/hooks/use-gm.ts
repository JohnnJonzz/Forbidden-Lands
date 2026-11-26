'use client';
import {useEffect,useRef,useState} from 'react';
import type {PreparedAction} from '@/lib/rules/action-preparation';
import {readGMStream} from '@/lib/ai/stream';
import type {GMTurn,AIReply} from '@/lib/ai/schema';
export function useGM(onSaved:()=>Promise<void>,campaignId?:string,beforeSend:()=>Promise<void>=async()=>{}){const [preparation,setPreparation]=useState<PreparedAction|null>(null);const [thinking,setThinking]=useState(false),[stream,setStream]=useState(''),[error,setError]=useState(''),[provider,setProvider]=useState<'openai'|'mock'|'application'>('mock'),[pendingTurn,setPendingTurn]=useState<GMTurn|null>(null),failed=useRef<GMTurn|null>(null),busy=useRef(false);
 useEffect(()=>{if(!busy.current){failed.current=null;setError('');setStream('');setPreparation(null)}},[campaignId]);
 useEffect(()=>{const clear=()=>setPreparation(null);window.addEventListener('ravenland:player-access',clear);return()=>window.removeEventListener('ravenland:player-access',clear)},[]);
 async function runChecked(turn:GMTurn){if(busy.current)return false;busy.current=true;setThinking(true);setPendingTurn(turn);setPreparation(null);setStream('');setError('');failed.current=turn;try{await beforeSend();const response=await fetch('/api/gm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(turn)});let reply:AIReply|undefined;await readGMStream(response,event=>{if(event.type==='text')setStream(event.text);if(event.type==='done'){reply=event.reply;setProvider(event.reply.provider);if(event.reply.preparation)setPreparation(event.reply.preparation)}});if(!reply)throw Error('The GM reply was interrupted. Retry this request.');failed.current=null;if(!reply.preparation)await onSaved();}catch(e){const message=(e as Error).message;setError(message.includes(turn.requestId)?message:message+' Request ID: '+turn.requestId);await onSaved().catch(()=>{});return false}finally{window.dispatchEvent(new Event('ravenland:ai-refresh'));setThinking(false);setStream('');busy.current=false}return true}
 const run=async(turn:GMTurn)=>{await runChecked(turn)};
 return {runChecked,thinking,stream,error,provider,pendingTurn,preparation,clearPreparation:()=>setPreparation(null),run,retry:()=>failed.current?run(failed.current):Promise.resolve()};
}
