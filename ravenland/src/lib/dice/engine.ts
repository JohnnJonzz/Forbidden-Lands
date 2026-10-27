import type {Session} from '../types';
import {applySheet,sheetFor} from '../character-sheet';
import {groupsFor,groupReadiness} from './groups';
import {applyQuarterCommand,quarterFor,matchingRequests} from '../journey/quarter-engine';
import type {JourneyGeography} from '../journey/engine';
import type {StructuredRoll} from '../journey/quarter-schema';
import type {DiceCommand,PendingDice} from './schema';
export function countSuccesses(r:StructuredRoll){return Math.max(0,r.attribute.filter(v=>v===6).length+r.skillDice.filter(v=>v===6).length*(r.negativeSkill?-1:1)+r.gear.filter(v=>v===6).length+r.artifacts.reduce((n,d)=>{if(d.value>d.sides)throw new Error('Artifact result exceeds die size');return n+(d.value>=6?Math.floor((d.value-6)/2)+1:0)},0))}
export function canPush(r:PendingDice){return r.status==='Pending'&&!r.result.pushed&&!r.metadata.isArmor&&!r.metadata.utility}
export function applyDiceCommand(input:Session,c:DiceCommand,geo:JourneyGeography,now:string,die:(sides:number)=>number):Session{
 let s=structuredClone(input);s.dice??=[];
 if(c.type==='group-coordinator'){
  const groups=groupsFor(s);if(c.actorId!==groups.coordinatorId)throw new Error('Only the party coordinator can delegate coordination');if(!s.characters.some(ch=>ch.id===c.coordinatorId))throw new Error('Coordinator must be a party member');s.diceGroups={...groups,coordinatorId:c.coordinatorId};return s;
 }
 if(c.type==='submit-group'){
  const groups=groupsFor(s),state=groupReadiness(s),p=state.plan;
  if(c.actorId!==groups.coordinatorId)throw new Error('Only the designated party coordinator can submit quarter-day results');
  if(groups.batches.some(b=>b.planId===c.planId))throw new Error('Quarter-day results already submitted');
  if(!p||p.id!==c.planId||p.status==='DRAFT')throw new Error('Confirm the quarter-day plan before submitting results');
  if(state.missing.length)throw new Error('Every mandatory request must have a Ready roll or be explicitly resolved');
  if(p.from!==s.campaign.hex||p.date!==s.campaign.date||p.quarter!==s.campaign.quarter)throw new Error('Campaign position or clock changed since planning');
  for(const card of state.ready)s=finalize(s,card.id,card.result.requestId!,c,geo,now);
  const completed=quarterFor(s).active!;if(completed.status!=='RESOLVED')throw new Error('Activities are not fully resolved');
  const results=quarterFor(s).rolls.filter(r=>r.quarterDayId===p.id);
  const summary=`${completed.date} · ${completed.quarter} · ${completed.from}${completed.traveling?' → '+completed.destination:''}. `+completed.assignments.map(a=>`${s.characters.find(ch=>ch.id===a.characterId)?.name??a.characterId}: ${a.activity} — ${a.outcome||'No roll required by controller ruling'}`).join('; ');
  s.diceGroups={...groups,batches:[...groups.batches,{id:c.actionId,planId:p.id,coordinatorId:c.actorId,submittedAt:now,context:{date:completed.date,quarter:completed.quarter,hex:s.campaign.hex,location:s.campaign.location,terrain:s.campaign.terrain,weather:s.campaign.weather,traveling:completed.traveling,destination:completed.destination,direction:completed.direction,travelApproved:completed.travelApproved,travelRuling:completed.travelRuling,party:s.characters.map(ch=>({id:ch.id,name:ch.name})),assignments:structuredClone(completed.assignments)},results:structuredClone(results),resolvedRequests:structuredClone(completed.requests),narration:{status:'Not connected',summary:summary.slice(0,20000)}}]};
  s.messages.push({id:c.actionId,role:'gm',author:'Quarter-Day Controller',text:'Quarter-day results submitted together. '+summary.slice(0,19000)});return s;
 }
 if(c.type==='create'){
  const r=c.roll;if(s.dice.some(d=>d.id===r.id)||quarterFor(s).rolls.some(d=>d.id===r.id))throw new Error('Roll already exists');
  if(!s.characters.some(ch=>ch.id===r.characterId))throw new Error('Character not found');
  if(r.pushed||r.attributeDamage||r.gearDamage||r.willpower||r.requestId||r.quarterDayId)throw new Error('New rolls must be unpushed and unsubmitted');
  if(c.metadata.utility&&(r.attribute.length||r.skillDice.length||r.gear.length||r.artifacts.length))throw new Error('Utility dice cannot include a skill pool');
  if(r.successes!==countSuccesses(r))throw new Error('Success count does not match dice');
  const ch=s.characters.find(ch=>ch.id===r.characterId)!;
  const utility=c.metadata.utility;if(utility?.kind==='Resource'){if(utility.value>utility.sides)throw new Error('Resource result exceeds die size');const sheet=structuredClone(sheetFor(ch)),key=('res-'+utility.resource) as 'res-food';const current=sheet[key]??'None';if(current!=='D'+utility.sides)throw new Error('Resource die changed; roll the current resource die again');if(utility.value<=2){sheet[key]=['None','D6','D8','D10','D12'][['None','D6','D8','D10','D12'].indexOf(current as string)-1];s.characters[s.characters.findIndex(m=>m.id===ch.id)]=applySheet(ch,sheet)}}
  if(c.metadata.weaponIndex!==null&&!sheetFor(ch).weapons?.[c.metadata.weaponIndex])throw new Error('Weapon not found');
  s.dice.push({id:r.id,characterId:r.characterId,original:structuredClone(r),result:structuredClone(r),metadata:c.metadata,status:'Pending',createdAt:now,submittedAt:null,weaponSnapshot:c.metadata.weaponIndex!==null?JSON.stringify(sheetFor(ch).weapons?.[c.metadata.weaponIndex]):null,gearDamageApplied:0,gearDamageManual:0});
  s.messages.push({id:r.id,role:'player',author:ch.name,text:`Pending dice: ${r.skill}`});return s;
 }
 const card=s.dice.find(d=>d.id===c.rollId);if(!card)throw new Error('Roll not found');
 if(c.type==='unready'){if(card.status!=='Ready')throw new Error('Roll is not Ready');if(c.actorId!==card.characterId)throw new Error('Only the rolling character can change readiness');card.status='Pending';card.result.requestId=null;card.result.quarterDayId=null;return s}
 if(card.status!=='Pending')throw new Error(card.status==='Ready'?'Unready this roll before changing it':'Result already submitted');
 if(c.type==='ready'){
  if(c.actorId!==card.characterId)throw new Error('Only the rolling character can mark this roll Ready');if(card.metadata.utility)throw new Error('Utility rolls cannot resolve activity requests');const p=quarterFor(s).active,r=matchingRequests(s,card.result).find(r=>r.id===c.requestId);if(!p||!r)throw new Error('Choose a compatible mandatory request');if(r.skill==='Manual review')throw new Error('This activity requires explicit manual adjudication');if(s.dice.some(d=>d.status==='Ready'&&d.result.requestId===r.id&&d.result.quarterDayId===p.id))throw new Error('A roll is already Ready for this request');card.result.requestId=r.id;card.result.quarterDayId=p.id;card.status='Ready';return s;
 }
 if(c.type==='push'){
  if(!canPush(card))throw new Error('This roll cannot be pushed');
  const r=card.result;
  const reroll=(v:number,sides:number,banes:boolean)=>v>=6||(v===1&&banes)?v:die(sides);
  r.attribute=r.attribute.map(v=>reroll(v,6,true));r.skillDice=r.skillDice.map(v=>reroll(v,6,false));r.gear=r.gear.map(v=>reroll(v,6,true));r.artifacts=r.artifacts.map(d=>({...d,value:reroll(d.value,d.sides,false)}));r.pushed=true;r.successes=countSuccesses(r);
  const index=s.characters.findIndex(ch=>ch.id===card.characterId);if(index<0)throw new Error('Character not found');const sheet=structuredClone(sheetFor(s.characters[index]));
  const baseBanes=r.attribute.filter(v=>v===1).length;r.attributeDamage=card.metadata.attribute?baseBanes:0;r.gearDamage=r.gear.filter(v=>v===1).length;
  if(card.metadata.attribute){const key=`attr-${card.metadata.attribute}` as 'attr-strength';const before=Math.max(0,Math.trunc(Number(sheet[key]??s.characters[index][card.metadata.attribute])||0));sheet[key]=String(Math.max(0,before-baseBanes));}
  const wp=Math.max(0,Math.min(10,Math.trunc(Number(sheet.willpower)||0)));sheet.willpower=String(Math.min(10,wp+baseBanes));r.willpower=Math.max(0,Math.min(10,wp+baseBanes)-wp);
  if(card.metadata.weaponIndex!==null){const weapon=sheet.weapons?.[card.metadata.weaponIndex];
   // A reordered/deleted weapon must never damage a different item.
   if(weapon&&JSON.stringify(weapon)===card.weaponSnapshot&&weapon.name===card.result.skill.replace(/^Attack: /,'')){const before=Math.max(0,Math.trunc(Number(weapon.bonus)||0));weapon.bonus=String(Math.max(0,before-r.gearDamage));card.gearDamageApplied=Math.min(Math.max(0,before),r.gearDamage)}
  }
  card.gearDamageManual=r.gearDamage-card.gearDamageApplied;s.characters[index]=applySheet(s.characters[index],sheet);return s;
 }
 if(c.requestId)throw new Error('Quarter-day rolls must be marked Ready and submitted by the coordinator as a group');
 return finalize(s,card.id,null,c,geo,now);
}
function finalize(input:Session,rollId:string,requestId:string|null,c:{campaignId:string;actionId:string},geo:JourneyGeography,now:string):Session{
 const card=input.dice!.find(d=>d.id===rollId)!;
 const r={...card.result,requestId,quarterDayId:requestId?quarterFor(input).active?.id??null:null};
 let s=applyQuarterCommand(input,{type:'quarter-roll',campaignId:c.campaignId,revision:1,actionId:c.actionId,roll:r},geo,now);
 const updated=s.dice!.find(d=>d.id===card.id)!;updated.result=r;updated.status='Submitted';updated.submittedAt=now;
 s.messages=s.messages.filter(m=>!m.id.startsWith(c.actionId+':'));
 return s;
}
