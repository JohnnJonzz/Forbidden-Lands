# Phase 6.3.1 — Equipment recognition and complete catalog audit

## Confirmed causes

Baseline: commit `7d8e1bd`, clean working tree on `ravenland-ai-gm-prototype`. The baseline retrieval gate passed 325 unit tests and 70 real-PDF tests. Both original fifth-printing books were available (Handbook 212 pages; Guide 268 pages). All work and tests use isolated temporary campaigns; the live campaign and its source permissions were not changed.

The sheet supplied the original inventory name to `SheetEmbed` → `/api/combat/prepare` → `attackPreparation` → `officialWeapon`. The lookup had only three local aliases and did not resolve **Short sword**. `weaponRow` required the requested literal table name, so the request failed before pending-action creation, even though the correct Shortsword row was indexed on physical PDF page 105. This was a deterministic name-resolution defect, not a missing PDF. Direct baseline reproduction failed for Short sword while Shortsword succeeded against the same extracted page.

The broader audit exposed additional extraction defects: wrapped multi-line names such as Two-Handed Sword and Heavy Warhammer, a space after a PDF hyphen, and an em dash instead of a numeric Gear Bonus (Rock, Unarmed). The old feature extractor also retained only four feature names and could lose Light, Heavy and Hook. The new reader matches complete table rows, handles wrapped names/features and dash values, and keeps Heavy Warhammer separate from Warhammer and Large Wooden Club separate from Wooden Club. It independently extracts each field; expected catalog statistics are never substituted for missing evidence.

The earlier preparation screen offered an unbound pool after a failure. The new screen explicitly states that an attack is not prepared, offers Retry, and keeps practice behind an explicit warning. Its sheet-side guard also survives autosave/sheet synchronization, which otherwise could re-enable a previously staged pool. Attaching an early practice roll cannot create a pending action or authorize retroactive choices.

## Official source evidence

The attached table image was not present as a separate accessible file in this turn. I inspected a rendered image of the original Handbook table and its indexed PDF text directly. No licensed image, PDF, extracted page, private database or uploaded file is committed. The following audit records factual equipment fields and short feature labels.

| Source | Physical PDF page | Printed page | Use |
| --- | --- | --- | --- |
| Player’s Handbook, MELEE WEAPONS | 105 | 101 | All 25 melee entries and every table field. |
| Player’s Handbook, RANGED WEAPONS | 107 | 103 | All nine ranged entries. |
| Player’s Handbook, SHIELDS and ARMOR & HELMETS | 110 | 106 | Two shields, four body armors and four helmets. |
| Player’s Handbook, Weapon Attributes | 104, 108 | 100, 104 | Grip, Gear Bonus, damage, range, silver cost and features. |
| Player’s Handbook, SLASH / STAB / PUNCH-KICK-BITE / DODGE / PARRY | 96–97 | 92–93 | Legal ordinary strikes, unarmed Parry +2, existing modifiers and damage. |
| Player’s Handbook, pre-roll defensive timing and Armor | 95, 109 | 91, 105 | Existing declaration-before-roll and actual armor dice resolution. |
| Gamemaster’s Guide, Typical NPCs | 187 | 183 | Existing bandit statistics and legal pre-roll enemy defenses in real integration tests. |

## Melee audit: all 25 entries

Before this repair, only nine melee inventory choices existed. Grip and silver cost were absent from every weapon row; both are now editable fields, populated only when a player selects a preset. Existing inventory names, quantities, notes and manually recorded values are preserved. The table below lists all official values; **— means the source has a dash**, not an invented numeric rating. Unarmed remains outside inventory and contributes zero Gear Dice.

