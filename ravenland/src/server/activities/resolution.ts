import { randomInt } from 'node:crypto';
import type { Session } from '../../lib/types';
import type { RoutineActivity } from '../../lib/activities';
import type { PendingDice } from '../../lib/dice/schema';
import type { SqliteCampaignRepository } from '../sqlite';
import { sheetFor, applySheet } from '../../lib/character-sheet';
import { stateFor, addProvisions, newRequest, rank } from './state';
import { preyTable } from './rules';
const depleted = (value: string | boolean | undefined) => { const dice = ['None', 'D6', 'D8', 'D10', 'D12'], i = dice.indexOf(String(value)); if (i < 0)
    throw Error('Record the actual carried resource die before resolving spoilage; no supplies were changed.'); return dice[Math.max(0, i - 1)] ?? 'None'; };
function review(a: RoutineActivity, text: string) { a.status = 'Needs GM ruling'; a.summary = text; a.request = null; }
export function finish(a: RoutineActivity, text: string) { a.status = 'Resolved'; a.stage = 'resolved'; a.summary = text; a.request = null; }
export function applyCampMishap(s: Session, a: RoutineActivity, n: number) {
    if (n <= 16) {
        const resource = n <= 13 ? 'water' : 'food';
        for (const ch of s.characters) {
            const sheet = sheetFor(ch);
            sheet['res-' + resource as 'res-food'] = depleted(sheet['res-' + resource as 'res-food']);
            s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
        }
        finish(a, 'The camp mishap spoiled the party’s ' + resource + '; each recorded resource die decreased one step.');
    }
    else if (n <= 25) {
        a.choice = 'no-sleep';
        finish(a, 'Bad campsite: no one gets Sleep here until a new campsite is found.');
    }
    else if (n >= 43 && n <= 45) {
        for (const ch of s.characters) {
            const sheet = sheetFor(ch), v = Number(sheet['attr-agility']);
            if (!Number.isInteger(v) || v <= 1) {
                review(a, 'Ants: review the recorded Agility damage and any Broken procedure before resolving the camp.');
                return;
            }
            sheet['attr-agility'] = String(v - 1);
            s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
        }
        a.choice = 'no-sleep';
        finish(a, 'Ants: every party member suffered 1 Agility damage and cannot Sleep here.');
    }
    else
        review(a, 'The revealed camp mishap requires its printed follow-up: ' + (n <= 32 ? 'Downpour: cold checks and no Sleep.' : n <= 36 ? 'Fire dies: cold checks.' : n <= 42 ? 'Fire: attacks, Move checks and actual gear loss.' : n <= 51 ? 'Lice: select the actual victim, daily Agility damage and Healing.' : n <= 54 ? 'Mosquito swarm: actual Empathy attacks.' : n <= 56 ? 'Savage animal: choose the actual animal encounter.' : n <= 63 ? 'Lost gear: identify the actual item.' : 'Broken gear: identify the actual damaged item.'));
}
export function huntingKillRequest(s: Session, entryId: string, a: RoutineActivity) {
    const prey = preyTable[a.prey! - 1];
    if (a.method === 'trap' && !prey.trap) {
        review(a, 'A ' + prey.name + ' cannot be caught with a hunting trap. Choose a recorded ranged weapon or leave this prey.');
        return;
    }
    let gear = 0;
    if (a.method === 'weapon') {
        const ch = s.characters.find(c => c.id === a.characterId)!, w = sheetFor(ch).weapons?.find(w => w.itemId === a.choice || w.name === a.choice);
        if (!w || !/^\d+$/.test(w.current ?? w.gearBonus ?? '')) {
            review(a, 'Confirm the selected ranged weapon’s actual current Gear rating.');
            return;
        }
        gear = Number(w.current ?? w.gearBonus);
    }
    a.stage = 'kill';
    a.request = newRequest(s, entryId, a, 'kill', a.method === 'trap' ? 'Survival' : 'Marksmanship', prey.difficulty + (a.method === 'trap' && rank(s, a.characterId, 'Master of the Hunt') >= 1 ? 1 : 0), null, gear);
    a.status = 'Awaiting roll';
    a.summary = 'Found ' + prey.name + '. Resolve ' + a.request.skill + ' (' + prey.difficulty + ' prey modifier) to obtain actual Meat/Pelts.';
}
export function resolveActivityRoll(repo: SqliteCampaignRepository, id: string, s: Session, entryId: string, a: RoutineActivity, card: PendingDice) {
    const step = a.request!.context.step, utility = card.metadata.utility, success = card.result.successes;
    a.rollIds.push(card.id);
    card.status = 'Submitted';
    card.submittedAt = new Date().toISOString();
    a.request = null;
    if (step === 'forage') {
        if (success === 0) {
            a.stage = 'forage-mishap';
            a.request = newRequest(s, entryId, a, 'forage-mishap', 'D6', 0, 'D6');
            a.status = 'Awaiting mishap';
            a.summary = 'Foraging failed; the printed D6 mishap is required.';
        }
        else if (a.target === 'water') {
            for (const ch of s.characters) {
                const sheet = sheetFor(ch);
                if (sheet.gear?.some(g => /waterskin|water skin/i.test(g.item ?? '') && Number(g.quantity) > 0) || /^D(?:6|8|10|12)$/.test(String(sheet['res-water']))) {
                    sheet['res-water'] = 'D12';
                    s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
                }
            }
            finish(a, 'Found drinkable water; recorded waterskins were filled to D12. No daily consumption has been assumed.');
        }
        else {
            const n = success * (rank(s, a.characterId, 'Gatherer') >= 3 ? 2 : 1);
            addProvisions(s, a.characterId, 'Vegetables', n);
            a.yield = n;
            finish(a, 'Gathered ' + n + ' fresh Vegetables. Edible raw within one day; no automatic Food resource-die increase.');
        }
    }
    else if (step === 'camp') {
        if (success > 0) {
            a.choice = 'sheltered';
            finish(a, 'Established a sheltered, comfortable camp. Sleep and recovery await quarter completion.');
        }
        else {
            const n = randomInt(1, 7) * 10 + randomInt(1, 7);
            repo.db.prepare('INSERT INTO activity_private VALUES (?,?,?) ON CONFLICT(campaign_id,assignment_id) DO NOTHING').run(id, a.assignmentId, JSON.stringify({ mishap: n, applied: false }));
            review(a, 'A less pleasant camp was made. Its hidden mishap awaits the Table GM’s timing and review.');
        }
    }
    else if (step === 'hunt-search') {
        if (success === 0) {
            a.stage = 'hunt-mishap';
            a.request = newRequest(s, entryId, a, 'hunt-mishap', 'D6', 0, 'D6');
            a.status = 'Awaiting mishap';
            a.summary = 'The hunt failed; resolve the actual D6 hunting mishap.';
        }
        else {
            a.rerolls = success - 1;
            a.stage = 'prey';
            a.request = newRequest(s, entryId, a, 'prey', 'D6', 0, 'D6');
            a.status = 'Awaiting roll';
            a.summary = 'Game found. Roll the printed prey D6; each extra search success allows one optional replacement roll.';
        }
    }
    else if (step === 'prey') {
        if (utility?.kind !== 'Procedure')
            throw Error('Use a saved prey D6.');
        a.prey = utility.faces[0];
        a.preyOptions = utility.faces.slice(0, 2);
        a.stage = 'choose-prey';
        a.status = 'Awaiting preparation or resource allocation';
        a.summary = 'Found ' + preyTable[a.prey - 1].name + '. Keep this prey or spend an available reroll; an earlier result cannot be recovered.';
    }
    else if (step === 'kill') {
        const owner = s.characters.find(ch => ch.id === a.characterId)!, weapon = owner.sheet?.weapons?.find(w => w.itemId === a.choice || w.name === a.choice);
        if (a.method === 'weapon' && /bow/i.test(weapon?.name ?? '')) {
            const die = owner.sheet?.['res-arrows'];
            if (!die || die === 'None') {
                review(a, 'The bow shot needs its actual arrow resource procedure; no Meat was awarded.');
                return;
            }
            const next = success > 0 ? 'hunt-arrows-success' : 'hunt-arrows-failure';
            a.stage = next;
            a.yield = success > 0 ? preyTable[a.prey! - 1].meat : 0;
            a.request = { ...newRequest(s, entryId, a, next, 'arrows', 0, 'D6'), skill: 'arrows', utility: 'Resource', resource: 'arrows', sides: Number(String(die).slice(1)) };
            a.status = 'Awaiting roll';
            a.summary = 'Resolve the shot’s current ' + die + ' Arrows Resource Die before recording the hunting outcome.';
            return;
        }
        if (success > 0) {
            const prey = preyTable[a.prey! - 1];
            addProvisions(s, a.characterId, 'Meat', prey.meat);
            addProvisions(s, a.characterId, 'Pelts', prey.pelts);
            a.yield = prey.meat;
            finish(a, 'Hunted ' + prey.name + ': ' + prey.meat + ' fresh Meat and ' + prey.pelts + ' Pelts. Raw Meat is edible within a day; preparing portable Food requires Chef or an Inn.');
        }
        else if (a.prey === 5)
            review(a, 'The boar attacks after the failed kill roll; resolve the actual Boar encounter. No Meat was awarded.');
        else
            finish(a, 'The prey escaped; no Meat or Pelts were awarded.');
    }
    else if (step === 'hunt-arrows-success' || step === 'hunt-arrows-failure') {
        if (utility?.kind !== 'Resource' || utility.resource !== 'arrows')
            throw Error('Use the saved current Arrows Resource Die.');
        if (step === 'hunt-arrows-success') {
            const prey = preyTable[a.prey! - 1];
            addProvisions(s, a.characterId, 'Meat', prey.meat);
            addProvisions(s, a.characterId, 'Pelts', prey.pelts);
            finish(a, 'Hunted ' + prey.name + ': ' + prey.meat + ' fresh Meat and ' + prey.pelts + ' Pelts; the shot’s actual arrow consumption is recorded.');
        }
        else if (a.prey === 5)
            review(a, 'The boar attacks after the failed shot; resolve the actual Boar encounter.');
        else
            finish(a, 'The shot missed. Arrow consumption is recorded; no Meat or Pelts were awarded.');
    }
    else if (step === 'forage-mishap' || step === 'hunt-mishap') {
        if (utility?.kind !== 'Procedure')
            throw Error('Use the saved D6 mishap.');
        const n = utility.faces[0];
        if (step === 'hunt-mishap' && n === 6) {
            a.stage = 'sick-prey';
            a.request = newRequest(s, entryId, a, 'sick-prey', 'D6', 0, 'D6');
            a.status = 'Awaiting roll';
            a.summary = 'Roll the actual sick prey. Its Meat will retain a food-safety hold for the printed disease procedure.';
        }
        else if (step === 'hunt-mishap' && n === 4) {
            const ch = s.characters.find(c => c.id === a.characterId)!, sheet = sheetFor(ch), v = Number(sheet['attr-strength']);
            if (!Number.isInteger(v) || v <= 1) {
                review(a, 'Hunting trap: review 1 Strength damage and its Broken procedure, then the actual Move escape.');
                return;
            }
            sheet['attr-strength'] = String(v - 1);
            s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
            a.stage = 'trap-escape';
            a.request = newRequest(s, entryId, a, 'trap-escape', 'Move');
            a.status = 'Awaiting roll';
            a.summary = 'The trap caused 1 Strength damage. Make the printed Move roll to escape.';
        }
        else if (step === 'forage-mishap' && n === 6)
            finish(a, 'A persistent animal follows the forager. Its future trouble remains a GM-described complication; no food, damage or attack was invented.');
        else if (step === 'forage-mishap' && n === 1) {
            addProvisions(s, a.characterId, 'Vegetables', 1, 0, 'Meal procedure pending');
            a.yield = 1;
            finish(a, 'Found one unit of Vegetables with a required food-safety review at consumption.');
        }
        else if (step === 'forage-mishap' && n === 2) {
            const ch = s.characters.find(c => c.id === a.characterId)!, sheet = sheetFor(ch), v = Number(sheet['attr-strength']);
            if (!Number.isInteger(v) || v <= 1) {
                review(a, 'Leeches: review Strength damage and Broken obligations, then Healing removal.');
                return;
            }
            sheet['attr-strength'] = String(v - 1);
            s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
            a.stage = 'leeches';
            a.request = newRequest(s, entryId, a, 'leeches', 'Healing');
            a.status = 'Awaiting roll';
            a.summary = 'Leeches caused 1 Strength damage. A Healing check removes them; failure causes one further point.';
        }
        else
            review(a, (step === 'forage-mishap' ? 'Foraging' : 'Hunting') + ' mishap ' + n + ' needs its specific printed follow-up; no injury, cold, gear loss, trap escape, infection or encounter has been invented.');
    }
    else if (step === 'sick-prey') {
        if (utility?.kind !== 'Procedure')
            throw Error('Use the saved sick-prey D6.');
        const prey = preyTable[utility.faces[0] - 1];
        a.prey = utility.faces[0];
        a.preyOptions = utility.faces.slice(0, 2);
        a.yield = prey.meat;
        const itemId = addProvisions(s, a.characterId, 'Meat', prey.meat, 0, 'Meal procedure pending');
        addProvisions(s, a.characterId, 'Pelts', prey.pelts);
        if (!itemId)
            throw Error('The verified prey did not produce an actual Meat item.');
        repo.db.prepare('INSERT INTO activity_private VALUES (?,?,?)').run(id, itemId, JSON.stringify({ diseaseVirulence: 3, revealed: false }));
        finish(a, 'Brought down ' + prey.name + ': ' + prey.meat + ' Meat and ' + prey.pelts + ' Pelts, with a required meal procedure before eating.');
    }
    else if (step === 'trap-escape') {
        if (success > 0)
            finish(a, 'Escaped the hunting trap. The recorded Strength loss remains; no prey was acquired.');
        else
            review(a, 'The failed Move leaves the hunter trapped. Resolve the actual escape and time consequences; no new damage was invented.');
    }
    else if (step === 'leeches') {
        if (success === 0) {
            const ch = s.characters.find(c => c.id === a.characterId)!, sheet = sheetFor(ch), v = Number(sheet['attr-strength']);
            if (!Number.isInteger(v) || v <= 1) {
                review(a, 'Failed leech removal requires 1 further Strength damage and its Broken review.');
                return;
            }
            sheet['attr-strength'] = String(v - 1);
            s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
        }
        finish(a, 'Leeches removed' + (success ? ' successfully.' : '; failed Healing caused 1 additional Strength damage.'));
    }
    else if (step === 'cook-capacity') {
        if (utility?.kind !== 'Procedure')
            throw Error('Use a saved cooking capacity D6.');
        a.yield = utility.faces[0];
        a.stage = 'cook-allocation';
        a.status = 'Awaiting preparation or resource allocation';
        a.summary = 'Cooking capacity ' + a.yield + ' units this quarter. Choose existing fresh ingredients; no gathering is assumed.';
    }
    else if (step === 'bare-sleep') {
        if (success > 0) {
            a.choice = 'bare-ground-success';
            finish(a, 'A place to Sleep on bare ground was found. Cold exposure still requires its applicable review.');
            a.review = 'Confirm applicable cold procedure before Sleep completion.';
        }
        else {
            a.choice = 'no-sleep';
            finish(a, 'Failed to find a sleeping spot: no Sleep; Sleepy will be applied at completion.');
        }
    }
    else if (step === 'watch') {
        finish(a, success > 0 ? 'The actual threat was noticed at a safe distance; choose the party’s response.' : 'The actual threat is close before being noticed; resolve its encounter without inventing an ambush or damage.');
        a.review = 'Threat ' + a.choice + ' still requires its encounter/detection review.';
    }
    else
        throw Error('Unsupported activity step; the saved result was not reinterpreted.');
}
export function resolveDailyRoll(s: Session, card: PendingDice) {
    const n = s.activityState?.needs.find(n => n.request?.context.requestId === card.activityContext?.requestId);
    if (!n)
        return false;
    const u = card.metadata.utility;
    if (u?.kind !== 'Resource' || u.resource !== n.resource || card.characterId !== n.sourceId)
        throw Error('Use the exact requested source resource die.');
    n.rollId = card.id;
    n.status = 'Satisfied';
    n.explanation = 'Consumed ' + n.resource + ' from ' + card.characterId + '; D' + u.sides + ' rolled ' + u.value + (u.value <= 2 ? ', depleted one step.' : ', no depletion.');
    n.request = null;
    card.status = 'Submitted';
    card.submittedAt = new Date().toISOString();
    const ch = s.characters.find(c => c.id === n.characterId)!, sheet = sheetFor(ch);
    sheet[n.resource === 'food' ? 'cond-hungry' : 'cond-thirsty'] = false;
    s.characters = s.characters.map(c => c.id === ch.id ? applySheet(c, sheet) : c);
    return true;
}
