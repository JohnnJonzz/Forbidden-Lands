import {sceneMatches} from './setup-scene';
import {countSuccesses} from '../../lib/dice/engine';
import {z} from 'zod';
import type {CombatEncounter,CombatWorkflow} from '../../lib/combat/types';
import type {VerifiedRollSubmission} from '../dice/gm-submission';
import type {CombatTurnResult} from './service';

export interface VerifiedAttackNarrative {actionId:string;kind:string;weapon:string|null;actorId:string;targetId:string;attackRollId:string|null;defenseRollId:string|null;armorRollId:string|null;attackSuccesses:number;defenseSuccesses:number;uncanceledSuccesses:number;damageBeforeArmor:number;armorSuccesses:number;damageAfterArmor:number|null;damageApplication:'enemy_applied'|'player_managed'|'legacy_unverified';appliedDamage:number|null}
export interface CombatNarrativeEvent {attack?:VerifiedAttackNarrative;push?:{rollId:string;characterId?:string;attribute:string|null;attributeDamage:number;gearDamage:number;willpowerGained:number;alreadyHandled:true};id:string;kind:'start'|'action'|'attack'|'roll'|'push'|'threat'|'conclusion';actor:string;target?:string;outcome:'pending'|'miss'|'defended'|'absorbed'|'wounded'|'broken'|'recorded';facts:string;fallback:string}
export interface CombatNarrative {encounterId:string;round:number;location:string;sceneDescription?:string;absentCharacters?:string[];combatants?:{id:string;name:string;side:string}[];events:CombatNarrativeEvent[];nextPrompt:string;blocked:boolean}
export const combatProseSchema=z.object({beats:z.array(z.object({eventId:z.string(),text:z.string().min(1).max(800)}).strict()).max(12)}).strict();
export type CombatProse=z.infer<typeof combatProseSchema>;

