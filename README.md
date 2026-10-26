# Forbidden Lands — The Ravenland Chronicles

The new Next.js + TypeScript application lives in [`ravenland/`](ravenland/README.md). It provides a mock AI-GM conversation, four local player identities, campaign status, map, dice, character profiles, journal, and settings in a responsive dark-fantasy interface.

```sh
cd ravenland
npm ci
npm run dev
```

Open http://localhost:3000 locally. See the app README for production commands, tests, architecture, and Phase 1 limitations. No authentication, paid API, database, or multiplayer synchronization is enabled. Session changes reset on refresh.

The standalone character sheet below remains available independently.

---

# Forbidden Lands character sheet

Open `index.html` in a modern browser, or run `python3 -m http.server 8000` from this directory and open the server in your browser. No build or dependencies are required.

- Set regular attributes with the large number and up/down arrows. Click skull markers to mark damage or heal; the current value appears underneath. Regular and current (damaged) attributes are saved separately; skill and weapon rolls use the current value, and pushed banes reduce only that value. Older sheets migrate their single value into both fields.
- Roll Food, Water, Arrows, or Torches when used. Rolls of 1–2 reduce D12 → D10 → D8 → D6 → None; other rolls keep the die. Resource rolls cannot be pushed.
- Gear encumbrance updates automatically from quantities and weight categories: Tiny 0, Light ½, Normal 1, Heavy 2. Capacity is regular Strength × 2 plus the editable extra-capacity bonus. Named gear rows count; include carried weapons, coins, and supplies in the gear list with their appropriate weights. Named armor, helmets, and shields with Carried = Yes contribute their selected weights automatically, regardless of Don; do not duplicate those items in Gear. Blank rows do not count.
- Edit attributes, all 16 skills, conditions, resources, relationships, talents, weapons, and gear.
- Keep multiple characters in the roster; changes save automatically in browser storage.
- Attack results show total damage before armor or defense: weapon damage plus one per success beyond the first; misses deal zero. This assumes all extra successes are spent on damage. Damage updates after pushing. Armor/Helmet has separate rows below Weapons for type, current/max rating, modifier, total, artifact die, Don, features, carried status, and weight. Only donned, carried pieces contribute to the combined rating. The shield button stages armor and artifact dice; armor rolls cannot be pushed. Apply armor wear manually. Older armor name/rating/notes migrate into the armor row, with maximum initialized from the saved rating.
- A compact Shield section sits to the left of Armor/Helmet on desktop, with current Strength/Melee totals, bonus/max, modifier, artifact, Don, carried status, features, and weight. Shove and Parry buttons stage shield dice; unequipped shields cannot stage rolls. Carried shields are included automatically in encumbrance.
- The full-width Spells section starts at the left edge at the bottom. Add/remove entries with casting mode, WP, name, talent/spell ranks, type, ingredient/grimoire use, range, duration, ingredients, and description. Entries persist in browser storage and JSON backups. Casting, WP spending, and mishaps are resolved manually.
- Gear, Weapons, and Armor stack beneath Talents at the same width on desktop, with space left open to the left. On small screens they use the full sheet width. Each weapon can carry a None/D8/D10/D12 artifact selection, which is included automatically when staging its attack and retained in backups.
- Use the single weapon-name dropdown to choose a preset or select Custom weapon / rename for a custom name. The sword button stages Melee attacks; Marksmanship uses an arrow icon.
- Choose common weapon presets to fill name, bonus, damage, range, features, and attack skill; every field stays editable and custom values persist in backups.
- Keep dice results in a sticky right pane on desktop; on smaller screens the roller stacks above the sheet.
- The right sidebar separates a visual Dice Pool from Results below it. Click Base, Skill (including negative values), and Gear counts, or stage a skill or weapon. Selected counts are highlighted. Toggle artifact slots (D8, D8, D10, D12), use Clear Dice Pool to reset, or roll D66 as a tens/ones result. Artifact dice score 1/2/3/4 successes on 6–7/8–9/10–11/12 and keep successful results when pushed.
- Stage skills and weapon attacks before rolling. Edit base, skill, and gear dice, then enter a positive bonus or negative penalty (applied to skill dice). Click Roll staged dice, then push once if needed. Negative skill dice cancel successes on sixes; skill dice never cause damage. Staging a new action resets the modifier; changing characters clears the staged pool. Resource rolls still roll directly without modifiers or pushing. Relationships, Appearance, and Critical Injuries remain in Personal Details. The encumbrance summary, weight guide, and extra-capacity field appear below the gear list. Base banes cause attribute damage and grant Willpower; gear damage is reported for manual adjustment. Use the staged modifier for situational bonuses and penalties; resolve armor manually.
- Export and import character JSON to back up your sheet or move between devices. Data stays in your browser; there is no account or cloud synchronization.
- Print a sheet using the Print button. The layout also adapts to phones.

The original `character sheet` and `character 2` files are preserved as earlier versions. `index.html` is the maintained entry point. This is an unofficial aid; consult the Forbidden Lands rules for character creation and rules adjudication.

## Browser checks

With the local server running on port 8000, run `node tests/smoke.cjs`. The check requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is installed elsewhere. It uses temporary browser storage and covers editing, persistence, roster switching, dice, pushed banes, JSON backup round trips, and mobile layout.

Set `BASE_URL` when running browser checks against a server on a port other than 8000.
