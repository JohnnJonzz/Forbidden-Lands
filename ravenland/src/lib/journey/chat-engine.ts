import type {Session} from '../types';
import type {JourneyGeography} from './engine';
import type {ChatCommand,ChatDraft,ChatForm,QuarterResolution} from './chat-schema';
import {defaultAssignments,directionBetween,quarterFor,requiresOutcome} from './quarter-engine';
import {journeyFor} from './engine';
import {advanceQuarter} from './clock';
export const chatFor=(s:Session)=>s.chatJourney??{forms:[],updates:[]};
export const completionFor=(s:Session,entryId:string)=>chatFor(s).updates.find(u=>u.entryId===entryId&&u.kind==='completed');
export const activeChatForm=(s:Session)=>chatFor(s).forms.find(f=>!f.superseded&&(!f.entryId||!completionFor(s,f.entryId)));
export function dayView(s:Session,id:string){const entry=s.dayTracker?.find(e=>e.id===id);if(!entry)return null;const updates=chatFor(s).updates.filter(u=>u.entryId===id),done=completionFor(s,id);return {entry,updates,status:done?'Completed':entry.status??'Completed',endingHex:done?.resolution?.endingHex??entry.endingHex,narrative:[...updates].reverse().find(u=>u.kind==='narrative'||u.kind==='completed'&&u.resolution?.narrative)?.text||done?.resolution?.narrative||entry.narrative,completedAt:done?.at??null}}
export function publicQuarterPacket(s:Session,entryId:string){const view=dayView(s,entryId);if(!view)throw new Error('Submitted quarter-day not found');return structuredClone({...view,corrections:s.dayCorrections?.filter(c=>c.entryId===entryId)??[]})}
function createForm(s:Session,id:string,now:string){const c=s.campaign,legacy=quarterFor(s).active,old=legacy&&legacy.date===c.date&&legacy.quarter===c.quarter&&legacy.from===c.hex&&legacy.assignments.length===s.characters.length&&legacy.assignments.every(a=>s.characters.some(ch=>ch.id===a.characterId))?legacy:null;const draft:ChatDraft={traveling:old?.traveling??false,destination:old?.destination??'',assignments:old?.assignments.map(a=>({...a,outcome:['Success','Fail'].includes(a.outcome)?a.outcome:''}))??defaultAssignments(s,false),notes:old?.notes??''};const form:ChatForm={id,date:c.date,quarter:c.quarter,from:c.hex,location:c.location,terrain:c.terrain,weather:c.weather,requestedAt:now,entryId:null,superseded:false,draft};s.chatJourney!.forms.push(form);s.messages.push({id:'form:'+id,role:'gm',author:'Quarter-Day Controller',text:'Quarter-Day Activities',quarterDayFormId:id});return form}
function checkClock(s:Session,f:ChatForm){if(s.campaign.date!==f.date||s.campaign.quarter!==f.quarter||s.campaign.hex!==f.from)throw new Error('Campaign clock or position changed. Restore it before resolving this quarter-day.')}
function checkDraft(s:Session,d:ChatDraft,geo:JourneyGeography,results:boolean){
 if(d.assignments.length!==s.characters.length||new Set(d.assignments.map(a=>a.characterId)).size!==s.characters.length||new Set(d.assignments.map(a=>a.id)).size!==d.assignments.length||d.assignments.some(a=>!s.characters.some(c=>c.id===a.characterId)))throw new Error('Assign every current party member exactly once');
 const allowed=d.traveling?['Lead the Way','Keep Watch','Hike']:['Make Camp','Rest','Sleep','Hunt','Fish','Forage','Explore','Keep Watch'];if(d.assignments.some(a=>!allowed.includes(a.activity)))throw new Error('Activity is incompatible with traveling selection');
 if(d.traveling){if(['Lead the Way','Keep Watch'].some(role=>d.assignments.filter(a=>a.activity===role).length!==1))throw new Error('Travel requires one leader and one watcher');if(!geo.calibrated||!geo.lookup(s.campaign.hex)||!geo.lookup(d.destination)||!geo.adjacent(s.campaign.hex,d.destination))throw new Error('Choose an authoritative adjacent destination on the calibrated map')}
 if(results&&d.assignments.some(a=>requiresOutcome(a)&&!['Success','Fail'].includes(a.outcome)))throw new Error('Select Success or Failure for every activity requiring an outcome');
}
function checkResolution(s:Session,entryId:string,r:QuarterResolution,geo:JourneyGeography){const e=s.dayTracker!.find(e=>e.id===entryId)!;if(r.endingHex!==e.from){if(!e.traveling||r.endingHex!==e.destination||!geo.calibrated||!geo.lookup(e.from)||!geo.lookup(r.endingHex)||!geo.adjacent(e.from,r.endingHex))throw new Error('Ending location must be the start or the authoritative adjacent intended destination')}
 // Travel rate, failed-roll consequences, healing and supplies are explicitly adjudicated, never invented here.
}
export function applyChatCommand(input:Session,c:ChatCommand,geo:JourneyGeography,now:string):Session{
 const s=structuredClone(input);s.chatJourney=chatFor(s);const state=s.chatJourney;
 if(c.type==='quarter-chat-request'){const active=activeChatForm(s);if(active){if(active.date===s.campaign.date&&active.quarter===s.campaign.quarter&&active.from===s.campaign.hex)return s;if(active.entryId)throw new Error('Resolve the submitted quarter-day before changing its clock or position');active.superseded=true}createForm(s,c.actionId,now);return s}
 if(c.type==='quarter-chat-draft'||c.type==='quarter-chat-submit'){
  const f=state.forms.find(f=>f.id===c.formId);if(!f||f.superseded)throw new Error('Current activity form not found');if(f.entryId)throw new Error('This form was already submitted');checkClock(s,f);checkDraft(s,c.draft,geo,c.type==='quarter-chat-submit');f.draft=structuredClone(c.draft);f.direction=c.draft.traveling?directionBetween(geo.lookup(f.from)!,geo.lookup(c.draft.destination)!):'';
  if(c.type==='quarter-chat-draft')return s;
  if(!s.characters.some(ch=>ch.id===c.actorId))throw new Error('Choose a current party member');
  const d=f.draft;f.entryId=c.actionId;s.dayTracker??=[];s.dayTracker.push({id:c.actionId,planId:f.id,date:f.date,quarter:f.quarter,weather:s.campaign.weather,from:f.from,destination:d.traveling?d.destination:'',endingHex:'',direction:d.traveling?directionBetween(geo.lookup(f.from)!,geo.lookup(d.destination)!):'',traveling:d.traveling,travelRuling:'',assignments:d.assignments.map(a=>({...a,outcome:requiresOutcome(a)?a.outcome==='Success'?'Success' as const:'Fail' as const:'' as const,characterName:s.characters.find(ch=>ch.id===a.characterId)!.name})),submittedAt:now,notes:d.notes,narrative:'',status:'Awaiting GM Resolution'});return s;
 }
 const view=dayView(s,c.entryId);if(!view)throw new Error('Submitted quarter-day not found');const f=state.forms.find(f=>f.entryId===c.entryId);if(!f)throw new Error('Submitted form not found');
 if(c.type==='quarter-chat-narrative'){state.updates.push({id:c.actionId,entryId:c.entryId,kind:'narrative',text:c.text,at:now});s.messages.push({id:c.actionId,role:'gm',author:'Quarter-Day Controller',text:c.text});return s}
 if(completionFor(s,c.entryId))throw new Error('This quarter-day was already completed');checkClock(s,f);
 if(c.type==='quarter-chat-question'||c.type==='quarter-chat-response'){state.updates.push({id:c.actionId,entryId:c.entryId,kind:c.type==='quarter-chat-question'?'question':'response',text:c.text,at:now});return s}
 if(!('resolution' in c))throw new Error('Unknown quarter-day command');
 checkResolution(s,c.entryId,c.resolution,geo);
 if(c.type==='quarter-chat-propose'){state.updates.push({id:c.actionId,entryId:c.entryId,kind:'proposal',text:c.resolution.adjudication,resolution:c.resolution,at:now});return s}
 if(!s.characters.some(ch=>ch.id===c.actorId))throw new Error('Choose a current party member');
 const lastExchange=[...view.updates].reverse().find(u=>u.kind==='question'||u.kind==='response');if(lastExchange?.kind==='question')throw new Error('Respond to the GM information request before completing this quarter-day');
 const before={date:s.campaign.date,quarter:s.campaign.quarter,hex:s.campaign.hex};if(c.resolution.endingHex!==s.campaign.hex){const h=geo.lookup(c.resolution.endingHex)!;Object.assign(s.campaign,{hex:h.coordinate,terrain:h.terrain??'',location:h.printedFeatures.length===1?h.printedFeatures[0]:h.coordinate})}
 Object.assign(s.campaign,advanceQuarter(s.campaign.date,s.campaign.quarter));s.campaign.weather=c.resolution.nextWeather;
 state.updates.push({id:c.actionId,entryId:c.entryId,kind:'completed',text:c.resolution.narrative,at:now,resolution:c.resolution,date:s.campaign.date,quarter:s.campaign.quarter});
 if(s.quarterDays?.active){s.quarterDays.active.status='CANCELLED';s.quarterDays.history.push(s.quarterDays.active);s.quarterDays.active=null}
 const journey=journeyFor(s);s.journey=journey;journey.log.push({id:c.actionId+':clock',kind:'clock',summary:'Completed chat quarter-day',before,after:{date:s.campaign.date,quarter:s.campaign.quarter,hex:s.campaign.hex},at:now});journey.weather={...journey.weather,forDescription:c.resolution.nextWeather,source:'Manual',updatedAt:now};
 s.messages.push({id:c.actionId,role:'gm',author:'Quarter-Day Controller',text:c.resolution.narrative||`Quarter-day completed: ${before.hex} → ${s.campaign.hex}. ${s.campaign.date} · ${s.campaign.quarter}.`});
 createForm(s,c.actionId+':next',now);return s;
}
