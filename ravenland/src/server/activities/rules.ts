import { combatPages, citation } from '../combat/sources';
import type { SqliteCampaignRepository } from '../sqlite';
import { AIError } from '../ai/config';
export function activityRules(repo: SqliteCampaignRepository, id: string) {
    const overrides = repo.db.prepare("SELECT override_scope FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule'").all(id);
    if (overrides.some(r => /forag|hunt|camp|cooking|daily|consum|food|water|sleep|rest recovery/i.test(String(r.override_scope))))
        throw new AIError('activity_house_rule', 'Review the applicable scoped activity/consumption house rule before applying the official procedure automatically.', 409);
    const pages = combatPages(repo, id, 'handbook').map(p => ({ ...p, text: p.text.replace(/-\s+/g, '').replace(/\s+/g, ' ') }));
    const find = (pattern: RegExp) => {
        const p = pages.find(p => pattern.test(p.text));
        if (!p)
            throw new AIError('activity_source', 'Restore the original Handbook activity evidence or request a specific GM review before applying this procedure.', 409);
        return p;
    };
    const forage = find(/number of units of VEGETABLES.*number of.*you rolled/i), hunt = find(/To kill your prey you must roll again/i), prey = find(/Mouse.*Crow.*Rabbit.*Fox.*Boar.*Deer/i), camp = find(/Only one person rolls to MAK\s*E CAMP/i), resource = find(/SHARING\s*:.*Resource Die/i), conditions = find(/After a day without water/i), rest = find(/SLEEP also counts as REST/i), chef = find(/Cooking requires a fire/i), terrain = find(/TERRAIN TYPES.*Dark Forest/i), recovery = find(/recover all.*remaining lost attribute points/i);
    if (!/If the die shows 1 or 2.*decrease the Resource Die one step/i.test(resource.text) || !/unit of a consumable increases your Resource Die one step/i.test(resource.text) || !/MEAT raw/i.test(hunt.text))
        throw new AIError('activity_source', 'The original resource-depletion, unit conversion and raw-food rules must be verified.', 409);
    const normalizedPrey = prey.text.replace(/−/g, '-');
    for (const [index, row] of preyTable.entries()) {
        const pattern = new RegExp('\\b' + (index + 1) + '\\s+' + row.name + '\\s+\\+?' + row.difficulty + '\\*?\\s+Weapon' + (row.trap ? ' or trap' : '') + '\\s+' + row.meat + '\\s+' + (row.pelts || '[—–-]'), 'i');
        if (!pattern.test(normalizedPrey))
            throw new AIError('hunting_table', 'The actual printed prey row does not verify this supported animal’s difficulty and yield. No guessed Meat or Pelts were awarded.', 409);
    }
    const normalizedTerrain = terrain.text.replace(/−/g, '-');
    for (const [name, row] of Object.entries(terrainModifiers)) {
        const prefix = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (row.forage !== null && row.hunt !== null && !new RegExp('\\b' + prefix + '\\s+(?:Open terrain|Difficult terrain|Requires a raft)\\s+\\+?' + row.forage + '\\s+\\+?' + row.hunt + '\\b', 'i').test(normalizedTerrain))
            throw new AIError('activity_terrain', 'The actual terrain table does not verify this activity modifier. Review its specific source rule.', 409);
    }
    return { pages, forage, hunt, prey, camp, resource, conditions, rest, chef, terrain, recovery, sources: [forage, hunt, prey, camp, resource, conditions, rest, chef, terrain, recovery].map(p => { const c = citation(p); return `${c.chunkId} · ${c.title} · physical page ${c.page}`; }) };
}
export const terrainModifiers: Record<string, {
    forage: number | null;
    hunt: number | null;
}> = { Plains: { forage: -1, hunt: 1 }, Forest: { forage: 1, hunt: 1 }, 'Dark Forest': { forage: -1, hunt: 0 }, Hills: { forage: 0, hunt: 0 }, Mountains: { forage: -2, hunt: -1 }, 'High Mountains': { forage: null, hunt: null }, 'Lake/River': { forage: null, hunt: 0 }, Marshlands: { forage: 1, hunt: -1 }, Quagmire: { forage: -1, hunt: 0 }, Ruins: { forage: -2, hunt: -1 } };
export const preyTable = [{ name: 'Mouse', difficulty: 1, meat: 1, pelts: 0, trap: true }, { name: 'Crow', difficulty: 0, meat: 1, pelts: 0, trap: false }, { name: 'Rabbit', difficulty: 1, meat: 2, pelts: 1, trap: true }, { name: 'Fox', difficulty: -1, meat: 3, pelts: 1, trap: true }, { name: 'Boar', difficulty: -1, meat: 4, pelts: 2, trap: false }, { name: 'Deer', difficulty: 0, meat: 5, pelts: 3, trap: false }];
