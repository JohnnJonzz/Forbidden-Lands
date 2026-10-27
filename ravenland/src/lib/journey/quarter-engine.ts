import type {Session} from '../types';
import type {GeoHex} from '../map/types';
import type {QuarterCommand,QuarterState,QuarterPlan,StructuredRoll} from './quarter-schema';
import type {JourneyGeography} from './engine';
import {journeyFor} from './engine';
import {advanceQuarter} from './clock';
export const quarterFor=(s:Session):QuarterState=>s.quarterDays??{settings:{weatherMode:'Manual',leader:journeyFor(s).assignments.leader,watch:journeyFor(s).assignments.watch,hike:'Manual review'},active:null,history:[],rolls:[]};
export function directionBetween(a:GeoHex,b:GeoHex){const row=(h:GeoHex)=>h.row*2+(h.column%2);const dy=row(b)-row(a),dx=b.column-a.column;return dx===0?(dy<0?'North':'South'):dx>0?(dy<0?'Northeast':'Southeast'):(dy<0?'Northwest':'Southwest')}
export function defaultAssignments(s:Session,traveling:boolean):QuarterPlan['assignments']{const settings=quarterFor(s).settings;return s.characters.map(c=>({id:crypto.randomUUID(),characterId:c.id,activity:traveling?(c.id===settings.leader?'Lead the Way':c.id===settings.watch?'Keep Watch':'Hike') as 'Lead the Way'|'Keep Watch'|'Hike':'Rest' as const,skill:traveling&&c.id!==settings.leader&&c.id!==settings.watch?(settings.hike==='Request Endurance roll'?'Endurance':settings.hike==='No roll (manual ruling)'?'No roll':'Manual review') as 'Endurance'|'No roll'|'Manual review':'Manual review' as const,outcome:''}))}
export function matchingRequests(s:Session,roll:StructuredRoll){const p=quarterFor(s).active;return !p?.manualMode&&p?.status==='AWAITING_ROLLS'?p.requests.filter(r=>r.status==='pending'&&r.characterId===roll.characterId&&r.skill.toLowerCase()===roll.skill.toLowerCase()):[]}
export function journeyContext(s:Session){const q=quarterFor(s);return {campaign:{...s.campaign},party:s.characters.map(c=>({id:c.id,name:c.name})),plan:q.active,completedRolls:q.rolls.filter(r=>r.quarterDayId===q.active?.id)}}
export function applyQuarterCommand(input:Session,c:QuarterCommand,geo:JourneyGeography,now:string):Session{
 const s=structuredClone(input),q=quarterFor(s);s.quarterDays=q;
 const say=(text:string)=>s.messages.push({id:c.actionId+':'+s.messages.length,role:'gm',author:'Quarter-Day Controller',text});
 const settle=(p:QuarterPlan)=>{if(p.requests.every(r=>r.status==='completed'))p.status='RESOLVED'};
 if(c.type==='quarter-correction'){if(c.actorId!==s.characters[0]?.id)throw new Error('Only Player 1 can log corrections');if(!s.dayTracker?.some(e=>e.id===c.entryId))throw new Error('Day Tracker entry not found');s.dayCorrections??=[];s.dayCorrections.push({id:c.actionId,entryId:c.entryId,actorId:c.actorId,notes:c.notes,at:now});return s}
 if(c.type==='quarter-submit')return submitManualQuarter(input,c,geo,now);
 if(c.type==='quarter-settings'){for(const id of [c.settings.leader,c.settings.watch])if(id&&!s.characters.some(m=>m.id===id))throw new Error('Unknown default character');if(c.settings.leader&&c.settings.leader===c.settings.watch)throw new Error('Choose distinct default responsibilities');q.settings=c.settings;if(c.settings.weatherMode==='Manual')s.campaign.weather=c.weather;return s}
 if(c.type==='quarter-draft'){
  if(journeyFor(s).activePlan)throw new Error('Complete or cancel the legacy journey before creating quarter-day activities');
  if(q.active&&q.active.status!=='DRAFT')throw new Error('Confirmed plans cannot be edited; cancel first');
  if(c.assignments.length!==s.characters.length||new Set(c.assignments.map(a=>a.characterId)).size!==s.characters.length||c.assignments.some(a=>!s.characters.some(m=>m.id===a.characterId))||new Set(c.assignments.map(a=>a.id)).size!==c.assignments.length)throw new Error('Assign every party member exactly once');
  const allowed=c.traveling?['Lead the Way','Keep Watch','Hike']:['Make Camp','Rest','Sleep','Hunt','Fish','Forage','Explore','Keep Watch'];
  if(c.assignments.some(a=>!allowed.includes(a.activity)))throw new Error('Activity is incompatible with traveling selection');
  if(c.traveling&&(['Lead the Way','Keep Watch'].some(role=>c.assignments.filter(a=>a.activity===role).length!==1)))throw new Error('Travel requires one leader and one watcher; adjudicate other restrictions manually');
  if(c.traveling&&(!geo.calibrated||!geo.lookup(c.destination)||!geo.lookup(s.campaign.hex)||!geo.adjacent(s.campaign.hex,c.destination)))throw new Error('Choose an authoritative adjacent destination on the calibrated map');
  q.active={id:q.active?.id??c.actionId,date:s.campaign.date,quarter:s.campaign.quarter,from:s.campaign.hex,traveling:c.traveling,destination:c.traveling?c.destination:'',direction:c.traveling?directionBetween(geo.lookup(s.campaign.hex)!,geo.lookup(c.destination)!):'',assignments:c.assignments,manualMode:c.manualMode,notes:c.notes,travelDecision:c.travelDecision,status:'DRAFT',requests:[],travelApproved:false,travelRuling:c.travelNotes??''};return s;
 }
 if(c.type==='quarter-roll'){
  const roll=c.roll;if(!s.characters.some(m=>m.id===roll.characterId))throw new Error('Unknown rolling character');
  if(q.rolls.some(r=>r.id===roll.id))throw new Error('Roll already recorded');
  const sum=roll.attribute.filter(v=>v===6).length+roll.skillDice.filter(v=>v===6).length*(roll.negativeSkill?-1:1)+roll.gear.filter(v=>v===6).length+roll.artifacts.reduce((n,d)=>{if(d.value>d.sides)throw new Error('Artifact value exceeds die');return n+(d.value>=6?Math.floor((d.value-6)/2)+1:0)},0);
  if(roll.successes!==Math.max(0,sum))throw new Error('Success total does not match dice');
  if(roll.requestId){const p=q.active,r=p?.requests.find(r=>r.id===roll.requestId);if(p?.manualMode)throw new Error('Manual activity outcomes are independent of dice');if(!p||p.status!=='AWAITING_ROLLS'||p.id!==roll.quarterDayId||!r||r.status!=='pending'||r.characterId!==roll.characterId||r.skill.toLowerCase()!==roll.skill.toLowerCase())throw new Error('Roll does not match the selected pending request');r.status='completed';r.rollId=roll.id;p.assignments.find(a=>a.id===r.activityId)!.outcome=`${roll.successes} successes; consequences require manual review`;settle(p)}else if(roll.quarterDayId)throw new Error('An associated roll needs an explicit request');
  q.rolls.push(roll);say(`${s.characters.find(m=>m.id===roll.characterId)!.name} — ${roll.skill}: ${roll.successes} successes${roll.pushed?' (pushed)':''}${roll.requestId?' · Request completed':' · Unlinked roll'}.`);return s;
 }
 const p=q.active;if(!p||p.id!==c.planId)throw new Error('Quarter-day plan is missing or changed');
 if(c.type==='quarter-cancel'){for(const card of s.dice??[]){if(card.status==='Ready'&&card.result.quarterDayId===p.id){card.status='Pending';card.result.quarterDayId=null;card.result.requestId=null}}if(p.status==='RESOLVED')throw new Error('Resolved activities must be advanced');p.status='CANCELLED';q.history.push(p);q.active=null;say('Quarter-day cancelled; no time or movement applied.');return s}
 if(p.from!==s.campaign.hex||p.date!==s.campaign.date||p.quarter!==s.campaign.quarter)throw new Error('Campaign position or clock changed; restore it before continuing this plan');
 if(c.type==='quarter-confirm'){if(p.manualMode)throw new Error('Select manual outcomes and submit the quarter-day; no roll confirmation is required');if(p.status!=='DRAFT')throw new Error('Plan already confirmed');p.status='CONFIRMED';p.requests=p.assignments.filter(a=>a.skill!=='No roll').map(a=>({id:a.id+':request',activityId:a.id,characterId:a.characterId,skill:a.skill,status:'pending',rollId:null,manual:''}));p.status='AWAITING_ROLLS';settle(p);say(`Quarter-day confirmed: ${p.traveling?`traveling ${p.direction} toward ${p.destination}`:'stationary activities'}. `+p.requests.map(r=>`${s.characters.find(m=>m.id===r.characterId)!.name} — ${r.skill==='Manual review'?'Manual adjudication required':r.skill+' roll required'}`).join('; '));return s}
 if(c.type==='quarter-manual'){if(p.manualMode)throw new Error('Select Success or Fail in quarter-day activities');const r=p.requests.find(r=>r.id===c.requestId);if(p.status!=='AWAITING_ROLLS'||!r||r.status!=='pending')throw new Error('Request is not pending');r.status='completed';r.manual=c.notes;for(const card of s.dice??[]){if(card.status==='Ready'&&card.result.quarterDayId===p.id&&card.result.requestId===r.id){card.status='Pending';card.result.quarterDayId=null;card.result.requestId=null}}p.assignments.find(a=>a.id===r.activityId)!.outcome=c.notes;settle(p);say(`Manual override: ${c.notes}`);return s}
 if(c.type==='quarter-travel-ruling'){if(!p.traveling||p.status==='DRAFT')throw new Error('Confirm a traveling plan first');p.travelApproved=c.approved;p.travelRuling=c.notes;say(`Manual travel ruling: ${c.approved?'arrival approved':'remain in current hex'} — ${c.notes}`);return s}
 if(p.status!=='RESOLVED'||p.requests.some(r=>r.status==='pending'))throw new Error('Resolve all required rolls before advancing');
 if(!s.diceGroups?.batches.some(b=>b.planId===p.id))throw new Error('The coordinator must submit quarter-day results before advancing');
 if(p.traveling){if(!p.travelRuling.trim())throw new Error('Manually adjudicate terrain, travel progress and activity compatibility before advancing');if(!geo.calibrated||!geo.adjacent(p.from,p.destination))throw new Error('Authoritative adjacency no longer permits travel');if(p.travelApproved){const target=geo.lookup(p.destination);if(!target)throw new Error('Destination missing');Object.assign(s.campaign,{hex:target.coordinate,terrain:target.terrain??'',location:target.printedFeatures.length===1?target.printedFeatures[0]:target.coordinate})}}
 const before={date:s.campaign.date,quarter:s.campaign.quarter,hex:p.from};Object.assign(s.campaign,advanceQuarter(s.campaign.date,s.campaign.quarter));p.status='ADVANCED';q.history.push(p);q.active=null;const j=journeyFor(s);s.journey=j;j.log.push({id:c.actionId+':quarter',kind:'clock',summary:`Quarter-day advanced; ${p.traveling?`travel ${p.from} → ${s.campaign.hex}: ${p.travelRuling}`:'stationary activities'}`,before,after:{date:s.campaign.date,quarter:s.campaign.quarter,hex:s.campaign.hex},at:now});say(`Quarter-day complete. ${s.campaign.date} · ${s.campaign.quarter} · ${s.campaign.hex}.`);return s;
}

