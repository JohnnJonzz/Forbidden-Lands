import {sameDay} from '../../lib/calendar';
import type { SqliteCampaignRepository } from '../sqlite';
import type { CharacterPrincipal } from '../character-access';
import { tableGM } from '../narrative/authority';
import { reviewCandidates } from './review';
import { executeContinuity } from './service';
import { usableCamp } from '../../lib/campsites';
export function continuityConversation(repo: SqliteCampaignRepository, id: string, actorId: string, requestId: string, text: string, principal: CharacterPrincipal | null): string | null {
    if (/\?\s*$/.test(text) || /^(?:what|why|how|if|could|would|does|did|is|maybe|perhaps)\b/i.test(text.trim()) || /\bI think\b/i.test(text))
        return null;
    const r = repo.get(id);
    if (!r)
        return null;
    const campIntent = /\bcamp(?:site)?\b/i.test(text) && /\b(?:made|established|previous|Evening|already)\b/i.test(text) && /\b(?:use|recogniz\w*|reconcil\w*|restore|tonight|Sleep)\b/i.test(text), mealIntent = /\b(?:already (?:ate|consumed)|each (?:ate|consumed)|confirm.*consumed)\b/i.test(text) && /\b(?:vegetables|gathered food|foraged|foraging)\b/i.test(text);
    if (!campIntent && !mealIntent)
        return null;
    if (!tableGM(repo, id, principal).isTableGM)
        return 'Historical campsite and consumption corrections require the assigned Table GM. Chat narration alone does not update the activity controller.';
    const reviews = reviewCandidates(repo, id).filter((x): x is ReturnType<typeof import('./review').historicalReview> => 'classification' in x), nameMatches = (characterId: string) => { const name = r.session.characters.find(c => c.id === characterId)?.name.toLowerCase(); return !!name && (text.toLowerCase().includes(name) || text.toLowerCase().includes(name.split(' ')[0])); }, base = { campaignId: id, revision: r.revision, requestId, actorId, confirmed: true as const, reason: text };
    if (campIntent) {
        const choices = reviews.filter(x => x.activity === 'Make Camp' && x.hex === r.session.campaign.hex && nameMatches(x.characterId));
        if (choices.length !== 1)
            return 'Open “Review previous quarter’s Make Camp result” and select the exact completed camp event; I will not merge different camps by hex.';
        const candidate = choices[0];
        if (candidate.errors.length || candidate.classification !== 'verified_saved_result')
            return 'The previous Make Camp needs an explicit record review: ' + [...candidate.errors, ...candidate.uncertainties].join(' ') + ' Use “Review previous quarter’s Make Camp result”; no roll or controller update was invented.';
        return executeContinuity(repo, { ...base, operation: 'reconcile-camp', entryId: candidate.entryId, assignmentId: candidate.assignmentId }, principal).text;
    }
    const consumers = r.session.characters.filter(ch => nameMatches(ch.id));
    if (consumers.length < 1)
        return 'Name each consumer or use Resolve consumption on their Daily Needs status.';
    const sources = reviews.filter(x => x.activity === 'Forage' && x.hex === r.session.campaign.hex && sameDay(x.date,r.session.campaign.date,r.session.environment?.calendar));
    if (sources.length !== 1)
        return 'Open Resolve consumption and choose the original Foraging event. The source is not unambiguous.';
    const source = sources[0], stock = source.inventory.filter(p => p.quantity > 0);
    if (source.errors.length || source.classification !== 'verified_saved_result' || stock.length !== 1 || stock[0].quantity < consumers.length)
        return 'The historical meal needs a reviewed bookkeeping choice. Open Resolve consumption: select the original Foraging event, inspect its yield and inventory, then approve an actual deduction, a missing-yield correction, or a clearly labeled Table GM ruling. No Food roll, inventory adjustment or daily satisfaction has been invented.';
    return executeContinuity(repo, { ...base, operation: 'confirm-consumption', entryId: source.entryId, assignmentId: source.assignmentId, itemId: stock[0].itemId, sourceOwnerId: stock[0].ownerId, method: 'available', date: source.date, quarter: source.quarter, earlier: true, consumers: consumers.map(ch => ({ characterId: ch.id, resource: 'food', amount: 1 })) }, principal).text;
}
export function guardCampNarration(s: import('../../lib/types').Session, text: string) { if (usableCamp(s))
    return text; if (/\b(?:your camp|the camp|the campsite) (?:is|remains) (?:established|available|ready|sheltered)|\bNight(?:'s)? (?:Sleep|controller)[^.!?]{0,60}(?:was|is|has been) updated/i.test(text))
    return 'No available authoritative campsite has been recorded at this location. Review the previous quarter’s Make Camp result; narrative acknowledgment alone does not update Night Sleep.'; return text; }
