'use client';
import {useEffect,useRef,useState} from 'react';
import type {Character} from '@/lib/types';
import {rollSchema} from '@/lib/journey/quarter-schema';
import {characterSheetSchema,sheetFor,type CharacterSheet} from '@/lib/character-sheet';
export function SheetEmbed({character,mode,onChange}:{character:Character;mode:'sheet'|'dice';onChange:(id:string,sheet:CharacterSheet)=>void}){
 const frame=useRef<HTMLIFrameElement>(null),current=useRef({character,onChange}),[error,setError]=useState('');
 current.current={character,onChange};
 useEffect(()=>{
  let initialized=false;
  const initialize=()=>{if(initialized)return;initialized=true;frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-init',characterId:current.current.character.id,sheet:sheetFor(current.current.character),mode},location.origin)};
  function receive(event:MessageEvent){if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;const message=event.data;if(message?.type==='ravenland:sheet-ready'){initialize();return}if(message?.type==='ravenland:roll'&&message.characterId===current.current.character.id){const parsed=rollSchema.safeParse(message.roll);if(parsed.success)window.dispatchEvent(new CustomEvent('ravenland-roll',{detail:parsed.data}));return}if(!['ravenland:sheet-change','ravenland:sheet-import'].includes(message?.type)||message.characterId!==current.current.character.id)return;
   const result=characterSheetSchema.safeParse(message.sheet);if(!result.success){setError('Invalid character data. Unsupported fields or values were rejected.');return}setError('');current.current.onChange(message.characterId,result.data);
   if(message.type==='ravenland:sheet-import'){frame.current?.contentWindow?.postMessage({type:'ravenland:sheet-init',characterId:message.characterId,sheet:result.data,mode},location.origin)}
  }
  window.addEventListener('message',receive);const node=frame.current;node?.addEventListener('load',initialize);return()=>{window.removeEventListener('message',receive);node?.removeEventListener('load',initialize)};
 },[character.id,mode]);
 return <div>{error&&<p role="alert">{error}</p>}<iframe ref={frame} className={'sheet-frame '+mode} title={mode==='sheet'?`${character.name} character sheet`:`${character.name} dice pool`} src="/character-sheet.html"/></div>
}