| Official weapon | Present before? | Grip | Gear | Damage | Range | Silver | Complete features | Repair |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unarmed | No | — | — | 1 | Arm | — | Blunt | Add special Punch/Kick control; no inventory item. |
| Knife | No | 1H | +1 | 1 | Arm | 1 | Light, Pointed | Add verified selector entry, all fields and legal strike options. |
| Dagger | Yes | 1H | +1 | 1 | Arm | 2 | Light, Edged, Pointed | Existing combat statistics correct. |
| Falchion | No | 1H | +1 | 2 | Arm | 4 | Edged, Pointed | Add verified selector entry, all fields and legal strike options. |
| Shortsword | Yes (Short sword) | 1H | +2 | 1 | Arm | 6 | Edged, Pointed, Parrying | Resolve legacy Short sword; restore Parrying. |
| Broadsword | Yes | 1H | +2 | 2 | Arm | 10 | Edged, Pointed, Parrying | Restore Parrying. |
| Longsword | Yes | 1H | +2 | 2 | Arm | 18 | Heavy, Edged, Pointed, Parrying | Near → Arm; remove false Two-handed feature; restore Parrying; grip is 1H. |
| Two-Handed Sword | No | 2H | +2 | 3 | Arm | 40 | Heavy, Edged, Pointed, Parrying | Add verified selector entry, all fields and legal strike options. |
| Scimitar | No | 1H | +1 | 2 | Arm | 8 | Edged, Pointed, Hook, Parrying | Add verified selector entry, all fields and legal strike options. |
| Handaxe | Yes | 1H | +2 | 2 | Arm | 2 | Edged, Hook | Existing combat statistics correct. |
| Battleaxe | Yes | 1H | +2 | 2 | Arm | 6 | Heavy, Edged, Hook | Damage 3 → 2; remove false Two-handed feature; grip is 1H. |
| Two-Handed Axe | No | 2H | +2 | 3 | Arm | 24 | Heavy, Edged, Hook | Add verified selector entry, all fields and legal strike options. |
| Mace | Yes | 1H | +2 | 1 | Arm | 4 | Blunt | Existing combat statistics correct. |
| Morningstar | No | 1H | +2 | 2 | Arm | 8 | Blunt | Add verified selector entry, all fields and legal strike options. |
| Warhammer | No | 1H | +2 | 2 | Arm | 12 | Blunt, Hook | Add verified selector entry, all fields and legal strike options. |
| Flail | No | 1H | +1 | 2 | Near | 16 | Blunt | Add verified selector entry, all fields and legal strike options. |
| Wooden Club | No | 1H | +1 | 1 | Arm | 1 | Blunt | Add verified selector entry, all fields and legal strike options. |
| Large Wooden Club | No | 2H | +1 | 2 | Arm | 2 | Heavy, Blunt | Add verified selector entry, all fields and legal strike options. |
| Heavy Warhammer | No | 2H | +2 | 3 | Arm | 22 | Heavy, Blunt, Hook | Add verified selector entry, all fields and legal strike options. |
| Staff | No | 2H | +1 | 1 | Near | 1 | Blunt, Hook, Parrying | Add verified selector entry, all fields and legal strike options. |
| Short Spear | Yes | 1H | +1 | 1 | Near | 2 | Pointed | Canonical capitalization; statistics already correct. |
| Long Spear | Yes | 2H | +2 | 1 | Near | 4 | Pointed | Move two-handed information to Grip; retain Pointed. |
| Pike | No | 2H | +2 | 2 | Near | 12 | Heavy, Pointed | Add verified selector entry, all fields and legal strike options. |
| Halberd | No | 2H | +2 | 2 | Near | 30 | Heavy, Pointed, Edged, Hook | Add verified selector entry, all fields and legal strike options. |
| Trident | No | 2H | +1 | 2 | Near | 6 | Pointed, Hook | Add verified selector entry, all fields and legal strike options. |

All existing rows gained optional Grip/Cost controls; the data is not backfilled into saved inventories. Shortsword and Broadsword now carry their official Parrying feature in the catalog even when an older saved row lacks that note. Source-backed mechanics use the verified canonical features without editing the old row. The former new-character Dagger defaults also omitted Edged; new defaults now come directly from the same catalog, while saved characters remain untouched.

## Ranged, armor, shields and remaining categories

| Ranged weapon | Before | Repair |
| --- | --- | --- |
| Rock | Missing | Add 1H, no Gear Bonus, Damage 1, Near, no listed cost, Light. |
| Throwing Knife | Missing | Add 1H, +1, Damage 1, Near, 1 silver, Light. |
| Throwing Axe | Missing | Add 1H, +1, Damage 2, Near, 2 silver, no listed features. |
| Throwing Spear | Missing | Add 1H, +2, Damage 1, Short, 2 silver, no listed features. |
| Sling | Missing | Add 1H, +1, Damage 1, Short, 1 silver, Light. |
| Short Bow | Present as Short bow | Replace Two-handed feature with Light; record 2H grip and 6 silver. Numeric attack ratings already correct. |
| Longbow | Present | Remove false Heavy/Two-handed features; record 2H grip and 12 silver. Numeric ratings already correct. |
| Light Crossbow | Present | Keep +1 / Damage 2 / Long; record 2H, 24 silver and the original loading note. |
| Heavy Crossbow | Present | Keep +1 / Damage 3 / Long; record 2H, 40 silver, Heavy and the original loading note. |

