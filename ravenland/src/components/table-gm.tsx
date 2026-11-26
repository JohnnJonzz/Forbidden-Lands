'use client';
import { useEffect, useState } from 'react';
export function TableGMSettings({ campaignId, characterId }: {
    campaignId: string;
    characterId: string;
}) { const [state, setState] = useState<{
    playerId: string;
    revision: number;
    canAssign: boolean;
    isTableGM: boolean;
} | null>(null), [player, setPlayer] = useState(''), [error, setError] = useState(''); useEffect(() => { let alive = true; fetch('/api/table-gm?' + new URLSearchParams({ campaignId, characterId }), { cache: 'no-store' }).then(r => r.json()).then(v => { if (alive && !v.error) {
    setState(v);
    setPlayer(v.playerId);
} }).catch(() => { }); return () => { alive = false; }; }, [campaignId, characterId]); if (!state)
    return null; return <section className="settings-form"><h3>Table GM</h3><p>{state.isTableGM ? 'You are the Table GM.' : 'The Table GM may make campaign rulings and establish facts.'} The local controller defaults to this role. Selecting a different character does not change it.</p>{state.canAssign && <form onSubmit={async (e) => { e.preventDefault(); setError(''); try {
    const response = await fetch('/api/table-gm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId, characterId, playerId: player, revision: state.revision, requestId: crypto.randomUUID() }) }), body = await response.json();
    if (!response.ok)
        throw Error(body.error);
    setState(body);
}
catch (e) {
    setError((e as Error).message);
} }}><label>Table GM player identity<input value={player} maxLength={100} onChange={e => setPlayer(e.target.value)}/></label><p>Use the server’s playerId for an authenticated player, or trusted-local for this computer’s controller.</p><button className="gold-button">Save Table GM assignment</button></form>}{error && <p role="alert">{error}</p>}</section>; }
