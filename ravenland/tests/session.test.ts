import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSession, mockGameMaster } from '../src/lib/mock';
import { sessionReducer, rollPool } from '../src/lib/session';
test('messages append without mutating the campaign',()=>{const next=sessionReducer(initialSession,{type:'message',message:{id:'new',role:'player',author:'Ilva',text:'Inspect the wagon'}});assert.equal(next.messages.length,4);assert.equal(initialSession.messages.length,3);assert.equal(next.campaign,initialSession.campaign)});
test('journal and settings update independently',()=>{const next=sessionReducer(initialSession,{type:'journal',entry:{id:'n',title:'Found',text:'A box'}});assert.equal(next.journal.length,3);const updated=sessionReducer(next,{type:'campaign',patch:{quarter:'Night'}});assert.equal(updated.campaign.quarter,'Night');assert.equal(initialSession.campaign.quarter,'Evening');assert.equal(updated.journal,next.journal)});
test('negative skill sixes cancel successes and pools are bounded',()=>{assert.equal(rollPool(2,-1,0,()=>.999).successes,1);assert.equal(rollPool(0,-3,0,()=>.999).successes,0);assert.equal(rollPool(100,0,0,()=>0).dice.length,30);assert.equal(rollPool(0,0,0).dice.length,0)});
test('mock GM responds to different actions without an API',()=>{assert.match(mockGameMaster.respond('Open the wagon','Ilva'),/wooden box/);assert.match(mockGameMaster.respond('Follow the tracks','Brom'),/stone arch/);assert.notEqual(mockGameMaster.respond('Wait','Ilva'),mockGameMaster.respond('Wait','Brom'))});
