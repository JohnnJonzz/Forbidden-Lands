import {mayReadCharacter} from '../../src/server/character-access';
import {eligibleCombatRolls} from '../../src/server/combat/eligible-rolls';
import {randomUUID} from 'node:crypto';
import type {SqliteCampaignRepository} from '../../src/server/sqlite';
import type {CharacterPrincipal} from '../../src/server/character-access';
import {activeCombat} from '../../src/server/combat/store';
import {combatTurn} from '../../src/server/combat/service';
import {combatWorkflow} from '../../src/server/combat/workflow';
import {requestedCombatRoll} from '../../src/server/combat/requested-roll';
import {executeDice} from '../../src/server/dice/service';
import {verifiedRollSubmission,rollRequestId,savedRollFingerprint} from '../../src/server/dice/gm-submission';
// Old boundary regressions used End to discard pending rolls. Finish those actual
// procedures with saved zero results before explicitly interrupting the scene.
export async function finishCombatFixture(repo:SqliteCampaignRepository,x:{r:{id:string};ch:{id:string};principal:CharacterPrincipal}){
 for(let n=0;n<8;n++){
  const e=activeCombat(repo,x.r.id);if(!e)return;
  const c={campaignId:x.r.id,characterId:x.ch.id,requestId:randomUUID(),kind:'chat' as const,action:'/combat interrupt Regression scene boundary'};
  if(!e.pending){await combatTurn(repo,c,null,{...x.principal,mode:'trusted-local'});return;}
  const record=repo.get(x.r.id)!,response=combatWorkflow(e,record.session.characters).responses.find(r=>mayReadCharacter(x.principal,x.r.id,r.characterId));
  if(response)c.characterId=response.characterId;
  if(response?.step==='decision'){await combatTurn(repo,{...c,action:'/combat defense none'},null,x.principal,undefined,()=>2);continue;}
  if(!response)throw Error('Fixture has an unsupported pending mandatory procedure');
  const existing=eligibleCombatRolls(repo,x.r.id,c.characterId,e,x.principal)[0];
  if(existing){const input={...c,kind:'roll' as const,requestId:rollRequestId(x.r.id,existing.id),rollId:existing.id,rollFingerprint:savedRollFingerprint(existing)},packet=verifiedRollSubmission(repo,record,input,x.principal);await combatTurn(repo,input,packet,x.principal,undefined,()=>2);continue;}
  const need=requestedCombatRoll(e,record.session.characters,c.characterId),p=e.pending,w=p.playerWeapon,attribute=response.step==='attack'?(p.kind==='shoot'?'agility':'strength'):need?.attribute??null,base=response.step==='attack'?3:need?.base??0,skill=need?Math.abs(need.skill+need.modifier):2,gear=response.step==='attack'?w!.bonus:need?.gear??0,id=randomUUID();
  executeDice({campaignId:x.r.id,actionId:randomUUID(),type:'create',roll:{id,characterId:c.characterId,skill:response.step==='attack'?'Attack: '+w!.name:need!.label,attribute:Array(base).fill(2),skillDice:Array(skill).fill(2),gear:Array(gear).fill(2),artifacts:[],negativeSkill:need?need.skill+need.modifier<0:false,successes:0,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null},metadata:{attribute,isArmor:need?.isArmor??false,weaponIndex:response.step==='attack'?p.weaponIndex:null,weaponDamage:null}},repo);
  const saved=repo.get(x.r.id)!,card=saved.session.dice!.at(-1)!,input={...c,kind:'roll' as const,requestId:rollRequestId(x.r.id,id),rollId:id,rollFingerprint:savedRollFingerprint(card)},packet=verifiedRollSubmission(repo,saved,input,x.principal);await combatTurn(repo,input,packet,x.principal,undefined,()=>2);
 }
 throw Error('Fixture could not legally finish its pending mechanics');
}
