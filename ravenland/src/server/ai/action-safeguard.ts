import {declaredAction} from '../../lib/rules/action-declaration';
import {standardSkill} from '../../lib/rules/character-registry';
import type {PreparedAction} from '../../lib/rules/action-preparation';
import type {Character} from '../../lib/types';
import {resourceAttention} from '../resource-awareness';
import type {VerifiedRollSubmission} from '../dice/gm-submission';

export function actionSafeguard(character:Character,action:string){
 const declaration=declaredAction(action,character.name);if(!declaration)return null;
 const attention=resourceAttention(character,action,'declaration'),unavailable=attention.required.filter(r=>r.state==='empty'||r.state==='unknown');
 if(!declaration.skill&&!unavailable.length)return null;
 return {phase:unavailable.length?'clarify_resources' as const:'awaiting_roll' as const,kind:declaration.kind,skill:declaration.skill?standardSkill(declaration.skill):null,resources:unavailable,stateChangesPermitted:false,resolutionPermitted:false};
}
export function declarationReply(character:Character,guard:NonNullable<ReturnType<typeof actionSafeguard>>,preparation:PreparedAction|null){
 const attempt=guard.kind==='ranged_attack'?`${character.name} lines up the attempted shot.`:guard.kind==='melee_attack'?`${character.name} prepares the attempted attack.`:`${character.name}'s declared attempt is pending.`;
 if(guard.phase==='clarify_resources')return attempt+' '+guard.resources.map(r=>r.state==='empty'?`Your recorded ${r.resource} are exhausted.`:`Availability of ${r.resource} is unknown (${r.recordStatus}).`).join(' ')+' How would you like to proceed, or what supplies are available? The attempt has not been resolved.';
 const skill=guard.skill!,pool=preparation?.status==='ready'&&preparation.basePool?` Verified base pool: ${preparation.basePool.base} attribute + ${preparation.basePool.skill} skill + ${preparation.basePool.gear} gear = ${preparation.basePool.total} dice.`:'';
 return attempt+` Roll ${skill.name} (${skill.attribute[0].toUpperCase()+skill.attribute.slice(1)}) on your character sheet, push if desired, then choose Submit to GM in Recent Dice Rolls.${pool} The outcome is awaiting that submitted result.`;
}
// Zero recorded successes cannot be turned into a successful attack by prose.
// No hit threshold, damage, optional allocation or opposed result is fabricated.
export function failedRollReply(roll:VerifiedRollSubmission){
 if(roll.successes!==0)return null;
 const skill=standardSkill(roll.label),attack=roll.match.action?.skill==='marksmanship'||roll.match.action?.skill==='melee'||roll.rollType==='Attack'||skill?.id==='marksmanship'||skill?.id==='melee';
 return `${roll.character.name}'s submitted ${roll.label} roll has 0 successes${roll.pushed?' after pushing':''}. It does not establish ${attack?'a successful hit':'a successful outcome'}. No ${attack?'damage or ':''}optional effects have been applied. ${roll.match.action?'The recorded result belongs to: '+roll.match.action.declaration:'Which action should this recorded result resolve?'}`;
}
