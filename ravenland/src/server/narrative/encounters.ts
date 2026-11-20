import type { SqliteCampaignRepository } from '../sqlite';
import { combatPages, citation } from '../combat/sources';
import { AIError } from '../ai/config';
// Read the actual numeric row from the authorized original Guide. No generated encounter odds.
export function encounterSelection(repo: SqliteCampaignRepository, id: string, terrain: string, faces: [
    number,
    number
]) {
    const page = combatPages(repo, id, 'guide').map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ') })).find(p => /11.?36.*0.*0.*0/i.test(p.text) && /RANDOM ENCOUNTERS/i.test(p.text));
    if (!page)
        throw new AIError('journey_encounter_source', 'The original Guide encounter table must be available before resolving travel.', 409);
    const index = ['Plains', 'Forest', 'Dark Forest', 'Hills', 'Mountains', 'Lake', 'Marshlands', 'Quagmire', 'Ruins'].indexOf(terrain === 'Lake/River' ? 'Lake' : terrain);
    if (index < 0)
        throw new AIError('journey_encounter_terrain', 'This terrain needs its own verified encounter procedure.', 409);
    const value = faces[0] * 10 + faces[1];
    if (faces.some(v => !Number.isInteger(v) || v < 1 || v > 6))
        throw new AIError('journey_encounter_die', 'The encounter die is invalid.');
    if (value <= 36)
        return { entryNumber: 0, sourceId: citation(page).chunkId };
    const pattern = new RegExp('(?:^|\\s)' + value + '\\s+' + Array(9).fill('(\\d{1,2})').join('\\s+') + '(?=\\s|$)'), match = page.text.match(pattern);
    if (!match)
        throw new AIError('journey_encounter_row', 'The original Guide encounter row needs review; no encounter result was guessed.', 409);
    return { entryNumber: Number(match[index + 1]), sourceId: citation(page).chunkId };
}
