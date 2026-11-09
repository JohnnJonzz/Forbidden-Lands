import {SourcebookLibrary} from './sourcebooks/library';
import {sourceRequest} from '../lib/rules/source-request';
import {z} from 'zod';
import {standardSkill} from '../lib/rules/character-registry';
import type {PreparedAction} from '../lib/rules/action-preparation';
import {requireCharacterAccess,type CharacterPrincipal} from './character-access';
import {mechanicalCharacter} from './mechanical-character';
import type {SqliteCampaignRepository} from './sqlite';
import {retrieveRules,citationsFor} from './sourcebooks/retrieval';
import {AIError} from './ai/config';
export const preparationSchema=z.object({campaignId:z.string().uuid(),characterId:z.string().min(1).max(100),declaration:z.string().trim().min(1).max(3000),skill:z.string().max(100).optional()}).strict();
export function prepareAction(repo:SqliteCampaignRepository,raw:unknown,principal:CharacterPrincipal|null|undefined):PreparedAction {
 const c=preparationSchema.parse(raw);requireCharacterAccess(principal,c.campaignId,c.characterId);
 const record=repo.get(c.campaignId),character=record?.session.characters.find(ch=>ch.id===c.characterId);if(!record||!character)throw new AIError('character_unavailable','Authorized character is unavailable.',404);
 const actor=mechanicalCharacter(character),missing:string[]=[],skill=standardSkill('marksmanship')!;
 const proposal:PreparedAction={version:1,status:'needs_review',campaignId:c.campaignId,characterId:c.characterId,campaignRevision:record.revision,declaration:c.declaration,action:'unsupported',character:actor,characterInputs:{attribute:null,skill:null,weapon:null},ruleInputs:{skillOrigin:'official',gearBonusOrigin:null,skill:null,attribute:null,weaponGearBonus:null,poolRuleVerified:false},basePool:null,modifiers:{status:'none',talents:[],conditions:[],artifact:null},missing,sources:[],evidence:[],stateChangesPermitted:false};
 if(!/\b(?:shoot|fire)\b/i.test(c.declaration)){proposal.status='unsupported';missing.push('Only ordinary ranged-attack preparation is implemented. Other actions require verified manual preparation.');return proposal}
 proposal.action='ranged_attack';
 const requestedSkill=c.skill??c.declaration.match(/\b(?:using|with)\s+(?:my\s+|the\s+)?([\p{L} -]{2,50}?)\s+skill\b/iu)?.[1];
 if(requestedSkill&&!standardSkill(requestedSkill))missing.push('The requested skill is not an official skill. Optional or house-rule skills require a reviewed scoped definition.');
 else if(requestedSkill&&standardSkill(requestedSkill)?.id!==skill.id)missing.push('The requested skill does not match the verified ranged-attack skill.');
 const weapon=c.declaration.match(/\b(?:long\s?bow|short\s?bow|(?:heavy|light)\s+crossbow|crossbow)\b/i)?.[0];
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,''),matches=weapon?actor.weapons.filter(w=>normalize(w.name)===normalize(weapon)):[];
 const equipped=matches.filter(w=>w.equipped===true),chosen=matches.length===1?matches[0]:equipped.length===1?equipped[0]:null;
 if(!weapon)missing.push('Specify a supported ranged weapon.');else if(!matches.length)missing.push('The declared weapon is not recorded in this character’s weapon rows; inventory text alone does not establish equipped combat gear.');else if(!chosen)missing.push('Multiple matching weapons are recorded; identify the weapon for a verified pool.');
 proposal.characterInputs.weapon=chosen;
 const questions=['Explain the Marksmanship skill and its attribute.','Explain Ready Weapon, Aim, and Shoot in ranged combat.','Explain a skill roll: roll six-sided dice equal to your attribute score plus your skill level with extra dice from helpful gear.',...(weapon?[`What are the ${weapon}'s Gear Bonus, Damage, and Range?`]:[])];
 const preference=sourceRequest(c.declaration),suffix=preference.sourceTitle?' Using the official '+preference.sourceTitle+' PDF only.':preference.pdfOnly?' Use original official PDF only.':'';
 const packets=questions.map(q=>retrieveRules(repo,c.campaignId,q+suffix,'chat'));
 const passages=[...new Map(packets.flatMap(p=>p.passages).map(p=>[p.chunkId,p])).values()];
 const official=passages.filter(p=>!('sourceType'in p)&&p.category==='Rules');
 const mapping=official.find(p=>/\bMARKSMANSHIP\s*\(\s*AGILITY\s*\)/i.test(p.text));
 const shootPattern=/\bSHOOT:\s*(?:Slow|Fast) action\.\s*Roll for MARKSMANSHIP and the weapon[’']s Gear Bonus\b/i;
 const shoot=official.find(p=>shootPattern.test(p.text.replace(/\s+/g,' ')));
 const poolQuote=(text:string)=>{const t=text.replace(/\s+/g,' '),core=t.match(/\ba number of six[- ]+sided dice equal to your skill level plus your current score in the attribute[^.!?]*[.!?]/i),gear=t.match(/\bIf you have[^.!?]{0,100}\bgear\b[^.!?]{0,160}\bextra dice\b[^.!?]*[.!?]/i),labeled=t.match(/\bBase Dice equal to the attribute, Skill Dice equal to skill level, and Gear Dice for gear bonus\b/i);return core&&gear?core[0]+' '+gear[0]:labeled?.[0]};
 let pool=official.find(p=>!!poolQuote(p.text));
 // One bounded fact lookup when broad selected context omitted the actual formula.
 if(!pool){const library=new SourcebookLibrary(repo),sourceIds=preference.sourceTitle?library.resolveSourceIds(c.campaignId,preference.sourceTitle):undefined,query='skill level current score attribute extra dice gear';const candidates=sourceIds?sourceIds.flatMap(documentId=>library.search({campaignId:c.campaignId,documentId,query},'player',20)):library.search({campaignId:c.campaignId,query},'player',20);pool=candidates.find(p=>p.category==='Rules'&&!!poolQuote(p.text));}
 if(mapping&&shoot){proposal.ruleInputs.skill=skill.id;proposal.ruleInputs.attribute=skill.attribute}else missing.push('Official evidence must connect ranged attacks to Marksmanship and Agility.');
 proposal.ruleInputs.poolRuleVerified=!!pool;if(!pool)missing.push('The official attribute + skill + gear pool procedure was not verified.');
 const rating=packets.at(-1)?.mechanicalFacts?.weapons[0]?.fields.gearBonus;
 if(weapon&&rating?.status==='verified'){proposal.ruleInputs.weaponGearBonus=Number(rating.value);proposal.ruleInputs.gearBonusOrigin=rating.evidence.some(e=>e.source==='house-rule')?'house-rule':'official'}else if(weapon)missing.push('The official weapon Gear Bonus was not verified.');
 for(const [kind,p] of [['skill_attribute',mapping],['ranged_skill',shoot],['pool',pool]] as const)if(p)proposal.evidence.push({kind,chunkId:p.chunkId,physicalPage:p.startPage,quote:(kind==='skill_attribute'?p.text.match(/\bMARKSMANSHIP\s*\(\s*AGILITY\s*\)/i)?.[0]:kind==='ranged_skill'?p.text.replace(/\s+/g,' ').match(shootPattern)?.[0]:poolQuote(p.text))??''});
 for(const e of rating?.evidence??[])proposal.evidence.push({kind:'weapon_bonus',chunkId:e.chunkId,physicalPage:e.physicalPage,quote:e.quote});
 const readyPattern=/\bREADY WEAPON:\s*Fast action\.[^.!?]*[.!?]/i,ready=official.find(p=>readyPattern.test(p.text.replace(/\s+/g,' ')));if(ready)proposal.evidence.push({kind:'ready_weapon',chunkId:ready.chunkId,physicalPage:ready.startPage,quote:ready.text.replace(/\s+/g,' ').match(readyPattern)![0]});
 const used=new Set(proposal.evidence.map(e=>e.chunkId));const citations=packets.flatMap(citationsFor);if(pool&&!citations.some(c=>c.chunkId===pool.chunkId))citations.push({documentId:pool.documentId,chunkId:pool.chunkId,title:pool.title,startPage:pool.startPage,endPage:pool.endPage});proposal.sources=citations.filter((s,i,all)=>used.has(s.chunkId)&&all.findIndex(a=>a.chunkId===s.chunkId)===i);
 const unverifiedOverride=passages.some(p=>{
  if(!('sourceType'in p)||p.sourceType!=='house-rule'||!p.overrideApplicable)return false;
  const declared=rating?.evidence.find(e=>e.chunkId===p.chunkId),body=p.text.replace(/^#{1,6}[^\n]*$/gm,'').trim();
  // Only a complete, unconditional stat declaration can change the base bonus.
  const simple=weapon&&normalize(p.overrideScope)===normalize(weapon+' Gear Bonus')&&rating?.status==='verified'&&declared&&body===declared.quote&&/^[\p{L}][\p{L} '-]*:\s*Gear\s+Bonus\s*[:=]?\s*\+?\d{1,2}\.?$/iu.test(body);
  return !simple;
 });
 if(unverifiedOverride&&proposal.ruleInputs.gearBonusOrigin==='house-rule')proposal.ruleInputs.weaponGearBonus=null;
 if(unverifiedOverride||packets.some(p=>p.selection?.omittedPotentialOverride)||record.session.campaign.settings.houseRules.trim())missing.push('Campaign house-rule effects require review; official inputs are not a verified override.');
 const attribute=actor.attributes[skill.attribute],value=actor.skills['skill-'+skill.id];proposal.characterInputs.attribute=attribute.current;proposal.characterInputs.skill=value;
 if(attribute.current===null||attribute.regular===null||attribute.current>attribute.regular)missing.push('Current/regular Agility is missing or inconsistent.');else if(attribute.current===0)missing.push('Agility is zero; review the character state before preparing this action.');
 if(value===null)missing.push('The saved Marksmanship rating is missing or invalid.');
 if(chosen){if(chosen.skill!==skill.id)missing.push('The weapon attack skill is missing or does not match official Marksmanship.');if(chosen.bonus===null)missing.push('The saved weapon Gear Bonus is missing or invalid.');else if(chosen.bonus!==proposal.ruleInputs.weaponGearBonus)missing.push('The saved Gear Bonus differs from the verified rule; confirm damage or a reviewed modification.');if(chosen.artifact!=='None'){proposal.modifiers.artifact=chosen.artifact||'Unrecorded';missing.push('Artifact dice require separate verified preparation.')}}
 if(!Array.isArray(character.sheet?.talents))missing.push('The talent list is unrecorded; confirm applicable talents.');
 proposal.modifiers.talents=actor.talents;proposal.modifiers.conditions=Object.entries(actor.conditions).filter(([,v])=>v===true).map(([name])=>name);
 if(actor.talents.length)missing.push('Saved talents require applicability review; no talent bonus has been assumed.');
 if(proposal.modifiers.conditions.length)missing.push('Active conditions require verified effect review.');
 if(Object.values(actor.conditions).some(v=>v===null))missing.push('Condition fields are incomplete; confirm the current conditions.');
 proposal.modifiers.status=proposal.modifiers.talents.length||proposal.modifiers.conditions.length||proposal.modifiers.artifact?'unresolved':'none';
 if(attribute.current!==null&&attribute.current>0&&attribute.regular!==null&&attribute.current<=attribute.regular&&value!==null&&chosen&&chosen.bonus!==null&&chosen.bonus===proposal.ruleInputs.weaponGearBonus&&chosen.skill===skill.id&&proposal.ruleInputs.skill&&pool)proposal.basePool={base:attribute.current,skill:value,gear:chosen.bonus,total:attribute.current+value+chosen.bonus};
 proposal.status=missing.length?'needs_review':'ready';return proposal;
}
export function preparationNarration(p:PreparedAction){return `${p.character.name} · ${p.action==='ranged_attack'?'Ranged attack':'Action'} preparation (${p.status.replaceAll('_',' ')}).\n\n`+(p.basePool?`Base pool: ${p.basePool.base} attribute + ${p.basePool.skill} ${p.ruleInputs.skill??'skill'} + ${p.basePool.gear} gear = ${p.basePool.total} dice.\n\n`:'')+(p.missing.length?p.missing.join('\n'):'Marksmanship (Agility), using the recorded weapon. Readiness is advisory; no weapon has been drawn or changed.')+'\n\nPreparation only; no dice were rolled or game state changed.'}
