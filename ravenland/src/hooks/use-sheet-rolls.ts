'use client';
import {useEffect,useRef,useState} from 'react';
import type {DiceAction} from '@/components/dice-card';
import {diceCommandSchema,type DiceInput} from '@/lib/dice/schema';
export function useSheetRolls(onCommand:DiceAction,campaignId:string|null){
 const current=useRef({onCommand,campaignId});current.current={onCommand,campaignId};
 const [failed,setFailed]=useState<{input:DiceInput;id:string;campaignId:string;error:string}[]>([]);
 async function save(input:DiceInput,id:string,scope:string){try{if(current.current.campaignId!==scope)throw new Error('Load campaign '+scope+' before retrying this roll.');await current.current.onCommand(input,id);setFailed(list=>list.filter(f=>f.id!==id))}catch(e){setFailed(list=>[...list.filter(f=>f.id!==id),{input,id,campaignId:scope,error:(e as Error).message}])}}
 const saveRef=useRef(save);saveRef.current=save;
 useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent).detail,scope=current.current.campaignId;if(!scope)return;const parsed=diceCommandSchema.safeParse({type:'create',...detail,campaignId:scope,actionId:detail?.roll?.id});if(parsed.success){const {campaignId,actionId,...input}=parsed.data;void saveRef.current(input,actionId,campaignId)}};window.addEventListener('ravenland-roll',receive);return()=>window.removeEventListener('ravenland-roll',receive)},[]);
 return {failed,retry:()=>{for(const f of failed)void save(f.input,f.id,f.campaignId)}};
}
