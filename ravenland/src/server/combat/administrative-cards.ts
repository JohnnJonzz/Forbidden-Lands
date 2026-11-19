import type {SqliteCampaignRepository} from '../sqlite';
import type {PendingDice} from '../../lib/dice/schema';
import type {CombatEncounter} from '../../lib/combat/types';
import {AIError} from '../ai/config';
export function assertCombatCardNotAborted(repo:SqliteCampaignRepository,campaignId:string,card:PendingDice,completedRequestId?:string){
 if(completedRequestId&&repo.db.prepare("SELECT 1 FROM ai_requests WHERE campaign_id=? AND id=? AND status='completed'").get(campaignId,completedRequestId))return;
 const rows=repo.db.prepare("SELECT state_json FROM combat_encounters WHERE campaign_id=? AND json_type(state_json,'$.administrativeAbort')='object'").all(campaignId);
 const stopped=rows.some(row=>{const e=JSON.parse(String(row.state_json)) as CombatEncounter;if(card.combatContext?.encounterId===e.id||e.consumedPlayerRolls.includes(card.id))return true;return [...e.history,...(e.pending?[e.pending]:[])].some(p=>p.playerRolls.includes(card.id)||[...Object.values(p.attackRolls),...Object.values(p.defenseRolls),...Object.values(p.armorRolls)].includes(card.id));});
 if(stopped)throw new AIError('combat_administratively_terminated','This saved roll belongs to an administratively aborted encounter. It is retained as historical evidence and cannot be pushed or submitted as a new result.',409);
}
