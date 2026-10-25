# Forbidden Lands character sheet

Open `index.html` in a modern browser, or run `python3 -m http.server 8000` from this directory and open the server in your browser. No build or dependencies are required.

- Set regular attributes with the large number and up/down arrows. Click skull markers to mark damage or heal; the current value appears underneath. Regular and current (damaged) attributes are saved separately; skill and weapon rolls use the current value, and pushed banes reduce only that value. Older sheets migrate their single value into both fields.
- Roll Food, Water, Arrows, or Torches when used. Rolls of 1–2 reduce D12 → D10 → D8 → D6 → None; other rolls keep the die. Resource rolls cannot be pushed.
- Gear encumbrance updates automatically from quantities and weight categories: Tiny 0, Light ½, Normal 1, Heavy 2. Capacity is regular Strength × 2 plus the editable extra-capacity bonus. Named gear rows count; include carried weapons, armor, coins, and supplies in the gear list with their appropriate weights. Blank rows do not count.
- Edit attributes, all 16 skills, conditions, resources, relationships, talents, weapons, and gear.
- Keep multiple characters in the roster; changes save automatically in browser storage.
- Choose common weapon presets to fill name, bonus, damage, range, features, and attack skill; every field stays editable and custom values persist in backups.
- Keep dice results in a sticky right pane on desktop; on smaller screens the roller stacks above the sheet.
- Stage skills and weapon attacks before rolling. Edit base, skill, and gear dice, then enter a positive bonus or negative penalty (applied to skill dice). Click Roll staged dice, then push once if needed. Negative skill dice cancel successes on sixes; skill dice never cause damage. Staging a new action resets the modifier; changing characters clears the staged pool. Resource rolls still roll directly without modifiers or pushing. Relationships, Appearance, and Critical Injuries are beneath Gear. Base banes cause attribute damage and grant Willpower; gear damage is reported for manual adjustment. Use the staged modifier for situational bonuses and penalties; resolve armor and artifact dice manually.
- Export and import character JSON to back up your sheet or move between devices. Data stays in your browser; there is no account or cloud synchronization.
- Print a sheet using the Print button. The layout also adapts to phones.

The original `character sheet` and `character 2` files are preserved as earlier versions. `index.html` is the maintained entry point. This is an unofficial aid; consult the Forbidden Lands rules for character creation and rules adjudication.

## Browser checks

With the local server running on port 8000, run `node tests/smoke.cjs`. The check requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is installed elsewhere. It uses temporary browser storage and covers editing, persistence, roster switching, dice, pushed banes, JSON backup round trips, and mobile layout.

Set `BASE_URL` when running browser checks against a server on a port other than 8000.
