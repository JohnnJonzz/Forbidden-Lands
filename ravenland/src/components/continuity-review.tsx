'use client';
import { useEffect, useRef, useState } from 'react';
import type { CampaignRecord } from '@/lib/types';
import type { ContinuityCommand } from '@/lib/continuity';
import { occupiedCamp } from '@/lib/campsites';
import { useActivityCommand } from './activity-panel';
const evidenceLabel = (value: string) => value === 'verified_saved_result' ? 'Verified saved Survival result' : value === 'manual_incomplete' ? 'Manual or incomplete result — Table GM review required' : 'Conflicting evidence';
export function useContinuityReview(record: CampaignRecord, actorId: string) {
    const [review, setReview] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), retry = useRef<{
        key: string;
        id: string;
    } | null>(null);
    useEffect(() => {
        let alive = true;
        fetch('/api/continuity?' + new URLSearchParams({ campaignId: record.id, characterId: actorId }), { cache: 'no-store' }).then(r => r.json()).then(v => {
            if (alive)
                setReview(v);
        }).catch(() => { });
        return () => { alive = false; };
    }, [record.id, record.revision, actorId]);
    async function run(patch: Partial<ContinuityCommand>) {
        const key = JSON.stringify(patch);
        if (retry.current?.key !== key)
            retry.current = { key, id: crypto.randomUUID() };
        setBusy(true);
        setError('');
        try {
            const r = await fetch('/api/continuity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: record.id, revision: record.revision, requestId: retry.current.id, actorId, confirmed: true, ...patch }) }), v = await r.json();
            if (!r.ok)
                throw Error(v.error);
            retry.current = null;
            window.dispatchEvent(new Event('ravenland:campaign-refresh'));
            window.dispatchEvent(new Event('ravenland:ai-refresh'));
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return { review, busy, error, run };
}
export function CampReview({ record, actorId }: {
    record: CampaignRecord;
    actorId: string;
}) { const { review, busy, error, run } = useContinuityReview(record, actorId), [selected, setSelected] = useState(''), [ruling, setRuling] = useState(false), [reason, setReason] = useState(''), camp = occupiedCamp(record.session), choices = review?.reviews?.filter((x: any) => x.activity === 'Make Camp') ?? [], source = choices.find((x: any) => x.assignmentId === selected); return <details className="camp-continuity"><summary>Review previous quarter’s Make Camp result</summary>{camp && <p>{camp.availability === 'active' ? 'Using established campsite' : 'Shared campsite requires review'} in {camp.hex}. Cold and genuine camp effects still apply.</p>}<p>This reviews existing evidence. It does not reroll, reopen the previous quarter, advance time or apply Sleep recovery.</p>{!review?.isTableGM ? <p>The assigned Table GM can confirm a historical campsite.</p> : <><label>Original camp event<select value={selected} onChange={e => { setSelected(e.target.value); setRuling(false); }}><option value="">Choose completed Make Camp</option>{choices.map((x: any) => <option key={x.assignmentId} value={x.assignmentId}>{x.date} · {x.quarter} · {x.characterName ?? x.characterId} · {x.hex}</option>)}</select></label>{source && <><p>{evidenceLabel(source.classification)} · {source.rollId ? 'Saved Survival ' + source.rollId : 'No saved Survival roll'}</p>{[...(source.errors ?? []), ...(source.uncertainties ?? [])].map((x: string) => <p key={x}>{x}</p>)}{source.classification === 'manual_incomplete' && <label><input type="checkbox" checked={ruling} onChange={e => setRuling(e.target.checked)}/> Explicit historical Table GM campsite ruling; no missing die is fabricated.</label>}<label>Review reason<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Confirm the actual site and evidence, or explain the historical uncertainty"/></label><button type="button" className="quiet-button" disabled={busy || !reason.trim() || source.errors?.length > 0 || source.classification === 'manual_incomplete' && (!ruling || reason.length < 20)} onClick={() => run({ operation: 'reconcile-camp', entryId: source.entryId, assignmentId: source.assignmentId, historicalRuling: ruling, reason })}>Use reviewed campsite for current Sleep</button></>}{camp && <details><summary>Break camp or mark shelter unavailable</summary><label>Verified event reason<textarea value={reason} onChange={e => setReason(e.target.value)}/></label><button type="button" disabled={busy || !reason.trim()} onClick={() => run({ operation: 'invalidate-camp', campId: camp.id, invalidation: 'break-camp', reason })}>Break camp</button><button type="button" disabled={busy || !reason.trim()} onClick={() => run({ operation: 'invalidate-camp', campId: camp.id, invalidation: 'destroyed', reason })}>Mark camp destroyed</button></details>}</>}{error && <p role="alert">{error}</p>}</details>; }
export function ConsumptionReview({ record, actorId, consumerId, resource }: {
    record: CampaignRecord;
    actorId: string;
    consumerId: string;
    resource: 'food' | 'water';
}) {
    const { review, busy, error, run } = useContinuityReview(record, actorId), ordinary = useActivityCommand(record, actorId), [method, setMethod] = useState<ContinuityCommand['method']>('available'), [sourceId, setSource] = useState(''), [itemId, setItem] = useState(''), [reason, setReason] = useState(''), [ruling, setRuling] = useState(false), [approve, setApprove] = useState(false), [earlier, setEarlier] = useState(true), [quarter, setQuarter] = useState(record.session.campaign.quarter), [consumers, setConsumers] = useState([consumerId]);
    const sources = review?.reviews?.filter((x: any) => x.activity === 'Forage') ?? [], source = sources.find((x: any) => x.assignmentId === sourceId), items = record.session.activityState?.provisions.filter(p => resource === 'food' ? ['Vegetables', 'Meat', 'Fish', 'Food'].includes(p.kind) : p.kind === 'Water') ?? [], chosen = items.find(p => p.itemId === itemId);
    return <details className="consumption-review"><summary>Resolve consumption</summary><p>Choose an available portion or roll the consumer’s current resource die. Historical confirmation requires the assigned Table GM.</p><button type="button" className="quiet-button" disabled={ordinary.busy || !['D6', 'D8', 'D10', 'D12'].includes(String(record.session.characters.find(ch => ch.id === consumerId)?.sheet?.[resource==='food'?'res-food':'res-water']))} onClick={() => ordinary.run({ operation: 'resource', sourceId: consumerId, recipientId: consumerId, target: resource })}>Request {resource} resource roll</button><label>Recorded provisions<select value={itemId} onChange={e => setItem(e.target.value)}><option value="">Choose actual stock</option>{items.map(p => <option key={p.itemId} value={p.itemId}>{p.kind} · {record.session.characters.find(ch => ch.id === p.ownerId)?.name} · {record.session.characters.find(ch => ch.id === p.ownerId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0}</option>)}</select></label>{chosen && <button type="button" className="quiet-button" disabled={ordinary.busy} onClick={() => ordinary.run({ operation: 'consume', sourceId: chosen.ownerId, recipientId: consumerId, itemId: chosen.itemId, target: resource })}>Consume one available portion now</button>}{review?.isTableGM && <details><summary>Confirm food or water already consumed</summary><label>Confirmation method<select value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="available">Deduct still-recorded portions</option><option value="restore-missing-yield">Reconcile verified missing Foraging yield and meals</option><option value="already-deducted">Confirm prior deductions without deducting again</option><option value="ruling">Table GM consumption ruling — no inventory or dice created</option></select></label><label>Original Foraging event<select value={sourceId} onChange={e => {
                const x = sources.find((x: any) => x.assignmentId === e.target.value);
                setSource(e.target.value);
                if (x)
                    setQuarter(x.quarter);
            }}><option value="">Testimony or selected recorded stock</option>{sources.map((x: any) => <option key={x.assignmentId} value={x.assignmentId}>{x.characterName} · {x.date} {x.quarter} · {evidenceLabel(x.classification)}</option>)}</select></label>{source && <><p>Verified yield: {source.yield ?? 'Not proven'} · saved roll: {source.rollId ?? 'None'} · recorded remaining portions: {source.inventory?.reduce((n: number, p: any) => n + p.quantity, 0) ?? 0}</p>{[...(source.errors ?? []), ...(source.uncertainties ?? [])].map((x: string) => <p key={x}>{x}</p>)}</>}<p>Requirement date: {record.session.campaign.date}</p><label><input type="checkbox" checked={earlier} onChange={e => setEarlier(e.target.checked)}/> This consumption occurred earlier in the current in-world day.</label><label>Meal quarter<select value={quarter} onChange={e => setQuarter(e.target.value as typeof quarter)}>{['Morning', 'Day', 'Evening', 'Night'].map(q => <option key={q}>{q}</option>)}</select></label><fieldset><legend>One portion for each consumer</legend>{record.session.characters.map(ch => { const done = record.session.activityState?.needs.some(n => n.date === record.session.campaign.date && n.characterId === ch.id && n.resource === resource && n.status === 'Satisfied'); return <label key={ch.id}><input type="checkbox" disabled={done} checked={consumers.includes(ch.id)} onChange={e => setConsumers(e.target.checked ? [...consumers, ch.id] : consumers.filter(id => id !== ch.id))}/>{ch.name}{done ? ' — already satisfied' : ''}</label>; })}</fieldset><label>Source and historical correction reason<textarea value={reason} onChange={e => setReason(e.target.value)}/></label>{(method === 'ruling' || method === 'already-deducted' || source?.classification === 'manual_incomplete') && <label><input type="checkbox" checked={ruling} onChange={e => setRuling(e.target.checked)}/> Explicit Table GM historical ruling; missing rolls or earlier receipts are not invented.</label>}{method === 'restore-missing-yield' && <label><input type="checkbox" checked={approve} onChange={e => setApprove(e.target.checked)}/> Approve +{source?.yield ?? '?'} missing Vegetables and −{consumers.length} consumed portions in the same transaction.</label>}<button type="button" className="quiet-button" disabled={busy || reason.length < 20 || !consumers.length || method === 'restore-missing-yield' && !approve || (method === 'ruling' || method === 'already-deducted') && !ruling} onClick={() => run({ operation: 'confirm-consumption', method, ...(source ? { entryId: source.entryId, assignmentId: source.assignmentId } : {}), ...(itemId ? { itemId, sourceOwnerId: chosen?.ownerId } : {}), date: record.session.campaign.date, quarter, earlier, historicalRuling: ruling, adjustmentApproved: approve, consumers: consumers.map(characterId => ({ characterId, resource, amount: 1 })), reason })}>Confirm reviewed consumption</button></details>}{error && <p role="alert">{error}</p>}{ordinary.error && <p role="alert">{ordinary.error}</p>}</details>;
}
