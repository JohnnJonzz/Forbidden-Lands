import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSession} from '../src/lib/mock';
import {sessionReducer} from '../src/lib/session';
import {createSchema} from '../src/lib/validation';
import {characterSheetSchema} from '../src/lib/character-sheet';
test('campaign creation rejects omission of an explicitly verified village and character selection',()=>{
 assert.equal(createSchema.safeParse({kind:'new',name:'Independent expedition'}).success,false);
});
test('snapshot reset is retired instead of retaining independent campaign workflows',()=>{
 assert.throws(()=>sessionReducer(structuredClone(initialSession),{type:'reset',session:initialSession}),/reset/i);
});
test('portable sheet can preserve independent original and current weapon ratings and talent type',()=>{
 assert.equal(characterSheetSchema.safeParse({weapons:[{name:'Longbow',bonus:'1',gearBonus:'2',current:'1'}],talents:[{type:'G',name:'Bowyer',rank:'1'}]}).success,true);
});