// Outcomes are player rulings. Dice never select or overwrite them.
export function requiresOutcome(a:QuarterPlan['assignments'][number]){return ['Lead the Way','Keep Watch'].includes(a.activity)||(!['Rest','Sleep','Hike'].includes(a.activity)&&a.skill!=='No roll')||(a.activity==='Hike'&&a.skill==='Endurance')}
function submitManualQuarter(input:Session,c:Extract<QuarterCommand,{type:'quarter-submit'}>,geo:JourneyGeography,now:string):Session{
 // Development only: authenticated campaign membership/ownership must gate submission before public multiplayer.
 if(!input.characters.some(ch=>ch.id===c.actorId))throw new Error('Choose a current party member before submitting quarter-day results');
 if(c.expected.date!==input.campaign.date||c.expected.quarter!==input.campaign.quarter||c.expected.hex!==input.campaign.hex)throw new Error('This quarter-day has already ended or the campaign position changed. Reopen activities.');
 if(input.dayTracker?.some(e=>e.id===c.actionId))throw new Error('Quarter-day already submitted');
 const old=quarterFor(input).active;
 // Old saved plans remain usable without linking or deleting their historical rolls.
 const base=structuredClone(input);if(old){base.quarterDays=quarterFor(base);base.quarterDays.active=null}
 const s=applyQuarterCommand(base,{type:'quarter-draft',manualMode:true,assignments:c.assignments,campaignId:c.campaignId,revision:c.revision,actionId:c.actionId,traveling:c.traveling,destination:c.destination},geo,now);
 const q=quarterFor(s),p=q.active!;p.id=old?.id??c.actionId;p.manualMode=true;p.notes=c.notes;p.travelDecision=c.travelDecision;
 if(old&&(old.from!==p.from||old.date!==p.date||old.quarter!==p.quarter))throw new Error('Campaign clock or position changed since planning');
 for(const a of p.assignments){if(requiresOutcome(a)&&!['Success','Fail'].includes(a.outcome))throw new Error('Select Success or Fail for every required activity');if(!requiresOutcome(a))a.outcome=''}
 if(c.traveling&&(c.travelDecision==='pending'||!c.travelNotes.trim()))throw new Error('Travel requires an explicit ruling; no time or movement has been applied');
 const start=structuredClone(s.campaign);
 if(c.traveling&&c.travelDecision==='arrive'){const target=geo.lookup(c.destination)!;Object.assign(s.campaign,{hex:target.coordinate,terrain:target.terrain??'',location:target.printedFeatures.length===1?target.printedFeatures[0]:target.coordinate})}
 p.travelApproved=c.traveling&&c.travelDecision==='arrive';p.travelRuling=c.travelNotes;p.status='ADVANCED';p.requests=structuredClone(old?.requests??[]);
 q.history.push(p);q.active=null;
 for(const card of s.dice??[]){if(card.status==='Ready'&&card.result.quarterDayId===p.id){card.status='Pending';card.result.quarterDayId=null;card.result.requestId=null}}
 s.dayTracker??=[];s.dayTracker.push({id:c.actionId,planId:p.id,date:start.date,quarter:start.quarter,weather:start.weather,from:start.hex,destination:p.destination,endingHex:s.campaign.hex,direction:p.direction,traveling:p.traveling,travelRuling:p.travelRuling,assignments:p.assignments.map(a=>({...a,outcome:a.outcome==='Success'?'Success' as const:a.outcome==='Fail'?'Fail' as const:'' as const,characterName:s.characters.find(ch=>ch.id===a.characterId)!.name})),submittedAt:now,notes:c.notes,narrative:''});
 Object.assign(s.campaign,advanceQuarter(start.date,start.quarter));
 const j=journeyFor(s);s.journey=j;j.log.push({id:c.actionId+':quarter',kind:'clock',summary:'Manual quarter-day submitted',before:{date:start.date,quarter:start.quarter,hex:start.hex},after:{date:s.campaign.date,quarter:s.campaign.quarter,hex:s.campaign.hex},at:now});
 s.messages.push({id:c.actionId,role:'gm',author:'Quarter-Day Controller',text:`${start.date} · ${start.quarter} completed. `+p.assignments.map(a=>`${s.characters.find(ch=>ch.id===a.characterId)!.name}: ${a.activity}${a.outcome?' — '+a.outcome:''}`).join('; ')});
 return s;
}
