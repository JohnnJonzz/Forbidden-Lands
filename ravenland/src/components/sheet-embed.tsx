'use client';
import {canPush} from '@/lib/dice/engine';
import type {PendingDice} from '@/lib/dice/schema';
import type {DiceAction} from './dice-card';
import {useEffect,useRef,useState} from 'react';
import {PortraitDialog} from './portrait-dialog';
import {imageUrl} from '@/lib/images';
import type {Character} from '@/lib/types';
import {rollSchema} from '@/lib/journey/quarter-schema';
import {metadataSchema} from '@/lib/dice/schema';
import {characterSheetSchema,sheetFor,type CharacterSheet} from '@/lib/character-sheet';
export type SheetChange=(id:string,sheet:CharacterSheet,before?:CharacterSheet)=>void|Promise<unknown>;
export function SheetEmbed({character,mode,onChange,campaignId,dice=[],onDice}:{character:Character;mode:'sheet'|'dice';onChange:SheetChange;campaignId?:string;dice?:PendingDice[];onDice?:DiceAction}){
 const frame=useRef<HTMLIFrameElement>(null),current=useRef({character,onChange,dice,onDice}),baseline=useRef(sheetFor(character)),saving=useRef(0),[error,setError]=useState(''),[editing,setEditing]=useState(false),[portraitOpen,setPortraitOpen]=useState(false),[portrait,setPortrait]=useState(character.portraitId??null);
 current.current={character,onChange,dice,onDice};
 useEffect(()=>{
  let initialized=false;
  const syncRolls=()=>frame.current?.contentWindow?.postMessage({type:'ravenland:roll-sync',characterId:current.current.character.id,cards:current.current.dice.filter(c=>c.characterId===current.current.character.id).map(card=>({card,canPush:canPush(card)}))},location.origin);
  const initialize=()=>{if(initialized)return;initialized=true;baseline.current=sheetFor(current.current.character);frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-init',characterId:current.current.character.id,sheet:baseline.current,mode,portraitUrl:campaignId&&current.current.character.portraitId?imageUrl(campaignId,current.current.character.portraitId):null},location.origin)};
  async function receive(event:MessageEvent){if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;const message=event.data;if(message?.type==='ravenland:portrait-open'&&message.characterId===current.current.character.id){setPortraitOpen(true);return}if(message?.type==='ravenland:sheet-editing'){setEditing(!!message.editing);return}if(message?.type==='ravenland:sheet-ready'){initialize();return}if(message?.type==='ravenland:sheet-loaded'){syncRolls();frame.current?.contentWindow?.postMessage({type:'ravenland:portrait-sync',portraitUrl:campaignId&&current.current.character.portraitId?imageUrl(campaignId,current.current.character.portraitId):null},location.origin);return}
   if(message?.type==='ravenland:push-roll'&&message.characterId===current.current.character.id){
    const card=current.current.dice.find(c=>c.id===message.rollId&&c.characterId===message.characterId);
    if(!card||!current.current.onDice||!/^[-a-f0-9]{36}$/.test(message.actionId??''))return;
    try{await current.current.onDice({type:'push',rollId:card.id,...(message.additionalEffectConfirmed===true?{additionalEffectConfirmed:true as const}:{})},message.actionId)}catch(e){frame.current?.contentWindow?.postMessage({type:'ravenland:roll-error',rollId:card.id,error:(e as Error).message},location.origin)}return;
   }
   if(message?.type==='ravenland:roll'&&message.characterId===current.current.character.id){const parsed=rollSchema.safeParse(message.roll),metadata=metadataSchema.safeParse(message.metadata);if(parsed.success&&metadata.success)window.dispatchEvent(new CustomEvent('ravenland-roll',{detail:{roll:parsed.data,metadata:metadata.data}}));return}
   if(!['ravenland:sheet-change','ravenland:sheet-import'].includes(message?.type)||message.characterId!==current.current.character.id)return;
   const result=characterSheetSchema.safeParse(message.sheet);if(!result.success){setError('Invalid character data. Unsupported fields or values were rejected.');return}
   const before=baseline.current;if(JSON.stringify(before)===JSON.stringify(result.data))return;baseline.current=result.data;saving.current++;
   try{await current.current.onChange(message.characterId,result.data,before);setError('')}catch(e){setError((e as Error).message)}finally{saving.current--}
   if(message.type==='ravenland:sheet-import')frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-init',characterId:message.characterId,sheet:result.data,mode},location.origin);
  }
  window.addEventListener('message',receive);const node=frame.current;node?.addEventListener('load',initialize);return()=>{window.removeEventListener('message',receive);node?.removeEventListener('load',initialize)};
 },[character.id,mode]);
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'ravenland:roll-sync',characterId:character.id,cards:dice.filter(c=>c.characterId===character.id).map(card=>({card,canPush:canPush(card)}))},location.origin)},[dice,character.id]);
 useEffect(()=>{const sheet=sheetFor(character);if(saving.current||editing||error||JSON.stringify(sheet)===JSON.stringify(baseline.current))return;baseline.current=sheet;frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-sync',characterId:character.id,sheet,mode},location.origin)},[character,mode,error,editing]);
 useEffect(()=>{setPortrait(character.portraitId??null)},[character.portraitId]);
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'ravenland:portrait-sync',portraitUrl:campaignId&&portrait?imageUrl(campaignId,portrait):null},location.origin)},[portrait,campaignId]);
 return <div>{portraitOpen&&campaignId&&<PortraitDialog character={{...character,portraitId:portrait}} campaignId={campaignId} onClose={()=>setPortraitOpen(false)} onApplied={setPortrait}/>} {campaignId&&<a className="quiet-button sheet-new-window" href={`/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(character.id)}`} target="_blank" rel="noopener" onClick={e=>{e.preventDefault();window.open(e.currentTarget.href,`ravenland-${campaignId}-${character.id}`,'popup,width=1250,height=900,noopener')}}>Open in New Window</a>}{error&&<div role="alert">{error} <button className="quiet-button" onClick={()=>{setError('');baseline.current=sheetFor(character);frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-sync',characterId:character.id,sheet:baseline.current,mode},location.origin)}}>Reload saved sheet</button><button className="quiet-button" onClick={()=>frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-export'},location.origin)}>Export unsaved sheet</button></div>}<iframe ref={frame} className={'sheet-frame '+mode} title={mode==='sheet'?`${character.name} character sheet`:`${character.name} dice pool`} src="/character-sheet.html"/></div>
}
