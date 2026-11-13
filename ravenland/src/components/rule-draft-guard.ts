'use client';
import {useEffect} from 'react';
interface CloseDetail {labels:Set<string>;scope?:string}
export function usePanelDraftGuard(dirty:boolean,label:string,scope='panel'){useEffect(()=>{if(!dirty)return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''},close=(event:Event)=>{const detail=(event as CustomEvent<CloseDetail>).detail;if(detail&&(!detail.scope||detail.scope===scope))detail.labels.add(label)};window.addEventListener('beforeunload',unload);window.addEventListener('ravenland:before-panel-close',close);return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('ravenland:before-panel-close',close)}},[dirty,label,scope])}
export function useRuleDraftGuard(dirty:boolean){usePanelDraftGuard(dirty,'rules compendium','sourcebook-library')}
export function allowPanelClose(scope?:string){const labels=new Set<string>();if(!window.dispatchEvent(new CustomEvent<CloseDetail>('ravenland:before-panel-close',{cancelable:true,detail:{labels,scope}})))return false;return !labels.size||confirm('Discard unsaved '+[...labels].join(' and ')+' edits?')}
