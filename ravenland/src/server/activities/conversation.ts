import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { executeActivity } from './service';
import { currentRoutine } from '../../lib/activities';
export function activityConversation(repo: SqliteCampaignRepository, id: string, actorId: string, requestId: string, text: string, principal: CharacterPrincipal | null): string | null {
    if (/\?\s*$/.test(text) || /^(?:how|why|what|can|could|would|should|does|is|when|whether|explain|tell|if)\b/i.test(text.trim()))
        return null;
    if (/\b(?:I think|maybe|perhaps|yesterday|last night|used to|I heard)\b/i.test(text))
        return null;
    const r = repo.get(id);
    if (!r)
        return null;
    const s = r.session, base = { campaignId: id, revision: r.revision, requestId, actorId, confirmed: true as const };
    if (/\b(?:finish|complete) (?:this |the |our )?quarter[- ]day\b/i.test(text) && currentRoutine(s))
        return String(executeActivity(repo, { ...base, operation: 'complete', entryId: currentRoutine(s)!.entryId }, principal).record.session.messages.find(m => m.id === requestId)?.text ?? 'Quarter-day completed through the existing clock.');
    const target = /\bwater|drink\b/i.test(text) ? 'water' : 'food', names = s.characters.filter(c => text.toLowerCase().includes(c.name.toLowerCase()) || text.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())), recipient = names.find(c => c.id !== actorId)?.id ?? actorId;
    if (/\bcancel my\b/i.test(text) && /food|water/i.test(text))
        return String(executeActivity(repo, { ...base, operation: 'cancel-consumption', recipientId: actorId, target }, principal).text);
    if (/\b(?:I (?:choose to go without|confirm I will go without)|resolve my unmet)\b/i.test(text) && /food|water/i.test(text))
        return String(executeActivity(repo, { ...base, operation: 'unmet', recipientId: actorId, target, reason: text }, principal).text);
    if (/\b(?:no|out of) (?:food|water)\b/i.test(text))
        return 'Before resolving a missing daily need, check whether anyone can share or whether fresh provisions are available. No condition has been imposed. Explicitly confirm an unmet Food or Water need when that decision is final.';
    if (/\b(?:share|give|transfer)\b/i.test(text) && /\b(?:vegetables|meat|fish|fresh food)\b/i.test(text)) {
        const kind = text.match(/\b(vegetables|meat|fish)\b/i)?.[1], choices = s.activityState?.provisions.filter(p => p.ownerId === actorId && (!kind || p.kind.toLowerCase() === kind.toLowerCase()) && Number(s.characters.find(c => c.id === actorId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0) > 0) ?? [];
        if (recipient === actorId || choices.length !== 1)
            return 'Name one recipient and one available provision kind to share.';
        return String(executeActivity(repo, { ...base, operation: 'share-item', sourceId: actorId, recipientId: recipient, itemId: choices[0].itemId, quantity: Number(text.match(/\b(\d+)\s+(?:units?|portions?)\b/i)?.[1] ?? 1), target: 'food' }, principal).text);
    }
    if (/\b(?:share|give|transfer)\b/i.test(text) && /\b(?:food|water|provisions|supplies)\b/i.test(text)) {
        if (recipient === actorId)
            return 'Who should receive your supplies? Sharing Resource Dice transfers actual die steps; the recipient then rolls when consuming.';
        return String(executeActivity(repo, { ...base, operation: 'share', sourceId: actorId, recipientId: recipient, target, quantity: Number(text.match(/\b(\d+)\s+steps?\b/i)?.[1] ?? 1) }, principal).text);
    }
    if (/^(?:I (?:will |want to )?(?:eat|consume|drink|roll)|(?:eat|consume|drink|roll)\b)/i.test(text.trim()) && /\b(?:food|water|die|supplies|vegetables|meat|fish|provisions)\b/i.test(text)) {
        if (names.some(c => c.id !== actorId))
            return 'Choose one consuming character with Acting As, and use their own provisions. Share the supplies first when another character owns them. No supplies were changed.';
        const raw = /\bvegetables|meat|fish|fresh|portion\b/i.test(text), kind = text.match(/\b(vegetables|meat|fish)\b/i)?.[1];
        if (raw) {
            const choices = s.activityState?.provisions.filter(p => p.ownerId === actorId && (!kind || p.kind.toLowerCase() === kind.toLowerCase()) && Number(s.characters.find(c => c.id === actorId)?.sheet?.gear?.find(g => g.itemId === p.itemId)?.quantity ?? 0) > 0) ?? [];
            if (choices.length !== 1)
                return 'Which available provision stack should be consumed? Name Vegetables, Meat or Fish, or select its recorded item through the activity review.';
            return String(executeActivity(repo, { ...base, operation: 'consume', sourceId: actorId, recipientId: actorId, itemId: choices[0].itemId, target }, principal).text);
        }
        return String(executeActivity(repo, { ...base, operation: 'resource', sourceId: actorId, recipientId: actorId, target }, principal).text);
    }
    return null;
}
export function guardActivityNarration(s: import('../../lib/types').Session, text: string) {
    const entry = currentRoutine(s) ?? s.activityState?.entries.filter(e => e.completed).at(-1);
    if (!entry)
        return text;
    let unsupported = false;
    for (const a of entry.activities) {
        const name = s.characters.find(c => c.id === a.characterId)?.name.split(' ')[0]?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if (!name)
            continue;
        const patterns = [{ activity: 'Make Camp', verb: '(?:successfully (?:made|makes|established)|established|sets up|made) (?:a |the )?camp' }, { activity: 'Forage', verb: '(?:foraged|gathered|found) (?:[a-z0-9]+ )?(?:food|vegetables)' }, { activity: 'Sleep', verb: '(?:slept|has slept|wakes refreshed)' }, { activity: 'Cook', verb: '(?:cooked|prepared) (?:the |some )?(?:food|meals)' }];
        for (const p of patterns)
            if (new RegExp('\\b' + name + '\\b[^.!?]{0,70}' + p.verb, 'i').test(text) && (a.activity !== p.activity || a.status !== 'Resolved' || p.activity === 'Sleep' && !entry.completed))
                unsupported = true;
    }
    if (!entry.completed && /\b(?:the camp is (?:ready|established)|everyone (?:ate|has eaten|slept)|you (?:gathered|consumed|recovered)|quarter[- ]day (?:has )?(?:advanced|completed))\b/i.test(text))
        unsupported = true;
    return unsupported ? 'The saved ' + entry.quarter + ' activities are still in progress. ' + entry.activities.map(a => (s.characters.find(c => c.id === a.characterId)?.name ?? a.characterId) + ' — ' + a.activity + ': ' + a.summary).join(' ') : text;
}
