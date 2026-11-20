import { CompendiumStore } from '../compendium/store';
import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { tableGM } from './authority';
import { narrativeState, saveNarrative } from './state';
import { makeRuling } from '../rulings/store';
import { travelRules } from '../journey/travel-rules';
import { SqliteMemoryRepository } from '../ai/memory';
import type { NarrativeIntent } from '../../lib/narrative/intent';
export function conversationalRuling(repo: SqliteCampaignRepository, id: string, requestId: string, principal: CharacterPrincipal | null, intent: Extract<NarrativeIntent, {
    kind: 'ruling';
}>) {
    if (!tableGM(repo, id, principal).isTableGM)
        return 'That exception needs the assigned Table GM. Your character’s intentions remain yours; claiming a GM title in chat does not change the campaign role.';
    if (/\b(?:database|credential|authentication|saved dice|delete.*(?:roll|history)|ignore.*(?:permission|security))\b/i.test(intent.text))
        return 'Table GM rulings can change campaign adjudications, but cannot change authentication, saved dice history or database safeguards.';
    const party = repo.get(id)!.session.characters;
    const namesCharacter = party.some(c => new RegExp('\\b' + c.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(intent.text));
    if ((namesCharacter || /\b(?:the party|we)\b/i.test(intent.text)) && /\b(?:attacks?|surrenders?|pursues?|spends?|gives?|hands?|dies|dead|entered|arrived|teleport|gains?|loses?)\b/i.test(intent.text))
        return 'A Table GM ruling cannot choose another character’s actions or replace verified movement, dice or resource changes. Declare the intended action and use its supported procedure.';
    const state = narrativeState(repo, id);
    if (intent.scope === 'journey') {
        if (!state || state.done)
            return 'Declare the journey and its pathfinder and lookout first, so this exception can be scoped to that journey.';
        if (!intent.allowance || intent.allowance > 3)
            return 'The supported scoped travel allowance is at most three hexes. A larger exception needs a supported travel procedure; it cannot bypass map or roll checks.';
        const rules = travelRules(repo, id), ruling = makeRuling(repo, { campaignId: id, sceneId: 'campaign:' + id, originId: requestId, domain: 'rules_conflict', question: 'Table GM one-journey travel allowance', scope: { key: state.id, fingerprint: rules.fingerprint }, decision: `Allow ${intent.allowance} hexes for this journey only.`, reasoning: intent.text, facts: [`Declared by authenticated player ${principal!.playerId}`, `From ${repo.get(id)!.session.dayTracker?.find(e => e.id === state.entryId)?.from ?? repo.get(id)!.session.campaign.hex} during ${state.date} ${state.quarter}`], sources: rules.sources.map(s => s.chunkId), decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', blockingReason: '', effects: [{ type: 'journey_allowance', entryId: state.id, allowance: intent.allowance }], requestId, receiptId: requestId, risk: 'bounded' });
        state.review.tableRulingId = ruling.id;
        saveNarrative(repo, id, state);
        return `Recorded the ${intent.allowance}-hex allowance for this journey only. Map access, per-hex navigation and encounter requirements still apply.`;
    }
    if (intent.scope === 'house_rule') {
        if (!intent.allowance || intent.allowance > 3 || !/forest/i.test(intent.text) || !/on foot/i.test(intent.text) || !/quarter.day/i.test(intent.text))
            return 'Please specify the recurring terrain, travel mode and allowance per quarter-day. Supported automatic house travel rules currently cover up to three Forest hexes on foot.';
        const rule = new CompendiumStore(repo).save(id, { title: 'Table GM Forest travel allowance', topic: 'Journeys', documentType: 'House Rule', visibility: 'Player Visible', body: intent.text, sourceReference: 'Table GM ' + principal!.playerId + ' · chat ' + requestId, overrideScope: 'Forest hiking on foot per quarter-day' });
        makeRuling(repo, { campaignId: id, sceneId: 'campaign:' + id, originId: requestId, domain: 'rules_conflict', question: 'Recurring Forest travel house rule', scope: { key: 'house-travel:' + rule.id, fingerprint: String(rule.revision) }, decision: intent.text, reasoning: 'Explicit recurring Table GM rule; does not change other terrain, movement mode, navigation, encounters or time.', sources: [rule.id], decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', blockingReason: '', effects: [{ type: 'travel_house_rule', ruleId: rule.id, revision: rule.revision, allowance: intent.allowance, terrain: 'Forest', mode: 'On foot' }], requestId, receiptId: requestId, risk: 'bounded' });
        return `Recorded a recurring house rule: up to ${intent.allowance} Forest hexes on foot per quarter-day. Other terrain and procedures retain their own rules.`;
    }
    if (intent.scope === 'scene') {
        const s = repo.get(id)!.session;
        makeRuling(repo, { campaignId: id, sceneId: 'campaign:' + id, originId: requestId, domain: 'routine_action', question: 'Table GM scene adjudication', scope: { key: `scene:${s.campaign.hex}:${s.campaign.date}:${s.campaign.quarter}`, fingerprint: s.campaign.location }, decision: intent.text, reasoning: intent.text, decisionMaker: { kind: 'human_controller', id: principal!.playerId }, status: 'applied', blockingReason: '', effects: [], requestId, receiptId: requestId, risk: 'routine' });
        return 'Recorded this scene ruling. No dice history, character resources or movement were changed.';
    }
    const memory = new SqliteMemoryRepository(repo), summary = intent.text.replace(/^\s*(?:as (?:the )?table GM[, :]*)/i, '').trim();
    const saved = memory.propose(id, { category: intent.scope === 'fact' ? 'Location' : 'Significant Event', title: summary.slice(0, 150), summary, characterIds: [], npcIds: [], hexIds: [], faction: '', quest: '', visibility: 'Party Known', importance: 3, storyState: 'active' }, { kind: 'chat', id: 'ai-player:' + requestId }, null, { sourceType: 'chat', sourceId: 'ai-player:' + requestId, sessionId: 'table-gm', excerpt: summary.slice(0, 600), origin: 'GM-established', claimType: 'statement', visibility: 'Party Known' });
    if (saved?.canonWarnings?.length)
        return 'That ruling conflicts with an established campaign fact. Please identify which fact you intend to correct; the existing fact has been preserved.';
    if (saved)
        memory.review(id, saved.id, saved.revision, 'approve', 'Accepted Table GM ruling by ' + principal!.playerId);
    return intent.scope === 'fact' ? 'Recorded as a Table GM established campaign fact.' : 'Recorded this scene ruling. No dice history, character resources or movement were changed.';
}