Armor and shields previously used free text and manual values with no preset catalog. They retain those editable controls and now offer explicit presets from the same catalog:

| Entry | Rating / Gear Bonus | Silver | Body part | Features |
| --- | --- | --- | --- | --- |
| Leather | AR 2 | 4 | Body | Light |
| Studded Leather | AR 3 | 6 | Body | — |
| Chainmail | AR 6 | 24 | Body | Heavy item. Armor Rating 3 against arrows and Stabs. |
| Plate Armor | AR 8 | 80 | Body | Heavy item. Modifies Move by -2 |
| Studded Leather Cap | AR 1 | 3 | Head | Light |
| Open Helmet | AR 2 | 8 | Head | Light |
| Closed Helmet | AR 3 | 18 | Head | — |
| Great Helm | AR 4 | 30 | Head | Modifies Scout by -2 |
| Small Shield | Gear +1 | 6 | Shield | Light |
| Large Shield | Gear +2 | 15 | Shield | — |

Chainmail’s conditional AR and armor/helmet skill modifiers remain recorded feature text; this task does not add a new armor-rule executor. Existing engine behavior is preserved. General Gear, consumable quantities/dice, spells and custom/artifact items remain manually recorded; there was no supported item preset catalog to audit for those categories. An exhaustive trade-goods, artifact or spell catalog is not implemented.

## One catalog and safe aliases

`equipment-catalog.json` is the sole authored catalog. The existing sheet-generation script embeds it into the standalone/embedded sheet and generates typed application data. New-character Dagger defaults, weapon selection, protection presets, controlled name resolution, preparation, saved-roll canonical IDs and combat verification reuse it. Runtime verification still reads the authorized indexed original PDF, and compares every required table field with the audited catalog. A local catalog entry alone never authorizes combat. Scoped combat house rules keep their existing adjudication precedence.

Controlled aliases include Short sword → Shortsword (also the explicitly requested punctuation variant Short sword.), Broad sword, Long sword, Hand axe, Battle axe, Morning star, War hammer, Heavy war hammer, Long bow and unhyphenated Two handed Sword/Axe. Case, repeated whitespace and PDF hyphen typography are normalized. Generic Sword, Axe, Spear, Bow, Crossbow, Club and Hammer remain ambiguous; misspellings, invented weapons and arbitrary suffixes do not fuzzy-match a weapon. Aliases do not create extra selector entries.

New-character defaults are normalized through the existing character schema before the optimistic-save boundary. This keeps optional Grip/Cost field ordering consistent with validated save requests; an integrated cross-window regression caught and verified the first-save conflict this otherwise caused. Existing saved sheets are returned unchanged, and real concurrent edits still trigger the original conflict guard.

The player’s original display name is retained in the sheet, attack and immutable raw weapon snapshot. `catalogId` and `canonicalName` are stored on the existing prepared attack. New server-saved dice add optional `equipmentId`, derived from the saved inventory row or the established Unarmed action; clients cannot supply it. The canonical ID participates in the fingerprint only when present, so existing saved-roll fingerprints remain valid. No existing dice or push consequences are rewritten, rebound, deleted or consumed by lookup/preparation.

The preparation GET verifies the selected row, so an unrelated custom or blank weapon cannot prevent using a supported weapon. Existing ownership, row hash, first-compatible-roll policy, context, pre-roll defenses, source permission checks, push wear and idempotent receipts remain. A changed row invalidates preparation and requires a refreshed verification. Missing/ambiguous source editions use the existing source error; a missing/incomplete or conflicting table uses `combat_equipment_evidence`; unknown/ambiguous equipment uses `combat_equipment`.

Unarmed is an explicit **Punch/Kick** control with no inventory row, no Gear Dice, the verified base damage and +2 Parry interaction. It uses the existing pending attack and generic bound Melee-roll path, not a new combat store. Bite/fangs, Grapple, Hook maneuvers and other special procedures remain adjudication. BLUNT remains a feature of the normal Slash action for weapons.

## Verification

The baseline required gate passed **325 unit tests and 70 actual-PDF tests** before changes. After the repair, the required gate passed **329 unit tests and 96 actual-PDF integration tests**, with no failures or skips. Both original books were uploaded/extracted/indexed in isolated test storage. The added 26 real-sourcebook cases audit all 44 equipment rows and prepare, save and resolve each of the 25 melee options with original source evidence, correct Gear Dice, canonical identity and replay protection.

