import type {Session} from '../types';
import {applySheet,sheetFor} from '../character-sheet';
import {applyQuarterCommand,quarterFor} from '../journey/quarter-engine';
import type {JourneyGeography} from '../journey/engine';
import type {StructuredRoll} from '../journey/quarter-schema';
import type {DiceCommand,PendingDice} from './schema';
export function countSuccesses(r:StructuredRoll){return Math.max(0,r.attribute.filter(v=>v===6).length+r.skillDice.filter(v=>v===6).length*(r.negativeSkill?-1:1)+r.gear.filter(v=>v===6).length+r.artifacts.reduce((n,d)=>{if(d.value>d.sides)throw new Error('Artifact result exceeds die size');return n+(d.value>=6?Math.floor((d.value-6)/2)+1:0)},0))}
export function canPush(r:PendingDice){return r.status==='Pending'&&!r.result.pushed&&!r.metadata.isArmor&&!r.metadata.utility}
export function applyDiceCommand(input:Session,c:DiceCommand,geo:JourneyGeography,now:string,die:(sides:number)=>number):Session{
 let s=structuredClone(input);s.dice??=[];
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
 if(card.status!=='Pending')throw new Error('Result already submitted');
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
 if(card.metadata.utility&&c.requestId)throw new Error('Utility rolls cannot resolve skill requests');
 const r={...card.result,requestId:c.requestId,quarterDayId:c.requestId?quarterFor(s).active?.id??null:null};
 // Existing validated activity function supplies skill/character/request identity checks.
 s=applyQuarterCommand(s,{type:'quarter-roll',campaignId:c.campaignId,revision:1,actionId:c.actionId,roll:r},geo,now);
 const updated=s.dice!.find(d=>d.id===card.id)!;updated.result=r;updated.status='Submitted';updated.submittedAt=now;
 // The roll already owns a chronological chat slot; do not add a duplicate narration entry.
 s.messages=s.messages.filter(m=>!m.id.startsWith(c.actionId+':'));
 return s;
}
