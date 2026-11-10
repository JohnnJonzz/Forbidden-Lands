import {SourcebookLibrary} from '../sourcebooks/library';
import {sourceRequest} from '../../lib/rules/source-request';
import {characterSheetSchema} from '../../lib/character-sheet';
import {weaponRequest} from '../../lib/rules/weapon-request';
import {standardSkill} from '../../lib/rules/character-registry';
import type {MechanicalCharacter} from '../../lib/rules/action-preparation';
import type {Character} from '../../lib/types';
import type {PendingDice} from '../../lib/dice/schema';
import type {RuleRetrieval,RulePassage} from '../../lib/sourcebooks/schema';
import type {FactEvidence} from '../../lib/rules/mechanical-facts';
import {mechanicalCharacter,mechanicalWeapon} from '../mechanical-character';
import {mechanicalFactCoverage} from '../sourcebooks/mechanical-facts';
import {retrieveRules} from '../sourcebooks/retrieval';
import type {CharacterPrincipal} from '../character-access';
import type {SqliteCampaignRepository} from '../sqlite';
import type {VerifiedRollSubmission} from './gm-submission';
import {emptyAdjudication,type AttackAdjudication} from './attack-adjudication';

const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
export function savedAttackWeapon(character:Character,card:PendingDice,declaration:string){
 const label=card.result.skill.match(/^Attack:\s*(.+)$/i)?.[1],rows=mechanicalCharacter(character).weapons;
 let weapon:MechanicalCharacter['weapons'][number]|null=null,source='unresolved',issue='Identify the recorded weapon for this attack.';
 if(card.metadata.weaponIndex!==null){
  try{const parsed=characterSheetSchema.shape.weapons.unwrap().element.safeParse(JSON.parse(card.weaponSnapshot??'null'));if(parsed.success){weapon=mechanicalWeapon(parsed.data,card.metadata.weaponIndex);source='saved server weapon snapshot'}}catch{}
  if(!weapon){issue='The saved weapon snapshot cannot be verified.'}
 }else{const matches=rows.filter(w=>label?normalize(w.name)===normalize(label):w.name&&declaration.toLowerCase().includes(w.name.toLowerCase()));if(matches.length===1){weapon=matches[0];source='unique recorded character weapon row'}else if(matches.length>1)issue='Multiple recorded weapons match; identify the correct row.'}
 if(weapon&&label&&normalize(weapon.name)!==normalize(label)){weapon=null;issue='The saved weapon identity does not match the attack label.'}
 return {recorded:weapon,source,issue:weapon?null:issue,metadataDamageIgnored:true};
}
export function isRangedAttack(packet:VerifiedRollSubmission){return !packet.metadata.isArmor&&!packet.metadata.utility&&(packet.rollType==='Attack'&&(packet.weapon?.recorded?.skill==='marksmanship'||!packet.weapon?.recorded&&!!weaponRequest(packet.label+' statistics')?.weapons.length)||standardSkill(packet.label)?.id==='marksmanship'&&!!packet.match.action&&/\b(?:shoots?|fires?|looses?|attacks?)\b/i.test(packet.match.action.declaration))}
export function attackRuleQuery(packet:VerifiedRollSubmission){const name=packet.weapon?.recorded?.name??packet.label.match(/^Attack:\s*(.+)$/i)?.[1];return name?`What are the ${name}'s Gear Bonus, Damage and Range? How much damage does the ${name} inflict with ${packet.successes} attack successes? Explain additional-success damage and successes required to hit.`:null}
export function retrieveAttackRules(repo:SqliteCampaignRepository,campaignId:string,packet:VerifiedRollSubmission,fallback:string,options:{characterId?:string;principal?:CharacterPrincipal|null}={}){
 const preference=sourceRequest(packet.match.action?.declaration??''),suffix=preference.sourceTitle?' Using the official '+preference.sourceTitle+' PDF only.':preference.pdfOnly?' Use original official PDF only.':'';
 const question=isRangedAttack(packet)?attackRuleQuery(packet):null,query=question?question+suffix:null,primary=retrieveRules(repo,campaignId,query??fallback,'chat',options);if(!query||primary.mechanicalFacts?.firstHit.status!=='verified')return primary;
 const support=retrieveRules(repo,campaignId,'Explain ranged combat Dodge Parry reactive action availability declared before the attack roll, and armor and cover protection.'+suffix,'chat',options);
 const extra=support.passages.filter(p=>/\b(?:DODGE:|PARRY:)|\b(?:Armor Rating|Ar- mor Rating)\b/i.test(p.text)||'sourceType'in p&&p.sourceType==='house-rule'&&p.overrideApplicable);
 const protection=/When you suffer damage from a physical attack, you roll a number of Gear Dice equal to the Armor Rating\. Every x x you roll decreases the damage by one\.|Armor: roll Gear Dice equal to its Armor Rating\. Each armor success reduces damage by one\./i;
 const selected=[...primary.passages,...extra];if(!selected.some(p=>protection.test(p.text.replace(/\s+/g,' ')))){const library=new SourcebookLibrary(repo),sourceIds=preference.sourceTitle?library.resolveSourceIds(campaignId,preference.sourceTitle):undefined;const hits=sourceIds?sourceIds.flatMap(documentId=>library.search({campaignId,documentId,query:'physical attack Armor Rating decreases damage'},'player',12)):library.search({campaignId,query:'physical attack Armor Rating decreases damage'},'player',12),found=hits.find(p=>p.category==='Rules'&&protection.test(p.text.replace(/\s+/g,' ')));if(found)selected.push(found)}
 let tokens=0,omittedOverride=false;primary.passages=[...new Map(selected.map(p=>[p.chunkId,p])).values()].filter((p,i)=>{const n=Math.ceil(p.text.length/4);if(i>=8||tokens+n>5000){if('sourceType'in p&&p.sourceType==='house-rule'&&p.overrideApplicable)omittedOverride=true;return false}tokens+=n;return true});if(primary.selection&&omittedOverride)primary.selection.omittedPotentialOverride=true;primary.estimatedTokens=primary.passages.reduce((n,p)=>n+Math.ceil(p.text.length/4),0);primary.budgetTokens=Math.max(primary.budgetTokens,primary.estimatedTokens);primary.used=primary.passages.length>0;if(primary.planner)primary.planner.estimatedContextTokens=primary.estimatedTokens;if(primary.selection&&support.selection?.omittedPotentialOverride)primary.selection.omittedPotentialOverride=true;
 return primary;
}
function rule(passages:RulePassage[],header:string,pattern:RegExp,value:number|string):FactEvidence|undefined {for(const p of passages){if('sourceType'in p)continue;const text=p.text.replace(/\s+/g,' '),m=text.match(pattern);if(m)return {value,documentId:p.documentId,chunkId:p.chunkId,physicalPage:p.startPage,quote:m[0].slice(0,700),header,source:'pdf'}}}
export function interpretAttack(packet:VerifiedRollSubmission,rules:RuleRetrieval,manual=emptyAdjudication()){
 if(!isRangedAttack(packet)||packet.successes===null)return null;
 const name=packet.weapon?.recorded?.name??packet.label.replace(/^Attack:\s*/i,''),facts=mechanicalFactCoverage(rules.passages,{weapons:[name],fields:['damage','gearBonus','range'],calculate:true,extraSuccessRule:true,attackSuccesses:packet.successes,damageSuccesses:null,inputIssues:[],modifiersRequested:false}),missing:string[]=[...manual.issues];
 const official=facts.weapons[0]?.fields,recorded=packet.weapon?.recorded,base=recorded?.damage!==null&&recorded?.damage!==undefined&&official?.damage.status==='verified'&&recorded.damage===Number(official.damage.value)?recorded.damage:null;
 const evidence={threshold:facts.firstHit,weapon:official,extraDamage:facts.extraDamage,
  dodge:rule(rules.passages,'Dodge cancels attack successes',/DODGE:\s*Fast reactive action\.[^.]*\.[^.]*\.[^.]*Every x x you roll elimi-?\s*nates one x x from the attacker[’']s roll\.|Dodge: a fast reaction using Move\. A defense success cancels one attack success\./i,1),
  parry:rule(rules.passages,'Ranged Parry and weapon talent exception',/PARRY:\s*Fast reactive action\.[\s\S]{0,600}?Every x x you roll eliminates one x x from the attacker[’']s roll\.|Parry: a fast reaction using Melee\. Ranged parry needs a shield, or a Parrying weapon with matching weapon talent rank at least \d+\. A defense success cancels one attack success\./i,1),
  timing:rule(rules.passages,'Defense must be declared before the attack',/your opponent must declare if he intends to DODGE or PARRY before you roll to attack\.|Reactions must be declared before the attack roll\./i,'before attack'),
  cover:rule(rules.passages,'Cover uses armor protection',/Cover has an Armor Rating and works like armor|Cover works like armor against ranged attacks\./i,'armor protection'),
  armor:rule(rules.passages,'Armor successes reduce damage',/When you suffer damage from a physical attack, you roll a number of Gear Dice equal to the Armor Rating\. Every x x you roll decreases the damage by one\.|Armor: roll Gear Dice equal to its Armor Rating\. Each armor success reduces damage by one\./i,1)};
 const result={version:1,rollId:packet.rollId,characterId:packet.character.id,weaponName:name,attackSuccesses:packet.successes,requiredSuccesses:facts.firstHit.status==='verified'?Number(facts.firstHit.value):null,attackResult:'unverified' as 'unverified'|'miss'|'successful',phase:'evidence_required' as string,remainingSuccesses:null as number|null,additionalSuccesses:null as number|null,baseDamage:base,maximumDamageOption:null as number|null,allocatedDamageSuccesses:manual.damageSuccesses??null,damageBeforeArmor:null as number|null,damageAfterArmor:null as number|null,defense:'unknown',hitConfirmed:false,missing,evidence,manual,stateChangesPermitted:false,scope:'Ordinary ranged attack; manual target facts are player-reported adjudication, not invented NPC state. No optional successes, NPC rolls, sheet changes or canon updates are automatic.'};
 if(result.requiredSuccesses===null){missing.push('The authorized rules do not establish the attack hit threshold.');return result}
 if(packet.successes<result.requiredSuccesses){result.attackResult='miss';result.phase='miss';result.damageBeforeArmor=0;result.damageAfterArmor=0;return result}
 result.attackResult='successful';result.phase='defense_unknown';result.additionalSuccesses=packet.successes-result.requiredSuccesses;
 if(base===null)missing.push(recorded?.damage===null||!recorded?'Recorded weapon damage is missing.':official?.damage.status!=='verified'?'Official weapon damage is unverified.':'Recorded and official weapon damage differ; review the modification.');
 const extra=facts.extraDamage.status==='verified'?Number(facts.extraDamage.value):null;if(base!==null&&extra!==null)result.maximumDamageOption=base+result.additionalSuccesses*extra;
 const override=rules.selection?.omittedPotentialOverride||rules.passages.some(p=>'sourceType'in p&&p.sourceType==='house-rule'&&p.overrideApplicable&&/dodge|parry|defen[cs]e|armor|cover|hit|success/i.test(p.overrideScope));if(override)missing.push('Applicable defense/armor house rule requires manual review.');
 if(manual.issues.length){result.phase='manual_review';return result}
 if(packet.match.status==='ambiguous'){result.phase='action_ambiguous';missing.push('Which pending action does this saved attack resolve? Clarify the original declaration; no additional attack roll is needed.');return result}
 const d=manual.defense;let defenseSuccesses=0;
 if(d.attempt==='none'||d.actionAvailable===false){result.defense=d.actionAvailable===false?'unavailable':'not attempted'}
 else if(d.attempt){
  if(d.declaredBeforeAttack===false){result.defense='not declared before attack';if(!evidence.timing){missing.push('Defense timing evidence is missing.');return result}}
  else if(d.actionAvailable!==true||d.declaredBeforeAttack!==true){result.phase='defense_legality';missing.push('Confirm the defensive action was available and declared before the attack roll.');return result}
  else{
   if(!evidence[d.attempt]){missing.push('Official '+d.attempt+' cancellation evidence is missing.');return result}
   const minimumRank=evidence.parry?.quote.match(/(?:at least rank|rank at least) (\d+)/i)?.[1],weaponException=d.parryingWeapon===true&&minimumRank!==undefined&&d.weaponTalentRank!==undefined&&d.weaponTalentRank>=Number(minimumRank);
   const illegalParry=d.attempt==='parry'&&d.shield===false&&(d.parryingWeapon===false||d.parryingWeapon===true&&d.weaponTalentRank!==undefined&&minimumRank!==undefined&&!weaponException);
   if(illegalParry)result.defense='illegal ranged parry; no replacement response assumed';
   else{
    if(d.attempt==='parry'&&d.shield!==true&&!weaponException){result.phase='defense_legality';missing.push('Confirm the shield or the source-established Parrying weapon/talent exception.');return result}
    if(d.successes===undefined){result.phase='defense_roll';result.defense='legal '+d.attempt+' pending';missing.push('Provide the actual declared '+d.attempt+' roll result; no defensive roll was generated.');return result}
    result.defense='resolved '+d.attempt;defenseSuccesses=d.successes;
   }
  }
 }else{missing.push('Was a legal defense available and declared before the attack, or was no defense attempted?');return result}
 if(override){result.phase='house_rule_review';return result}
 result.remainingSuccesses=Math.max(0,packet.successes-defenseSuccesses);if(result.remainingSuccesses<result.requiredSuccesses){result.phase='defended';result.damageBeforeArmor=0;result.damageAfterArmor=0;return result}
 result.hitConfirmed=true;result.additionalSuccesses=result.remainingSuccesses-result.requiredSuccesses;if(base!==null&&extra!==null)result.maximumDamageOption=base+result.additionalSuccesses*extra;
 const allocated=manual.damageSuccesses==='all'?result.additionalSuccesses:manual.damageSuccesses??(result.additionalSuccesses===0?0:null);
 if(base===null){result.phase='weapon_review';return result}if(allocated===null){result.phase='damage_options';missing.push('Choose how many additional successes to spend on damage.');return result}
 if(allocated>result.additionalSuccesses||allocated<0){result.phase='damage_options';missing.push('Damage allocation exceeds the remaining additional successes.');return result}
 if(allocated>0&&extra===null){result.phase='evidence_required';missing.push('Extra-success damage evidence is missing.');return result}
 result.allocatedDamageSuccesses=allocated;const damage=base+allocated*(extra??0);result.damageBeforeArmor=damage;
 for(const [kind,p] of [['cover',manual.cover],['armor',manual.armor]] as const){
  if(kind==='cover'&&p.rating===undefined&&p.successes===undefined)continue;
  if(p.rating===undefined){result.phase='armor_unknown';missing.push('Provide the actual '+kind+' rating or confirm the target is unarmored.');return result}
  if(p.rating>0&&p.successes===undefined){result.phase=kind+'_roll';missing.push('Provide the actual '+kind+' roll; its rating is not automatic damage reduction.');return result}
  if((p.successes??0)>p.rating){result.phase='armor_review';missing.push('The reported '+kind+' successes exceed its rating.');return result}
  if(p.rating>0&&(!evidence.armor||kind==='cover'&&!evidence.cover)){result.phase='evidence_required';missing.push('Official protection-roll reduction evidence is missing.');return result}
  result.damageAfterArmor=Math.max(0,(result.damageAfterArmor??damage)-(p.successes??0));
  if(result.damageAfterArmor===0){result.phase='resolved';return result}
 }
 result.phase='resolved';return result;
}
export type AttackInterpretation=NonNullable<ReturnType<typeof interpretAttack>>;
export function attackReply(a:AttackInterpretation){
 if(a.attackResult==='unverified')return null;
 const lines=[a.weaponName+' attack: '+a.attackSuccesses+' recorded successes. '+(a.attackResult==='miss'?'The attack misses; 0 damage.':'Successful attack roll: the evidenced hit requirement is '+a.requiredSuccesses+' success.')];
 if(a.attackResult==='successful'){
  if(a.baseDamage!==null)lines.push('Base weapon damage: '+a.baseDamage+'.'+(a.maximumDamageOption!==null&&a.maximumDamageOption!==a.baseDamage?' Spending additional successes on damage can increase it to '+a.maximumDamageOption+' before defense/armor; those successes have not been spent.':''));
  if(a.phase==='defended')lines.push('The reported legal defense cancels enough successes: no hit, 0 damage.');
  else if(a.phase==='resolved')lines.push('The attack hits for '+a.damageBeforeArmor+' damage before protection and '+a.damageAfterArmor+' damage after the reported armor/cover results.');
  else if(a.hitConfirmed)lines.push('The attack hits. '+(a.damageBeforeArmor!==null?'Damage before armor: '+a.damageBeforeArmor+'. ':'')+'Final damage is awaiting the specific information below.');
  else lines.push('A successful attack roll is established. Final hit resolution awaits only applicable defense facts, not another attack roll.');
 }
 if(a.defense!=='unknown')lines.push('Defense: '+a.defense+'.');
 if(a.missing.length)lines.push(a.missing.join(' '));
 if(a.phase==='defense_unknown')lines.push('For example: “No defense attempted. Target is unarmored.” Or report the already-declared defense, available action, and actual defensive roll.');
 lines.push('Manual target facts/results remain player-reported. No NPC dice were generated, optional effects applied, or character sheets changed.');return lines.join('\n\n');
}
