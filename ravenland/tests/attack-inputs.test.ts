import test from 'node:test';
import assert from 'node:assert/strict';
import {attackInputs} from '../src/lib/rules/attack-inputs';
import {weaponRequest} from '../src/lib/rules/weapon-request';
import {planRetrieval} from '../src/lib/rules/planner';
import {playerInputCases,playerInputReproduction} from './fixtures/attack-input-cases';
test('reported successes stay distinct from thresholds and allocated extra successes',()=>{
 for(const c of playerInputCases){const inputs=weaponRequest(c.question)!;assert.equal(inputs.attackSuccesses,c.attack,c.name);assert.deepEqual(inputs.inputIssues,[],c.name);assert.equal(planRetrieval(c.question).weaponFacts?.attackSuccesses,c.attack,c.name)}
 assert.equal(attackInputs(playerInputCases.find(c=>c.name==='partial allocation')!.question).damageSuccesses,1);
 assert.equal(attackInputs(playerInputCases.find(c=>c.name==='zero allocation')!.question).damageSuccesses,0);
 assert.equal(weaponRequest(playerInputReproduction)?.modifiersRequested,false);
 assert.equal(weaponRequest('Longbow damage with three successes and talent modifiers?')?.modifiersRequested,true);
});
test('missing or ambiguous counts and allocations are never filled from another input',()=>{
 for(const question of ['Longbow damage with three or four successes?','Longbow damage with three successes or four successes?','Longbow damage with -1 successes?','Longbow damage with 1.5 successes?'])assert.ok(weaponRequest(question)?.inputIssues.length,question);
 assert.equal(weaponRequest('How much Longbow damage?')?.attackSuccesses,null);
 const r=attackInputs('Three successes, but I spend one or two extra successes on damage.');assert.equal(r.attackSuccesses,3);assert.ok(r.inputIssues.length);
 assert.equal(attackInputs('One success is required to hit; I rolled three sixes.').attackSuccesses,3);
 for(const action of ['I rolled three successes or four successes.','I rolled twenty one successes.']){assert.equal(attackInputs(action).attackSuccesses,null);assert.ok(attackInputs(action).inputIssues.length)}
});
