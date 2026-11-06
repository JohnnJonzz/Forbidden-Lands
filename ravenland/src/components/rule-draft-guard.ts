'use client';
import {useEffect} from 'react';
export function useRuleDraftGuard(dirty:boolean){useEffect(()=>{if(!dirty)return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''},close=(event:Event)=>{if(!confirm('Discard unsaved rules compendium edits?'))event.preventDefault()};window.addEventListener('beforeunload',unload);window.addEventListener('ravenland:before-panel-close',close);return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('ravenland:before-panel-close',close)}},[dirty])}
export function allowPanelClose(){return window.dispatchEvent(new Event('ravenland:before-panel-close',{cancelable:true}))}
