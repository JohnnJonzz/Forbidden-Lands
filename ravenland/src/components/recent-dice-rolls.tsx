import type {Session} from '@/lib/types';
import type {StructuredRoll} from '@/lib/journey/quarter-schema';
import {baneCounts} from '@/lib/dice/engine';
const timestamp=(at:string)=>new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(at))+' CT';
function DiceDetails({roll,label}:{roll:StructuredRoll;label:string}){
 const banes=baneCounts(roll);
 return <div className="recent-dice-values"><strong>{label}</strong><p>Attribute: {roll.attribute.join(' · ')||'—'} · Skill{roll.negativeSkill?' (negative)':''}: {roll.skillDice.join(' · ')||'—'} · Gear: {roll.gear.join(' · ')||'—'}</p>{roll.artifacts.length>0&&<p>Artifact: {roll.artifacts.map(d=>`D${d.sides}: ${d.value}`).join(' · ')}</p>}<p>{roll.successes} successes · Banes / ones: {banes.total} (Attribute {banes.attribute} · Skill {banes.skill} · Gear {banes.gear})</p></div>;
}
export function RecentDiceRolls({session}:{session:Session}){
 return <details className="recent-dice"><summary>Recent Dice Rolls</summary><div>{[...(session.dice??[])].reverse().slice(0,12).map(card=>{
  const r=card.result,utility=card.metadata.utility;
  return <details className="recent-dice-entry" key={card.id} data-roll-id={card.id}><summary><strong>{session.characters.find(c=>c.id===card.characterId)?.name??'Former party member'}</strong> · {r.skill} · {utility?.kind==='D66'?'D66: '+utility.faces.join(''):utility?.kind==='Resource'?'D'+utility.sides+': '+utility.value:r.successes+' successes'} · {r.pushed?'Pushed once':'Not pushed'} · <time dateTime={card.createdAt}>{timestamp(card.createdAt)}</time></summary>{utility?<p>{utility.kind==='Resource'?`Resource result D${utility.sides}: ${utility.value} · ${utility.value<=2?'Resource die reduced (saved)':'Resource retained'}`:'D66: '+utility.faces.join('')}</p>:<><DiceDetails roll={card.original} label="Initial dice"/><DiceDetails roll={r} label={r.pushed?'Final pushed dice':'Current dice (not pushed)'}/><p>Attribute damage: {r.attributeDamage} · Gear damage: {r.gearDamage} · Willpower gained: {r.willpower}</p>{!card.metadata.attribute&&r.attributeDamage>0&&<p>Attribute damage requiring manual application: {r.attributeDamage} (unbound attribute).</p>}{card.gearDamageManual>0&&<p>Gear damage requiring manual application: {card.gearDamageManual} (unbound gear).</p>}<small>Skill ones are rerollable and cause no push damage. Damage and Willpower shown above are saved push consequences.</small></>}</details>;
 })}{!session.dice?.length&&<p>No rolls yet.</p>}</div></details>;
}
