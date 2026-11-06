'use client';
import {useEffect,useRef,useState} from 'react';
import {readGMStream} from '@/lib/ai/stream';
import type {GMTurn,AIReply} from '@/lib/ai/schema';
export function useGM(onSaved:()=>Promise<void>,campaignId?:string,beforeSend:()=>Promise<void>=async()=>{}){const [thinking,setThinking]=useState(false),[stream,setStream]=useState(''),[error,setError]=useState(''),[provider,setProvider]=useState<'openai'|'mock'|'application'>('mock'),[pendingTurn,setPendingTurn]=useState<GMTurn|null>(null),failed=useRef<GMTurn|null>(null),busy=useRef(false);
 useEffect(()=>{if(!busy.current){failed.current=null;setError('');setStream('')}},[campaignId]);
 async function run(turn:GMTurn){if(busy.current)return;busy.current=true;setThinking(true);setPendingTurn(turn);setStream('');setError('');failed.current=turn;try{await beforeSend();const response=await fetch('/api/gm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(turn)});let reply:AIReply|undefined;await readGMStream(response,event=>{if(event.type==='text')setStream(event.text);if(event.type==='done'){reply=event.reply;setProvider(event.reply.provider)}});if(!reply)throw Error('The GM reply was interrupted. Retry this request.');failed.current=null;await onSaved();window.dispatchEvent(new Event('ravenland:ai-refresh'))}catch(e){setError((e as Error).message);await onSaved().catch(()=>{})}finally{setThinking(false);setStream('');busy.current=false}}
 return {thinking,stream,error,provider,pendingTurn,run,retry:()=>failed.current?run(failed.current):Promise.resolve()};
}
