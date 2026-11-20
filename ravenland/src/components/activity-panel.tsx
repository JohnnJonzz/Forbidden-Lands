'use client';
import { useEffect, useRef, useState } from 'react';
import type { CampaignRecord } from '@/lib/types';
import type { ActivityCommand } from '@/server/activities/service';
import { needsSummary } from '@/lib/activities';
export function useActivityCommand(record: CampaignRecord, actorId: string) {
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), retry = useRef<{
        key: string;
        id: string;
    } | null>(null);
    async function run(patch: Partial<ActivityCommand>) {
        const key = JSON.stringify(patch);
        if (retry.current?.key !== key)
            retry.current = { key, id: crypto.randomUUID() };
        setBusy(true);
        setError('');
        try {
            let revision = record.revision;
            let v: any;
            for (let attempt = 0; attempt < 2; attempt++) {
                if (patch.operation === 'configure') {
                    const snapshot = await (await fetch('/api/campaigns?id=' + encodeURIComponent(record.id), { cache: 'no-store' })).json();
                    revision = snapshot.record.revision;
                }
                const response = await fetch('/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: record.id, revision, requestId: retry.current.id, actorId, confirmed: true, ...patch }) });
                v = await response.json();
                if (response.ok)
                    break;
                if (patch.operation === 'configure' && attempt === 0 && String(v.error).includes('campaign changed'))
                    continue;
                throw Error(v.error);
            }
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
    return { busy, error, run };
}
export function DailyNeeds({ record, actorId }: {
    record: CampaignRecord;
    actorId?: string;
}) {
    const rows = needsSummary(record.session);
    return <details className="daily-needs"><summary>Daily Needs · Food &amp; Water</summary><table><thead><tr><th>Character</th><th>Food</th><th>Water</th></tr></thead><tbody>{rows.map(row => <tr key={row.characterId}><th>{row.name}</th>{(['food', 'water'] as const).map(key => {
                const n = row[key] as {
                    status: string;
                    explanation: string;
                };
                return <td key={key}><details><summary>{n.status}</summary><small>{n.explanation}</small></details></td>;
            })}</tr>)}</tbody></table><p>Use chat to choose food, water and sharing. Consumption rolls happen on character sheets.</p><FoodSafetyReview record={record} actorId={actorId ?? record.session.characters[0].id}/></details>;
}
export function DailySettings({ record, actorId: actingId }: {
    record: CampaignRecord;
    actorId?: string;
}) { const actorId = actingId ?? record.session.characters[0].id, { run, busy, error } = useActivityCommand(record, actorId), [checkpoint, setCheckpoint] = useState(record.session.activityState?.settings.checkpoint ?? 'Night'), [season, setSeason] = useState(record.session.activityState?.settings.season ?? ''); return <fieldset><legend>Daily Food &amp; Water</legend><label>Daily consumption checkpoint<select value={checkpoint} onChange={e => setCheckpoint(e.target.value as typeof checkpoint)}>{['Morning', 'Day', 'Evening', 'Night'].map(q => <option key={q}>{q}</option>)}</select></label><label>Current in-world season<select value={season} onChange={e => setSeason(e.target.value as typeof season)}><option value="">Confirm season for Foraging</option>{['Spring', 'Summer', 'Autumn', 'Winter'].map(q => <option key={q}>{q}</option>)}</select></label><p>The checkpoint prompts once per in-world day. Eating earlier is allowed. Changing it does not charge earlier dates or repeat satisfied needs.</p><button type="button" className="quiet-button" disabled={busy} onClick={() => run({ operation: 'configure', checkpoint, ...(season ? { season: season as 'Autumn' } : {}) })}>Save daily settings</button>{error && <p role="alert">{error}</p>}</fieldset>; }
export function RoutineQuarter({ record, entryId, actorId }: {
    record: CampaignRecord;
    entryId: string;
    actorId: string;
}) { const entry = record.session.activityState!.entries.find(e => e.entryId === entryId)!, { busy, error, run } = useActivityCommand(record, actorId), [status, setStatus] = useState<any>(null), [choices, setChoices] = useState<Record<string, string>>({}), [reason, setReason] = useState(''), [quantity, setQuantity] = useState('1'); useEffect(() => { fetch('/api/activities?' + new URLSearchParams({ campaignId: record.id, characterId: actorId })).then(r => r.json()).then(setStatus).catch(() => { }); }, [record.revision, actorId]); const choice = (id: string) => choices[id] ?? ''; return <section aria-label="Resolved quarter activities"><p>{entry.date} · {entry.quarter} · {entry.hex} · {entry.terrain}</p>{entry.activities.map(a => { const ch = record.session.characters.find(c => c.id === a.characterId)!; return <div className="quarter-assignment" key={a.assignmentId}><strong>{ch.name} — {a.activity}</strong><p><b>{a.status}</b> · {a.summary}</p>{a.request && <p>Required: {a.request.skill}{a.request.utility ? '' : ' · ' + a.request.base + ' base + ' + a.request.skillDice + ' skill, modifier ' + a.request.modifier} · roll from {ch.name}’s sheet. Saved results link automatically.</p>}{a.status === 'Awaiting Push/keep decision' && <button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'keep', assignmentId: a.assignmentId })}>Keep {ch.name}’s failed result</button>}{a.activity === 'Forage' && !a.request && a.status === 'Awaiting preparation or resource allocation' && <div><select aria-label={ch.name + ' Forage target'} value={choice(a.assignmentId) || 'food'} onChange={e => setChoices({ ...choices, [a.assignmentId]: e.target.value })}><option value="food">Food (fresh Vegetables)</option><option value="water">Water</option></select><button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'prepare', assignmentId: a.assignmentId, target: (choice(a.assignmentId) || 'food') as 'food' })}>Prepare {ch.name} Forage</button></div>}{a.activity === 'Hunt' && a.stage === 'initial' && <div><select aria-label={ch.name + ' Hunting equipment'} value={choice(a.assignmentId)} onChange={e => setChoices({ ...choices, [a.assignmentId]: e.target.value })}><option value="">Choose recorded weapon or trap</option>{ch.sheet?.weapons?.filter(w => w.skill === 'marksmanship').map((w, i) => <option key={'w' + i} value={w.itemId ?? w.name}>{w.name}</option>)}{ch.sheet?.gear?.filter(g => /hunting trap|snare/i.test(g.item ?? '')).map((g, i) => <option key={'g' + i} value={g.itemId ?? g.item}>{g.item}</option>)}</select><button className="quiet-button" disabled={busy || !choice(a.assignmentId)} onClick={() => run({ operation: 'prepare', assignmentId: a.assignmentId, choice: choice(a.assignmentId) })}>Prepare {ch.name} Hunt</button></div>}{a.stage === 'choose-prey' && <div>{a.preyOptions.length > 1 && <select aria-label={ch.name + ' prey choice'} value={choice(a.assignmentId) || String(a.prey)} onChange={e => setChoices({ ...choices, [a.assignmentId]: e.target.value })}>{a.preyOptions.map((n, i) => <option key={i} value={n}>{['Mouse', 'Crow', 'Rabbit', 'Fox', 'Boar', 'Deer'][n - 1]}</option>)}</select>}<button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'prey-keep', assignmentId: a.assignmentId, ...(a.preyOptions.length > 1 ? { prey: Number(choice(a.assignmentId) || a.prey) } : {}) })}>Keep current prey</button>{a.rerolls > 0 && <button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'prey-reroll', assignmentId: a.assignmentId })}>Reroll prey ({a.rerolls} left)</button>}</div>}{a.activity === 'Cook' && a.stage === 'initial' && <button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'prepare', assignmentId: a.assignmentId, fire: true })}>Confirm cooking fire and prepare Chef capacity</button>}{a.stage === 'cook-allocation' && <div><select aria-label={ch.name + ' Cooking ingredients'} value={choice(a.assignmentId)} onChange={e => setChoices({ ...choices, [a.assignmentId]: e.target.value })}><option value="">Choose existing fresh ingredients</option>{record.session.activityState?.provisions.filter(p => p.ownerId === ch.id && ['Vegetables', 'Meat', 'Fish'].includes(p.kind)).map(p => <option key={p.itemId} value={p.itemId}>{p.kind} · {ch.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0}</option>)}</select><input aria-label="Cooking quantity" type="number" min="1" max={a.yield} value={quantity} onChange={e => setQuantity(e.target.value)}/><button className="quiet-button" disabled={busy || !choice(a.assignmentId)} onClick={() => run({ operation: 'cook', assignmentId: a.assignmentId, itemId: choice(a.assignmentId), quantity: Number(quantity) })}>Prepare existing ingredients</button></div>}{a.status === 'Needs GM ruling' && a.activity === 'Make Camp' && status?.isTableGM && <button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'reveal-camp', assignmentId: a.assignmentId })}>Reveal and apply saved camp mishap</button>}{(a.status === 'Needs GM ruling' || a.review) && status?.isTableGM && <details><summary>Review specific printed follow-up</summary><textarea aria-label={ch.name + ' activity review'} value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe actual follow-up results and any unresolved obligations"/><button className="quiet-button" disabled={busy || reason.length < 20} onClick={() => run({ operation: 'review', assignmentId: a.assignmentId, reason })}>Record Table GM review</button></details>}{['Rest', 'Sleep'].includes(a.activity) && !entry.completed && <button className="quiet-button" disabled={busy || a.interrupted} onClick={() => run({ operation: 'interrupt', assignmentId: a.assignmentId })}>Mark {ch.name}’s {a.activity} interrupted</button>}{a.request && !a.request.rollId && <details><summary>Review a saved historical card</summary>{status?.eligible?.find((e: any) => e.assignmentId === a.assignmentId)?.cards.map((card: any) => <p key={card.id}>{card.label} · {record.session.characters.find(ch => ch.id === card.characterId)?.name}: {card.reason ?? 'Eligible for this exact current activity'} {!card.reason && <button className="quiet-button" disabled={busy} onClick={() => run({ operation: 'bind', assignmentId: a.assignmentId, rollId: card.id })}>Use this saved card</button>}</p>)}</details>}</div>; })}<DailyNeeds record={record} actorId={actorId}/>{!entry.completed && <><p role="status">{status?.blockers?.length ? status.blockers.join(' ') : 'Ready to complete quarter-day'}</p><button className="gold-button" disabled={busy || !!status?.blockers?.length} onClick={() => run({ operation: 'complete', entryId })}>Complete quarter-day</button><small>Confirms that eligible Rest/Sleep was uninterrupted, applies verified recovery, and advances once.</small></>}{error && <p role="alert">{error}</p>}</section>; }
function FoodSafetyReview({ record, actorId }: {
    record: CampaignRecord;
    actorId: string;
}) { const { run, busy, error } = useActivityCommand(record, actorId), [gm, setGM] = useState(false), [reason, setReason] = useState(''), [recipient, setRecipient] = useState(actorId); useEffect(() => { if (!record.session.activityState?.provisions.some(p => p.hazard))
    return; fetch('/api/activities?' + new URLSearchParams({ campaignId: record.id, characterId: actorId })).then(r => r.json()).then(v => setGM(v.isTableGM === true)).catch(() => { }); }, [record.id, actorId]); const items = record.session.activityState?.provisions.filter(p => p.hazard && Number(record.session.characters.find(ch => ch.id === p.ownerId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0) > 0) ?? []; if (!gm || !items.length)
    return null; return <details><summary>Specific meal procedures · Table GM</summary><p>Resolve the actual printed food-safety procedure first. A review permits one named recipient’s daily meal; it does not remove the hazard from the remaining stack.</p><label>Meal recipient<select value={recipient} onChange={e => setRecipient(e.target.value)}>{record.session.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label><label>Actual meal-procedure outcome<textarea value={reason} onChange={e => setReason(e.target.value)}/></label>{items.map(p => <p key={p.itemId}>{p.kind} · {record.session.characters.find(ch => ch.id === p.ownerId)?.name} <button type="button" className="quiet-button" disabled={busy || reason.length < 20} onClick={() => run({ operation: 'meal-review', itemId: p.itemId, recipientId: recipient, reason })}>Record this meal’s GM review</button></p>)}{error && <p role="alert">{error}</p>}</details>; }