export function combatNarrative(e:CombatEncounter,before:CombatTurnResult['checkpoint'],roll:VerifiedRollSubmission|null|undefined,technical:string,limit=false,workflow?:CombatWorkflow,drawnWeapon?:string):CombatNarrative{
 const place=e.sceneDescription&&!sceneMatches(e.sceneDescription,e.sceneLocation)?e.sceneDescription+' (within '+e.sceneLocation+')':e.sceneLocation;
 const events:CombatNarrativeEvent[]=[],name=(id:string)=>e.combatants.find(a=>a.id===id)?.name??'A participant';
 if(!before?.encounterId)events.push({id:e.id,kind:'start',actor:'The combatants',outcome:'pending',facts:`Encounter started at ${place}. Participants: ${e.combatants.map(a=>a.name).join(', ')}. Initiative is already drawn.`,fallback:`At ${place}, ${e.combatants.filter(a=>a.side==='enemy').map(a=>a.name).join(' and ')} turn to face ${e.combatants.filter(a=>a.side==='player').map(a=>a.name).join(' and ')}. Initiative is drawn.`});
 for(const a of e.history.slice(before?.attacks??0))for(const r of a.results){
  const target=e.combatants.find(t=>t.id===r.targetId)!,who=name(a.actorId),outcome=r.remaining===0?r.successes===0?'miss':'defended':r.afterArmor===0?'absorbed':target.broken?'broken':'wounded';
  const actor=e.combatants.find(t=>t.id===a.actorId)!,weapon=a.playerWeapon?.name??(a.weaponIndex===null?null:actor.enemy?.weapons[a.weaponIndex]?.name)??null;
  const score=(id:string|undefined)=>{const r=e.rolls.find(r=>r.id===id)?.result;return r?countSuccesses(r):0};
  const attack:VerifiedAttackNarrative={actionId:a.id,kind:a.kind,weapon,actorId:a.actorId,targetId:r.targetId,attackRollId:a.attackRolls[r.targetId]??null,defenseRollId:a.defenseRolls[r.targetId]??null,armorRollId:a.armorRolls[r.targetId]??null,attackSuccesses:r.successes,defenseSuccesses:score(a.defenseRolls[r.targetId]),uncanceledSuccesses:r.remaining,damageBeforeArmor:r.beforeArmor,armorSuccesses:score(a.armorRolls[r.targetId]),damageAfterArmor:r.afterArmor,damageApplication:target.side==='player'?'player_managed':r.appliedDamage?'enemy_applied':'legacy_unverified',appliedDamage:r.appliedDamage?.amount??null};
  const fallback=outcome==='miss'?`${who}'s attack goes wide; ${target.name} remains in the fight.`:outcome==='defended'?`${target.name} turns aside ${who}'s attack.`:outcome==='absorbed'?`${who}'s blow lands against ${target.name}'s protection without a wound.`:outcome==='broken'?`${who}'s attack breaks ${target.name}'s resistance. ${target.name} can no longer fight; death is not assumed.`:target.side==='player'?`${who}'s attack gets through ${target.name}'s defense. Apply the recorded consequences on your sheet.`:`${who}'s attack wounds ${target.name}, who remains able to fight.`;
  events.push({attack,id:a.id+':'+r.targetId,kind:'attack',actor:who,target:target.name,outcome,facts:`${a.kind}${weapon?' with '+weapon:''}. ${r.successes} attack successes; ${r.remaining} uncanceled; ${r.beforeArmor} damage before armor; ${r.afterArmor} after actual armor. ${r.effects.length?'Effects: '+r.effects.join(', ')+'. ':''}${target.broken?'Broken confirmed; critical procedure '+(target.critical?.status??'not applicable')+'. Death is not established.':'No Broken status confirmed.'} ${target.side==='player'?'Player sheet remains player-managed; no automatic damage applied.':''}`,fallback:fallback+(r.remaining>0?` ${r.remaining} uncanceled successes; ${r.beforeArmor} damage before armor, ${r.afterArmor} after armor.`:'')});
 }
 // These values are copied from the verified saved card, never recalculated or
 // applied here. Pushing does not imply all three consequences occurred.
 const push=pushNarrativeEvent(roll);if(push)events.push(push);
 const p=e.pending;
 if(drawnWeapon)events.push({id:e.id+':draw:'+e.revision,kind:'action',actor:name(p?.actorId??e.combatants[e.turn].id),outcome:'recorded',facts:'Draw '+drawnWeapon+' (verified fast action), before attacking. No equipment record changed.',fallback:name(p?.actorId??e.combatants[e.turn].id)+' draws '+drawnWeapon+' before attacking.'});
 if(p){const who=name(p.actorId),target=p.targets.map(name).join(' and ');events.push({id:p.id,kind:'threat',actor:who,target,outcome:'pending',facts:`${p.kind} targeting ${target}; phase ${p.phase}. No final hit, injury, Broken status or displacement established by this unresolved attack.`,fallback:`${who} declares ${p.kind==='shoot'?'a ranged attack':'an attack'} against ${target}. The outcome is still open.`})}
 if(!p&&e.status==='active'&&!events.length&&/\b(?:stands|draws|loads|readies)\b/.test(technical)){const fact=technical.split('\n')[0];events.push({id:e.id+':action:'+e.revision,kind:'action',actor:e.combatants[e.turn].name,outcome:'recorded',facts:fact,fallback:fact})}
 if(e.status==='ended')events.push({id:e.id+':end',kind:'conclusion',actor:'The combatants',outcome:'recorded',facts:'Encounter ended. '+e.combatants.filter(a=>a.side==='enemy').map(a=>`${a.name}: ${a.broken?'Broken, not presumed dead':a.withdrawn?'withdrawn':'still active when ended manually'}`).join('; '),fallback:e.combatants.filter(a=>a.side==='enemy').every(a=>a.broken||a.withdrawn)?'The immediate fight is over. Broken opponents are incapacitated; their deaths are not assumed.':'The encounter has ended; its recorded outcomes remain unchanged.'});
 const view=e.status==='ended'?null:e.combatants[e.turn];
 let nextPrompt=e.status==='ended'?'What do you do now?':`${view?.name}, what do you do next?`;
 // The workflow already contains verified character-specific roll/reaction data.
 // Keep the next prompt short; detailed modifiers stay in the companion panel.
 if(p){
  if(p.phase==='declaration'){const undecided=p.targets.filter(id=>p.defenses[id]===null);nextPrompt=undecided.map(id=>`${name(id)}, choose your response before the attack roll: ${(workflow?.responses.find(r=>r.characterId===id)?.options??['none']).map(d=>d==='none'?'no defense':d==='dodge'?'Dodge':'Parry').join(', ')}.`).join(' ')}
  else if(p.phase==='attack_roll')nextPrompt=p.targets.map(id=>p.defenses[id]&&p.defenses[id]!=='none'?`${name(id)} has declared ${p.defenses[id]==='dodge'?'Dodge':'Parry'} before your roll. `:'').join('')+`${name(p.actorId)}, roll the declared weapon on your character sheet. You may push before clicking Submit this roll in Combat.`;
  else if(p.phase==='adjudication')nextPrompt=p.notes.join(' ')+' The action remains pending.';
  else {const target=p.targets.find(id=>p.phase==='armor_roll'?!p.armorRolls[id]&&p.results.some(r=>r.targetId===id&&r.afterArmor===null):p.defenses[id]&&p.defenses[id]!=='none'&&!p.defenseRolls[id]);nextPrompt=`${name(target??p.targets[0])}, roll ${p.phase==='armor_roll'?'your recorded armor':p.defenses[target??p.targets[0]]==='dodge'?'Move for your declared Dodge':'Melee for your declared Parry'} on your character sheet${p.phase==='armor_roll'?'':'; you may push'}. Then click Submit this roll in Combat.`}
 }else if(view?.side==='enemy'&&e.status==='active'){nextPrompt=limit?'Automatic combat progression reached its safety limit. The encounter is preserved for review.':/No supported attack/.test(technical)?'No supported enemy action is in range. Confirm positioning before continuing.':'The GM action needs review in Combat; no player turn has been skipped.'}
 if(workflow?.blocker)nextPrompt=workflow.blocker;
 return {encounterId:e.id,round:e.round,location:e.sceneLocation,sceneDescription:e.sceneDescription,absentCharacters:e.sceneAbsentCharacters??[],combatants:e.combatants.map(a=>({id:a.id,name:a.name,side:a.side})),events:events.slice(-12),nextPrompt,blocked:!!workflow?.blocker||limit||p?.phase==='adjudication'||!!view&&view.side==='enemy'&&!p};
}

