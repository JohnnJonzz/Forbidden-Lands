import type { Assignment } from "../../lib/gameplay";
export function interpretStationaryPlan(
  text: string,
  party: { id: string; name: string }[],
  previous: Assignment[] = [],
) {
  if (
    /\?\s*$|^(?:can|could|would|should|how|why|what|if|yesterday|last night)\b/i.test(
      text.trim(),
    )
  )
    return {
      assignments: previous,
      recognized: false,
      question:
        "Declare the party’s current stationary activities, or open the optional planner. Questions and past events do not create activities.",
    };
  if (
    /\b(?:travel(?:s|ing)?|journey|hike|lead the way|march|ride|move to|advance|complete|finish|skip|attack(?:s|ing)?)\b/i.test(
      text,
    )
  )
    return {
      assignments: previous,
      recognized: false,
      question:
        "7.0A supports stationary planning only. Travel, resolution, exceptional actions and completion are not enabled; no state or time has changed.",
    };
  const mentioned = new Set<string>(),
    found = new Map(previous.map((a) => [a.characterId, a])),
    matches: { start: number; end: number; id: string }[] = [];
  for (const c of party) {
    const first = c.name.split(" ")[0],
      aliases = [
        c.name,
        ...(party.filter(
          (p) => p.name.split(" ")[0].toLowerCase() === first.toLowerCase(),
        ).length === 1
          ? [first]
          : []),
      ];
    for (const alias of [...new Set(aliases)]) {
      const safe = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        regex = new RegExp("\\b" + safe + "\\b", "gi");
      for (const m of text.matchAll(regex)) {
        const start = m.index!,
          end = start + m[0].length;
        if (
          !matches.some(
            (old) => old.id === c.id && start >= old.start && end <= old.end,
          )
        )
          matches.push({ start, end, id: c.id });
      }
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const choices: [RegExp, Assignment["activity"]][] = [
    [
      /\b(?:make|makes|making|establish|establishes|prepare|prepares|set up)\b[^,;.!]{0,35}\bcamp(?:site)?\b/i,
      "Make Camp",
    ],
    [/\bforag(?:e|es|ing)\b/i, "Forage"],
    [
      /\b(?:keep(?:s)? watch|watch(?:es)?(?: the forest| the camp| for threats)?)\b/i,
      "Keep Watch",
    ],
    [/\bsleep(?:s|ing)?\b/i, "Sleep"],
    [/\brest(?:s|ing)?\b/i, "Rest"],
    [/\bhunt(?:s|ing)?\b/i, "Hunt"],
    [/\bcook(?:s|ing)?\b/i, "Cook"],
  ];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (mentioned.has(m.id))
      return {
        assignments: [...found.values()],
        recognized: true,
        question:
          "Assign " +
          party.find((c) => c.id === m.id)!.name +
          " exactly once; use the planner to resolve repeated mentions.",
      };
    mentioned.add(m.id);
    const clause = text.slice(m.end, matches[i + 1]?.start ?? text.length);
    if (/\b(?:not|neither|maybe|or)\b/i.test(clause))
      return {
        assignments: [...found.values()],
        recognized: true,
        question:
          "One activity is ambiguous. Choose an explicit activity for " +
          party.find((c) => c.id === m.id)!.name +
          " in your reply or the planner; Rest and Sleep remain distinct.",
      };
    const activities = choices
      .filter(([regex]) => regex.test(clause))
      .map(([, a]) => a);
    if (activities.length !== 1) {
      return {
        assignments: [...found.values()],
        recognized: true,
        question:
          "What will " +
          party.find((c) => c.id === m.id)!.name +
          " do? Choose one stationary activity; no action was inferred.",
      };
    }
    found.set(m.id, {
      characterId: m.id,
      activity: activities[0],
      description: "",
    });
  }
  const missing = party.filter((c) => !found.has(c.id));
  return {
    assignments: party.flatMap((c) =>
      found.has(c.id) ? [found.get(c.id)!] : [],
    ),
    recognized: matches.length > 0,
    question: missing.length
      ? "What will " +
        missing.map((c) => c.name).join(", ") +
        " do? Assign each character once."
      : null,
  };
}
