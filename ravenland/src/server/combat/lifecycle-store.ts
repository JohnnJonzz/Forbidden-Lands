import {syncCombatCreatures} from '../creatures/combat';
import type {Session} from '../../lib/types';
import type {SqliteCampaignRepository} from '../sqlite';
import {activeCombat,saveCombat} from './store';
import {loadCombatRules} from './sources';
import {advanceLifecycle,syncPlayerConditions} from './lifecycle';
// Caller owns the SQLite transaction. No AI call, dice, resource spending, or
// player attribute write occurs here. Failed source lookup preserves the workflow.
export function reconcileCombatSheets(repo:SqliteCampaignRepository,campaignId:string,session:Session,push?:{characterId:string;attribute:string}){
 const e=activeCombat(repo,campaignId);if(!e)return;
 const before=JSON.stringify(e);syncCombatCreatures(repo,e,session);syncPlayerConditions(e,session,push);
 if(JSON.stringify(e)===before)return;
 let pages;try{pages=loadCombatRules(repo,campaignId).handbook;delete e.lifecycleEvidenceIssue;}catch{if(e.combatants.some(a=>a.side==='player'&&a.broken))e.lifecycleEvidenceIssue='Restore the official combat sources and resolve any scoped house-rule adjudication, then recheck Broken procedures.';}
 advanceLifecycle(e,session,pages);if(JSON.stringify(e)!==before)saveCombat(repo,e);
}
