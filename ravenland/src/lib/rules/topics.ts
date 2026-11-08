// Retrieval vocabulary and procedure associations only, never executable game rules.
export const mechanicalTopics={
 dice:{label:'Core Dice Mechanics',pattern:/\b(?:dice|pushing|push a roll|successes|banes|dice pool)\b/i,terms:'dice pushing successes'},
 actions:{label:'Combat Actions',pattern:/\b(?:fast action|slow action|action economy|action availability|combat actions?)\b/i,terms:'fast slow action economy'},
 initiative:{label:'Initiative',pattern:/\b(?:initiative|combat rounds?|turn order)\b/i,terms:'initiative round'},
 melee:{label:'Melee Attacks',pattern:/\b(?:melee|close combat|sword attack|hand.to.hand)\b/i,terms:'melee attack'},
 ranged:{label:'Ranged Attacks',pattern:/\b(?:ranged|marksmanship|shoot|shooting|bow attack)\b/i,terms:'ranged marksmanship'},
 defense:{label:'Dodge and Parry',pattern:/\b(?:dodge|dodging|parry|parrying|defen[sc]e|defensive reactions?|opposed attack)\b/i,terms:'dodge parry defense'},
 damage:{label:'Damage',pattern:/\b(?:damage|weapon damage|attack successes|defending successes)\b/i,terms:'damage successes'},
 armor:{label:'Armor',pattern:/\b(?:armou?r|helmet|protection roll)\b/i,terms:'armor protection'},
 injuries:{label:'Broken and Critical Injuries',pattern:/\b(?:broken|critical injur\w*|unconscious)\b/i,terms:'broken critical injuries'},
 recovery:{label:'Healing and Recovery',pattern:/\b(?:healing|recovery|recovering|heal|resting)\b/i,terms:'healing recovery'},
 journey:{label:'Journeys',pattern:/\b(?:journey\w*|hiking|hike|travell?ing|travell?|hex movement)\b/i,terms:'journey hike travel'},
 quarter:{label:'Quarter-Day Activities',pattern:/\b(?:quarter.day|activities|activity assignments)\b/i,terms:'quarter day activities'},
 navigation:{label:'Navigation and Watch',pattern:/\b(?:lead(?:ing)? the way|keep(?:ing)? watch|navigation|pathfinding|scouting)\b/i,terms:'lead way keep watch navigation'},
 camp:{label:'Camp and Survival',pattern:/\b(?:mak(?:e|ing) camp|camping|survival|sleeping|shelter)\b/i,terms:'make camp survival'},
 forage:{label:'Foraging',pattern:/\b(?:forag\w*|gather(?:ing)? food)\b/i,terms:'foraging forage food'},
 hunt:{label:'Hunting',pattern:/\b(?:hunt\w*)\b/i,terms:'hunting'},
 fish:{label:'Fishing',pattern:/\b(?:fish\w*)\b/i,terms:'fishing'},
 conditions:{label:'Conditions',pattern:/\b(?:conditions?|hungry|thirsty|sleepy|cold)\b/i,terms:'conditions hungry thirsty sleepy cold'},
 mishaps:{label:'Mishaps',pattern:/\b(?:mishaps?|getting lost|travel hazard)\b/i,terms:'mishap hazard'},
 magic:{label:'Magic',pattern:/\b(?:magic|spells?|spellcasting|sorcery|power level|willpower)\b/i,terms:'spellcasting willpower power level magic mishap'},
 talents:{label:'Talents',pattern:/\b(?:talents?|path of the|exceptions)\b/i,terms:'talent exception'},
 equipment:{label:'Equipment and Crafting',pattern:/\b(?:equipment|craft\w*|repair\w*|encumbrance|weapon bonuses|gear bonus)\b/i,terms:'equipment crafting repair gear'},
} as const;
export type MechanicalTopic=keyof typeof mechanicalTopics;
export const relatedProcedures:Partial<Record<MechanicalTopic,MechanicalTopic[]>>={melee:['actions','defense','damage','armor'],ranged:['actions','defense','damage','armor'],journey:['quarter','navigation','camp','mishaps'],quarter:['journey','navigation','camp','mishaps'],magic:['dice','mishaps'],injuries:['recovery'],damage:['armor','injuries'],defense:['melee','damage'],forage:['camp'],hunt:['camp'],fish:['camp'],conditions:['recovery']};
export function detectTopics(text:string):MechanicalTopic[]{const found=(Object.keys(mechanicalTopics) as MechanicalTopic[]).filter(k=>mechanicalTopics[k].pattern.test(text));if(!found.some(k=>['melee','ranged','actions'].includes(k))&&/\bcombat\b/i.test(text))found.push('actions');return found}
export function procedureTopics(text:string){const direct=detectTopics(text);const related=[...new Set(direct.flatMap(k=>relatedProcedures[k]??[]))].filter(k=>!direct.includes(k));return {direct,related,all:[...direct,...related].slice(0,14)}}
export function indexedTopics(path:string[],text:string,title:string,topic:string){const leaf=detectTopics(path.at(-1)??'');if(leaf.length)return leaf;const heading=detectTopics(path.join(' '));if(heading.length)return heading;const content=detectTopics(text);return content.length?content:detectTopics(title+' '+topic)}

// Focus clauses name comparison subjects; "including ..." lists supporting details.
export function requestedSubjects(text:string):MechanicalTopic[]{const focus=text.split(/\b(?:including|covering|along with|with their)\b/i)[0],specific=detectTopics(focus),all=detectTopics(text);let subjects=specific.length?specific:all;const incidental=new Set<MechanicalTopic>(['dice','mishaps']);if(subjects.some(t=>!incidental.has(t)))subjects=subjects.filter(t=>!incidental.has(t));return [...new Set(subjects)].slice(0,10)}
