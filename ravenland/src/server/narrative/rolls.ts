import { activeCombat } from '../combat/store';
import { readConsequences } from '../consequences/store';
import { randomUUID } from 'node:crypto';
import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { requireCharacterAccess } from '../character-access';
import { mechanicalCharacter } from '../mechanical-character';
import { narrativeEvent, narrativeState, saveNarrative, type NarrativeJourney } from './state';
import type { DiceCommand } from '../../lib/dice/schema';
import { AIError } from '../ai/config';
export function addRequest(state: NarrativeJourney, characterId: string, skill: 'Survival' | 'Scouting' | 'D66', scope: string, modifier = 0) {
    const old = state.requests.find(r => r.scope === scope && r.skill === skill);
    if (old)
        return old;
    const request = { id: randomUUID(), characterId, skill, scope, modifier, activity: skill === 'Survival' ? 'Lead the Way' : skill === 'Scouting' ? 'Keep Watch' : 'Navigation mishap', rollId: null, kept: false };
    state.requests.push(request);
    return request;
}
export function requestedJourneyRoll(repo: SqliteCampaignRepository, id: string, actor: string, principal: CharacterPrincipal | null) {
    requireCharacterAccess(principal, id, actor);
    if (activeCombat(repo, id) || readConsequences(repo, id).some(c => !['resolved', 'superseded'].includes(c.status) && ['life', 'mandatory'].includes(c.urgency)))
        return null;
    const state = narrativeState(repo, id);
    if (!state || state.done)
        return null;
    const pending = state.requests.filter(r => r.characterId === actor && !r.rollId);
    if (pending.length !== 1)
        return null;
    const r = pending[0], ch = repo.get(id)!.session.characters.find(c => c.id === actor);
    if (!ch)
        return null;
    const character = mechanicalCharacter(ch), base = character.attributes.wits.current, skill = character.skills[r.skill === 'Scouting' ? 'skill-scouting' : 'skill-survival'];
    if (r.skill !== 'D66' && (base === null || skill === null))
        return null;
    return { context: { narrativeRequestId: r.id }, label: r.skill, purpose: r.activity, attribute: r.skill === 'D66' ? null : 'wits' as const, base: base ?? 0, skill: skill ?? 0, gear: 0, modifier: r.modifier, isArmor: false, instructions: `${r.activity} · ${state.date} · ${state.quarter}${r.skill === 'Survival' ? ` · into ${r.scope.split(':').at(-1)}` : ''}. Roll from this sheet. A failed result remains available to Push or keep.`, ...(r.skill === 'D66' ? { utility: { kind: 'D66' as const } } : {}) };
}
export function bindNarrativeRoll(repo: SqliteCampaignRepository, id: string, c: Extract<DiceCommand, {
    type: 'create';
}>, session: NonNullable<ReturnType<SqliteCampaignRepository['get']>>['session'], principal:CharacterPrincipal|null=null) {
    if (activeCombat(repo, id) || readConsequences(repo, id).some(c => !['resolved', 'superseded'].includes(c.status) && ['life', 'mandatory'].includes(c.urgency))) {
        if (c.expectedNarrativeRequestId)
            throw new AIError('journey_roll_blocked', 'Travel is interrupted. Resolve the current mandatory procedure before rolling for this journey.', 409);
        return;
    }
    const state = narrativeState(repo, id);
    if (!state || state.done) {
        if (c.expectedNarrativeRequestId)
            throw new AIError('journey_roll_stale', 'That journey roll is no longer requested.', 409);
        return;
    }
    const pending = state.requests.filter(r => !r.rollId && r.characterId === c.roll.characterId && (r.skill==='D66'?c.metadata.utility?.kind==='D66':r.skill===c.roll.skill&&!c.metadata.utility));
    if (c.expectedNarrativeRequestId && !pending.some(r => r.id === c.expectedNarrativeRequestId))
        throw new AIError('journey_roll_stale', 'The journey request changed. Refresh the requested roll.', 409);
    if (pending.length !== 1)
        return;
    requireCharacterAccess(principal,id,c.roll.characterId);
    const request = pending[0], ch = mechanicalCharacter(session.characters.find(ch => ch.id === request.characterId)!);
    if (request.skill !== 'D66') {
        const skill = ch.skills[request.skill === 'Survival' ? 'skill-survival' : 'skill-scouting'], base = ch.attributes.wits.current, modified = (skill ?? 0) + request.modifier;
        if (base === null || skill === null || c.metadata.attribute !== 'wits' || c.metadata.utility || c.roll.attribute.length !== base || c.roll.skillDice.length !== Math.abs(modified) || c.roll.negativeSkill !== (modified < 0) || c.roll.gear.length || c.roll.artifacts.length)
            throw new AIError('journey_pool', 'Use the requested current Wits and skill pool with its travel modifier. Additional equipment bonuses need a source-backed review.', 409);
    }
    const card = session.dice!.find(d => d.id === c.roll.id)!;
    card.narrativeRequestId = request.id;
    narrativeEvent(repo, id, 'bind:' + request.id, state.id, 'verified_roll_binding', principal!.playerId, { coordinatorId:state.controllerId,request, rollId: card.id, sourceIds: state.sourceIds, date: state.date, quarter: state.quarter });
    request.rollId = card.id;
    saveNarrative(repo, id, state);
}
