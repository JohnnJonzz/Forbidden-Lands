export type NarrativeIntent = {
    kind: 'travel';
    hexes: string[];
    direction: string | null;
    mounted: boolean;
    lead: string | null;
    watch: string | null;
} | {
    kind: 'continue' | 'complete' | 'keep';
} | {
    kind: 'ruling';
    scope: 'journey' | 'scene' | 'house_rule' | 'fact';
    text: string;
    allowance: number | null;
} | {
    kind: 'routine';
    text: string;
} | {
    kind: 'correction';
    text: string;
} | {
    kind: 'spoof';
};
const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export function narrativeIntent(text: string, names: string[]): NarrativeIntent | null {
    if (/^(?:please\s+)?(?:explain|describe|list|summarize|quote|walk through|tell me about)\b/i.test(text.trim()))
        return null;
    if (/\?\s*$/.test(text) || /^(?:what|who|where|when|why|which|how|can|could|would|does|is|if|suppose)\b/i.test(text.trim()))
        return null;
    if (/\b(?:I think|maybe|perhaps|I heard|rumou?r|I believe|claims that)\b/i.test(text) && !/\b(?:as (?:the )?Table GM|house rule)\b/i.test(text))
        return null;
    if (/\b(?:I am|I'm) (?:the GM now|Player 1)\b/i.test(text) && /ignore|override|GM/i.test(text))
        return { kind: 'spoof' };
    if (/\b(?:never entered|still on the|haven.t entered)\b/i.test(text))
        return { kind: 'correction', text };
    if (/\b(?:for this (?:one )?journey|table GM|house rule|permanent campaign fact|is an? old dwarven|was built by dwarves|treating this .*no roll)\b/i.test(text)) {
        const n = text.match(/\b(one|two|three|four|five|\d+)\s+(?:forest )?hex(?:es|agons)?\b/i)?.[1].toLowerCase();
        return { kind: 'ruling', scope: /house rule|from now on|every journey|always/i.test(text) ? 'house_rule' : /journey|hexes/i.test(text) ? 'journey' : /scene|wall|climb|no roll/i.test(text) ? 'scene' : 'fact', text, allowance: n ? (numbers[n] ?? Number(n)) : null };
    }
    if (/\b(?:keep (?:[\w’'-]+\s+){0,3}(?:roll|result)|accept (?:the |that )?(?:failure|result)|don.t push)\b/i.test(text))
        return { kind: 'keep' };
    if (/\b(?:finish|complete|end|close|stop) (?:the |this |our )?(?:journey|quarter|travel)|advance (?:to )?(?:the )?next quarter/i.test(text))
        return { kind: 'complete' };
    const hexes = [...text.matchAll(/\b([A-Z]{1,2}\d{2})\b/gi)].map(m => m[1].toUpperCase());
    if (/\b(?:travel|continue|head|hike|leave|follow|walk|ride|go|resume)\b/i.test(text) && !/\b(?:remember|yesterday|last session|used to)\b/i.test(text)) {
        if (!hexes.length && !/north|south|east|west|forest hex/i.test(text))
            return /continue|resume/i.test(text) ? { kind: 'continue' } : null;
        return { kind: 'travel', hexes, direction: text.match(/\b(north(?:east|west)?|south(?:east|west)?|east|west)\b/i)?.[1].toLowerCase() ?? null, mounted: /\b(?:mounted|horseback|ride)\b/i.test(text), lead: declaredRole(text, names, '(?:leads? (?:the way)?|is (?:our )?(?:pathfinder|leader))'), watch: declaredRole(text, names, '(?:keeps? watch|is (?:our )?(?:lookout|watcher))') };
    }
    if (/\b(?:five|[4-9]) (?:forest )?hexes\b/i.test(text))
        return { kind: 'travel', hexes: [], direction: null, mounted: false, lead: null, watch: null };
    return null;
}
export const declaredRole = (text: string, names: string[], pattern: string) => names.find(name => [name, ...(names.filter(n => n.split(' ')[0] === name.split(' ')[0]).length === 1 ? [name.split(' ')[0]] : [])].some(alias => new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + pattern, 'i').test(text))) ?? null;
