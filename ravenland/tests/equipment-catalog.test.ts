import assert from 'node:assert/strict';
import test from 'node:test';
import {equipmentCatalog,catalogWeapon,catalogArmor,catalogShield,weaponPreset} from '../src/lib/equipment-catalog';
import {equipmentRows} from '../src/server/sourcebooks/equipment-rows';
import type {SourcePassage} from '../src/lib/sourcebooks/schema';
import {sheetFor} from '../src/lib/character-sheet';
import {initialSession} from '../src/lib/mock';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {saveCharacter} from '../src/server/character-service';
test('one catalog has 25 melee options, nine ranged weapons, eight armor pieces and two shields with unique controlled aliases',()=>{
 assert.equal(equipmentCatalog.weapons.filter(w=>w.category==='melee').length,25);assert.equal(equipmentCatalog.weapons.filter(w=>!w.special&&w.category==='melee').length,24);assert.equal(equipmentCatalog.weapons.filter(w=>w.category==='ranged').length,9);assert.equal(equipmentCatalog.armor.length,8);assert.equal(equipmentCatalog.shields.length,2);
 for(const w of equipmentCatalog.weapons)for(const alias of [w.name,w.id,...w.aliases])assert.equal(catalogWeapon(alias)?.id,w.id);
 assert.equal(catalogWeapon('Short sword')?.id,'shortsword');assert.equal(catalogWeapon('Short sword.')?.id,'shortsword');assert.equal(catalogWeapon('Two- Handed Sword')?.id,'two-handed-sword');
 for(const name of ['Sword','Axe','Crossbow','Club','Shortsword +1','Shrot sword','Greatsword','invented'])assert.equal(catalogWeapon(name),null);
 assert.equal(catalogArmor('chainmail')?.id,'chainmail');assert.equal(catalogShield('small shield')?.id,'small-shield');
});
test('new character defaults use the catalog without rewriting saved inventories',()=>{
 const ch=structuredClone(initialSession.characters[0]);delete ch.sheet;const expected=weaponPreset(catalogWeapon('Dagger')!);assert.equal(sheetFor(ch).weapons![0].feat,expected.feat);assert.equal(sheetFor(ch).weapons![0].grip,expected.grip);
 ch.sheet={weapons:[{name:'Short sword',bonus:'2',dmg:'1',feat:'My existing notes'}],gear:[{item:'arrows',quantity:'7'}]};const before=JSON.stringify(ch);assert.strictEqual(sheetFor(ch),ch.sheet);assert.equal(JSON.stringify(ch),before);
});
test('table parser reads actual row fields rather than catalog defaults and separates overlapping/wrapped names',()=>{
 const page={text:'MELEE WEAPONS\nWEAPON GRIP BONUS DAMAGE RANGE COST FEATURES\nWarhammer 1H +7 9 Arm 12 Blunt, Hook\nHeavy\nWarhammer\n2H +4 5 Arm 22 Heavy, Blunt, Hook\nStaff 2H +3 4 Near 1 Blunt, Hook, Parrying\nJohn Hadley',startPage:105} as SourcePassage;
 const rows=equipmentRows(page,'melee');assert.equal(rows.length,3);assert.equal(rows[0].name,'Warhammer');assert.equal(rows[0].bonus,7);assert.equal(rows[0].damage,9);assert.equal(rows[1].name,'Heavy Warhammer');assert.equal(rows[1].grip,'2H');assert.equal(rows[1].features,'Heavy, Blunt, Hook');assert.equal(rows[2].features,'Blunt, Hook, Parrying');assert.deepEqual(equipmentRows({...page,text:page.text.replace('COST FEATURES','INCOMPLETE')},'melee'),[]);
});
test('first save of a default character accepts catalog fields and preserves real concurrent-change detection',()=>{
 const repo=new SqliteCampaignRepository(':memory:');try{const r=repo.create(structuredClone(initialSession)),ch=r.session.characters[0],before=sheetFor(ch),sheet=structuredClone(before);sheet.name='Ilva Window';sheet.weapons![0].equipped=false;
 const saved=saveCharacter({campaignId:r.id,characterId:ch.id,before,sheet},repo);assert.equal(saved.session.characters[0].name,'Ilva Window');assert.equal(saved.session.characters[0].sheet!.weapons![0].cost,'2');
 assert.throws(()=>saveCharacter({campaignId:r.id,characterId:ch.id,before,sheet:{...before,name:'Conflicting name'}},repo),/changed in another window/);
 }finally{repo.close()}
});
