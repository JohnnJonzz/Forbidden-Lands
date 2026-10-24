# Forbidden Lands character sheet

Open `index.html` in a modern browser, or run `python3 -m http.server 8000` from this directory and open the server in your browser. No build or dependencies are required.

- Track regular and current (damaged) attributes separately; skill and weapon rolls use the current value, and pushed banes reduce only that value. Older sheets migrate their single value into both fields.
- Roll Food, Water, Arrows, or Torches when used. Rolls of 1–2 reduce D12 → D10 → D8 → D6 → None; other rolls keep the die. Resource rolls cannot be pushed.
- Edit attributes, all 16 skills, conditions, resources, relationships, talents, weapons, and gear.
- Keep multiple characters in the roster; changes save automatically in browser storage.
- Choose common weapon presets to fill name, bonus, damage, range, features, and attack skill; every field stays editable and custom values persist in backups.
- Keep dice results in a sticky right pane on desktop; on smaller screens the roller stacks above the sheet.
- Roll skills and weapon attacks, then push once. Base banes cause attribute damage and grant Willpower; gear damage is reported for manual adjustment. Apply situational modifiers, armor, and artifact dice manually.
- Export and import character JSON to back up your sheet or move between devices. Data stays in your browser; there is no account or cloud synchronization.
- Print a sheet using the Print button. The layout also adapts to phones.

The original `character sheet` and `character 2` files are preserved as earlier versions. `index.html` is the maintained entry point. This is an unofficial aid; consult the Forbidden Lands rules for character creation and rules adjudication.

## Browser checks

With the local server running on port 8000, run `node tests/smoke.cjs`. The check requires Playwright and Chromium (provided in the Codex environment); set `CHROMIUM_PATH` if Chromium is installed elsewhere. It uses temporary browser storage and covers editing, persistence, roster switching, dice, pushed banes, JSON backup round trips, and mobile layout.
