'use client';
import {useEffect,useRef,useState} from 'react';
import {maxGMInstructionCharacters,type GMInstructionRecord} from '@/lib/ai/instructions';
import {aiTimestamp} from '@/lib/ai/time';

export function GMInstructionsEditor({campaignId}:{campaignId:string}) {
 const [token,setToken]=useState(''),[saved,setSaved]=useState<GMInstructionRecord|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const generation=useRef(0),dirty=saved!==null&&draft!==saved.text;
 useEffect(()=>()=>{generation.current++},[]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 function lock(){generation.current++;setToken('');setSaved(null);setDraft('');setError('');setNotice('');setBusy(false)}
 async function request(command?:'save'|'restore') {
  const ticket=++generation.current;setBusy(true);setError('');setNotice('');
  try {
   const response=await fetch('/api/ai/instructions'+(command?'':'?campaignId='+campaignId),{method:command?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json','x-ravenland-gm-token':token},...(command?{body:JSON.stringify({type:command,campaignId,expectedRevision:saved!.revision,...(command==='save'?{text:draft}:{confirmed:true})})}:{})});
   const value=await response.json();if(!response.ok)throw Error(value.error||'Unable to load instructions');
   if(ticket!==generation.current)return;
   setSaved(value);setDraft(value.text);setNotice(command==='save'?'Instructions saved. They apply to the next AI request.':command==='restore'?'Default instructions restored.':'Saved instructions loaded.');
  }catch(e){if(ticket===generation.current)setError((e as Error).message)}finally{if(ticket===generation.current)setBusy(false)}
 }
 return <section className="gm-instructions-editor" aria-label="AI Game Master Instructions"><h4>AI Game Master Instructions</h4><p className="muted">Campaign-specific behavior for narration, improvisation, pacing and continuity. Saves apply to new AI requests. Protected application mechanics, canon and security policies remain enforced separately.</p>
 {!saved?<><label>Instruction administrator token<input aria-label="Instruction administrator token" type="password" autoComplete="off" value={token} disabled={busy} onChange={e=>setToken(e.target.value)}/></label><button type="button" className="quiet-button" disabled={busy||!token} onClick={()=>request()}>Unlock instruction editor</button><p className="muted">Uses the existing development GM review token. Instructions are private; they are not loaded until access is authorized.</p></>:<>
 <p>{saved.isDefault?'Default instructions':'Custom instructions'} · Last Saved: {saved.lastSavedAt?aiTimestamp(saved.lastSavedAt):'Not customized'}</p>
 <label>Editable GM behavior<textarea aria-label="Editable GM behavior" rows={24} maxLength={maxGMInstructionCharacters} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);setNotice('')}}/></label>
 <p role="status">{dirty?'Unsaved changes':'No unsaved changes'} · {draft.length.toLocaleString()} / {maxGMInstructionCharacters.toLocaleString()} characters</p>
 <div className="gm-instruction-actions"><button type="button" className="gold-button" disabled={busy||!dirty||!draft.trim()} onClick={()=>request('save')}>Save Instructions</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{if(confirm('Restore the supplied default GM instructions? This replaces saved instructions and discards unsaved edits.'))request('restore')}}>Restore Defaults</button><button type="button" className="quiet-button" disabled={busy||!dirty} onClick={()=>{setDraft(saved.text);setError('');setNotice('Unsaved changes reverted.')}}>Revert Unsaved Changes</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{if(!dirty||confirm('Discard unsaved edits and reload the saved instructions?'))request()}}>Reload Saved Instructions</button><button type="button" className="quiet-button" onClick={()=>{if(!dirty||confirm('Discard unsaved instruction edits and lock the editor?'))lock()}}>Lock instruction editor</button></div>
 </>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</section>
}
