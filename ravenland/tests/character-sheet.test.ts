import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSession} from '../src/lib/mock';
import {sessionReducer} from '../src/lib/session';
import {sheetFor,characterSheetSchema} from '../src/lib/character-sheet';
import {sessionSchema,backupSchema} from '../src/lib/validation';
import {SqliteCampaignRepository} from '../src/server/sqlite';
test('sheet updates target a stable character ID, sync cards, and persist through snapshots',()=>{
 const character=initialSession.characters[0];const sheet=characterSheetSchema.parse({...sheetFor(character),name:'Ilva the Scout','attr-strength':'1','attr-strength-regular':'4',gear:[{item:'Rope',quantity:'2',weight:'Light',notes:'Climbing'}],spells:[{name:'Light',wp:'1',ingredient:true}]});
 const next=sessionReducer(initialSession,{type:'sheet',characterId:character.id,sheet});assert.equal(next.characters[0].name,'Ilva the Scout');assert.equal(next.characters[0].strength,4);assert.equal(next.characters[0].sheet?.['attr-strength'],'1');assert.deepEqual(next.characters[1],initialSession.characters[1]);
 const repository=new SqliteCampaignRepository(':memory:');try{const record=repository.create(next);assert.deepEqual(repository.get(record.id)?.session.characters,next.characters);assert.deepEqual(backupSchema.parse({format:'ravenland-campaign',version:1,session:next}).session.characters,next.characters)}finally{repository.close()}
});
test('old campaigns seed sheets from their attributes; unknown credentials and malformed rows are rejected',()=>{const session=sessionSchema.parse(initialSession);assert.equal(sheetFor(session.characters[0])['attr-agility'],'4');assert.throws(()=>characterSheetSchema.parse({apiKey:'no'}));assert.throws(()=>characterSheetSchema.parse({weapons:[{name:{bad:true}}]}));assert.throws(()=>characterSheetSchema.parse({'armor-worn':'yes'}))});