export function pushNarrativeEvent(roll:VerifiedRollSubmission|null|undefined):CombatNarrativeEvent|null{
 if(!roll?.pushed)return null;const c=roll.consequences,attribute=roll.metadata?.attribute??null,attributeLabel=attribute?attribute[0].toUpperCase()+attribute.slice(1):'attribute',parts=[c.attributeDamage?`${c.attributeDamage} ${attributeLabel} damage to the rolling character`:null,c.gearDamage?`${c.gearDamage} gear damage`:null,c.willpowerGained?`${c.willpowerGained} Willpower gained`:null].filter(Boolean);
 return {id:roll.rollId+':push',kind:'push',actor:roll.character.name,outcome:'recorded',push:{rollId:roll.rollId,characterId:roll.character.id,attribute,attributeDamage:c.attributeDamage,gearDamage:c.gearDamage,willpowerGained:c.willpowerGained,alreadyHandled:true},facts:'Saved push consequences, already handled by dice system: '+(parts.join(', ')||'none')+'. Never apply again.',fallback:`${roll.character.name}'s push records ${parts.join(', ')||'no damage or Willpower gain'}. These consequences are already recorded.`};
}

export function fallbackCombatNarration(packet:CombatNarrative){return [...packet.events.map(e=>e.fallback),packet.nextPrompt].join('\n\n')}
// Prose is buffered until every event reference passes validation. Unresolved
// attacks cannot establish hits, injuries, displacement, defeat or dice results.
export function verifiedCombatProse(packet:CombatNarrative,raw:unknown):string{
 const parsed=combatProseSchema.safeParse(raw);if(!parsed.success)return fallbackCombatNarration(packet);
 const seen=new Set<string>(),texts:string[]=[];
 for(const beat of parsed.data.beats){const e=packet.events.find(e=>e.id===beat.eventId);if(!e||seen.has(e.id))return fallbackCombatNarration(packet);seen.add(e.id);
  const t=beat.text;if(e.kind==='push'){texts.push(e.fallback);continue}
  const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(packet.absentCharacters?.some(name=>new RegExp('\\b'+escape(name)+'\\b|\\b'+escape(name.split(/\s+/)[0])+'\\b','i').test(t)))return fallbackCombatNarration(packet);
  if(/\b(?:Willpower|attribute damage|gear damage)\b/i.test(t))return fallbackCombatNarration(packet);
  if(e.attack?.weapon){const actual=e.attack.weapon.toLowerCase();const terms=t.match(/\b(?:dagger|knife|falchion|broadsword|longsword|shortsword|longbow|shortbow|crossbow|sling|spear|axe|hammer|mace|staff)\b/gi)??[];if(terms.some(term=>!actual.includes(term.toLowerCase())&&!(term.toLowerCase()==='knife'&&actual.includes('dagger'))))return fallbackCombatNarration(packet)}
  const names=[...new Set([...packet.events.flatMap(v=>[v.actor,v.target??'']),...(packet.combatants?.map(a=>a.name)??[])].filter(Boolean))].sort((a,b)=>b.length-a.length);
  const withoutNames=names.reduce((text,name)=>text.replace(new RegExp(escape(name),'g'),''),t);
  if(/\d/.test(withoutNames)||/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:success|damage|Strength|Base|Gear|Skill|Willpower|bandits|enemies|combatants)/i.test(t)||/\b(?:dead|dies|killed|slain|reinforcements|guards arrive|quarter.day|roll again|spend.*success|initiative order)\b/i.test(t))return fallbackCombatNarration(packet);
  if(['pending','miss','defended','absorbed'].includes(e.outcome)&&/\b(?:wound\w*|injur\w*|bleed\w*|strikes? home|sinks? into|pierc\w*|cuts? (?:into|through)|hits? (?:him|her|the|its)|stagger\w*|stumbl\w*|falls?|collaps\w*|knock\w*|push\w* back|broken|defeat\w*|damage)\b/i.test(t))return fallbackCombatNarration(packet);
  if(e.outcome==='wounded'&&/\b(?:collaps\w*|broken|defeat\w*|incapacitat\w*)\b/i.test(t))return fallbackCombatNarration(packet);
  texts.push(t);
 }
 // Missing verified events must not disappear because the model omitted them.
 for(const e of packet.events)if(!seen.has(e.id))texts.push(e.fallback);
 return [...texts,packet.nextPrompt].join('\n\n');
}