The new `test:equipment-catalog` browser test passed against both original PDFs. It exercises every one of the 33 inventory weapon selector entries, all table fields and actual saved sheet pools, all armor/helmet/shield presets, Edrus's unchanged **Short sword** row through Acting As chat, defense/armor/Strength damage, all listed feature classes, Unarmed without inventory, missing source evidence, unknown weapons, changed rows, blocked rolling, explicit practice, successful retry and rejection of an early unbound roll. A pushed result preserves its existing consequences exactly once. Screenshots of the preparation and equipment areas were inspected.

All **16 application browser suites** passed. The seven existing actual-PDF browser regressions passed: `dice-chat`, `roll-timing`, `pending-encounter`, `encounter-fidelity`, `combat-narrative`, `combat-workflow` and `combat`. Together with the catalog suite, these are eight real-sourcebook browser suites. All eight separate production regressions passed: `dice-repair`, `roll-gm`, `submitted-attacks`, `action-safeguards`, `gm-situation`, `character-awareness`, `character-preparation` and `windows`.

The standalone `tests/smoke.cjs` passed through a temporary local HTTP server, including persistence, presets/custom values, JSON import/export, push consequences, encumbrance, mobile and print. Its stale assertions were updated to the already-existing shared sheet/roller area and disabled pushes for fully locked dice/armor. The successful-push fixture now includes an eligible die and accepts the existing approval dialog; no production dice logic was changed to satisfy these tests.

TypeScript checking and the production build passed. No paid API calls were made; test providers and RNG are controlled. No live campaign or source permissions were modified.

```bash
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:retrieval-check
RAVENLAND_REAL_SOURCEBOOK_DIR=/tmp/ravenland-private-sourcebooks npm run test:equipment-catalog
npm run build
npm run typecheck
```

Each named browser regression was run with its existing `npm run test:<name>` script. Actual-PDF suites used the private-sourcebook directory above. A temporary HTTP server supplied `BASE_URL` for the standalone smoke test.

## Files changed

| Area | Changed files |
| --- | --- |
| Single authored catalog / generated sheet | Root `equipment-catalog.json`, `index.html`; `ravenland/scripts/generate-sheet.mjs`, `scripts/sheet-bridge.js`; generated `src/lib/equipment-catalog-data.ts`, `sheet-fields.ts`, `sheet-version.ts` |
| Character/default catalog access | `src/lib/equipment-catalog.ts`, `character-sheet.ts`; `src/server/action-preparation.ts` |
| Source parsing / verification | `src/server/sourcebooks/equipment-rows.ts`; `src/server/combat/catalog.ts`, `sources.ts` |
| Preparation and existing engine | `src/lib/combat/attack-rules.ts`, `types.ts`; `src/server/combat/attack-rules.ts`, `prepare-attack.ts`, `service.ts`, `engine.ts`, `attachment.ts`; `src/app/api/combat/prepare/route.ts` |
| Existing sheet interface | `src/components/sheet-attack-preparation.tsx`, `sheet-embed.tsx` |
| Saved canonical dice identity | `src/lib/dice/schema.ts`, `gm-submission.ts`; `src/server/dice/service.ts`, `gm-submission.ts` |
| Tests | `tests/equipment-catalog.test.ts`, `equipment-catalog-browser.cjs`, `combat-real.ts`, `roll-timing-browser.cjs`; root `tests/smoke.cjs`; `ravenland/package.json` |
| Documentation | `ravenland/README.md`, this report |

Paths are under `ravenland/` unless identified as root files. Generated files are derived from the shared root catalog and sheet, not independently authored catalogs.

## Preview and limits

Run `npm run dev` in `ravenland/`, open Edrus through The Party, and click the existing Short sword attack icon. Select Slash or Stab and the active target, then Prepare and stage attack. Roll, optionally push, Attach roll to chat, describe the action and Send. The Combat panel updates from the same saved pending action; enemy defense, armor and damage use the existing engine. No manual inventory rename or separate Submit to GM step is required.

New ranged declarations continue to require the existing Ready/Load adjudication when those facts are not recorded; existing established shots still accept attachments. This audit supplies complete ranged table data without adding readiness, ammunition consumption, grip/injury enforcement or special maneuver systems. Player sheets remain authoritative; the existing push system applies its own recorded consequences once.

No database migration, reset, automatic equipping, credentials, dependency installation or paid model call is required. Browser tests use controlled providers/RNG, so they establish verified engine integration rather than production-model prose quality.
