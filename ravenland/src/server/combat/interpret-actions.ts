import {createHash} from 'node:crypto';
import type {GMTurn} from '../../lib/ai/schema';
import {actionInterpretationSchema,type ActionInterpretation} from '../../lib/combat/action-intents';
import type {SqliteCampaignRepository} from '../sqlite';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {AIError} from '../ai/config';
import {actionContext,type ActionContext} from './action-context';

export interface InterpretationResult {interpretation:ActionInterpretation;inputTokens:number|null;outputTokens:number|null;model:string}
export type ActionInterpreter=(context:ActionContext)=>Promise<InterpretationResult>;
export function interpretationId(requestId:string){return createHash('sha256').update('combat-intent:'+requestId).digest('hex');}
export async function interpretedActions(repo:SqliteCampaignRepository,c:GMTurn,principal:CharacterPrincipal|null,interpret:ActionInterpreter|undefined,onUsage?:(result:Omit<InterpretationResult,'interpretation'>)=>void){
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const id=interpretationId(c.requestId),fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex');
 const saved=repo.db.prepare('SELECT fingerprint,result_json FROM combat_commands WHERE campaign_id=? AND request_id=?').get(c.campaignId,id);
 if(saved){if(saved.fingerprint!==fingerprint)throw new AIError('combat_duplicate','The interpretation request was reused with different parameters.',409);return JSON.parse(saved.result_json as string) as {plan:ActionInterpretation;revision:number;campaignRevision:number};}
 const context=actionContext(repo,c,principal);
 if(!interpret)throw new AIError('action_interpretation_unavailable','AI action interpretation is unavailable. Use the Combat movement/weapon controls or the character sheet; no action has occurred.',503);
 let result:InterpretationResult;
 try{result=await interpret(context.input)}catch(error){if(error instanceof AIError&&error.usage)onUsage?.(error.usage);throw error}
 onUsage?.(result);
 const parsed=actionInterpretationSchema.safeParse(result.interpretation);
 if(!parsed.success)throw new AIError('action_interpretation_invalid','The AI action interpretation was malformed. No actions occurred; use the Combat controls or retry.',502);
 const plan=parsed.data;
 if(plan.actorId!==c.characterId||plan.encounterId!==context.input.encounterId)throw new AIError('action_interpretation_invalid','The AI referenced a different actor or encounter. No actions occurred; use the Combat controls.',502);
 if(plan.disposition==='actions'&&!plan.actions.length||plan.disposition!=='actions'&&plan.actions.length)throw new AIError('action_interpretation_invalid','The AI did not provide a consistent action sequence. No actions occurred; use the Combat controls.',502);
 for(const action of plan.actions){
  if('targetId' in action&&!context.input.combatants.some(t=>t.side==='enemy'&&t.id===action.targetId&&!t.broken&&!t.withdrawn))throw new AIError('action_interpretation_invalid','The AI referenced an unavailable target. No actions occurred; choose a current target in Combat.',502);
  if('weaponRef' in action&&!context.input.weapons.some(w=>w.ref===action.weaponRef))throw new AIError('action_interpretation_invalid','The AI referenced equipment that was not supplied. No actions occurred; choose a recorded weapon in Combat.',502);
 }
 const value={requestId:c.requestId,plan,revision:context.revision,campaignRevision:context.campaignRevision};
 // This is a request receipt in the existing combat audit, not pending state.
 repo.db.prepare('INSERT INTO combat_commands VALUES (?,?,?,?,?,?)').run(c.campaignId,id,fingerprint,plan.encounterId,JSON.stringify(value),new Date().toISOString());return value;
}
