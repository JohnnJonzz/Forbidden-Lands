import {z} from 'zod';
import {calendarPhase} from '../../lib/campaign-calendar';
import {inFlower} from '../../lib/weather-hex';
import {injuryRecordSchema} from '../../lib/injury-schema';
import {createHash} from 'node:crypto';
import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {requireCharacterAccess} from '../character-access';
import {tableGM} from '../narrative/authority';
import {calendarSchema} from '../../lib/environment';
import {startingConditionsSchema,validateRavenlandCalendar,momentDistance,calendarView,ravenlandPhases} from '../../lib/campaign-calendar';
import {injuryProgress,injuryClockFor} from '../../lib/injury-timeline';
import {displayDate,namedDate,sameDay} from '../../lib/calendar';
import {activeChatForm,completionFor} from '../../lib/journey/chat-engine';
import type {Session} from '../../lib/types';
const text=z.string().trim().min(1).max(100);
export const calendarCommand=z.object({campaignId:z.string().uuid(),revision:z.number().int().positive(),requestId:z.string().uuid(),actorId:text,category:z.enum(['calendar-configuration','phase-label','date-normalization','starting-conditions','injury-timeline']),reason:z.string().trim().min(20).max(2000),calendar:calendarSchema.optional(),fromPhase:text.optional(),toPhase:text.optional(),year:z.number().int().nonnegative().optional(),date:text.optional(),starting:startingConditionsSchema.optional(),injury:z.object({characterId:text,id:z.string().uuid(),sustainedDate:z.string().max(160),sustainedQuarter:z.enum(['','Morning','Day','Evening','Night']),duration:z.string().max(30),unit:z.enum(['days','hours','quarter_days','review']).optional()}).strict().optional()}).strict();
export type CalendarCommand=z.infer<typeof calendarCommand>;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function calendarReceipts(repo:SqliteCampaignRepository,id:string){return repo.db.prepare('SELECT request_id,actor_id,category,reason,before_json,after_json,impact_json,created_at FROM calendar_corrections WHERE campaign_id=? ORDER BY rowid DESC LIMIT 30').all(id);}
function authorize(repo:SqliteCampaignRepository,c:CalendarCommand,p:CharacterPrincipal|null){requireCharacterAccess(p,c.campaignId,c.actorId);if(!tableGM(repo,c.campaignId,p).isTableGM)throw Error('Only the assigned Table GM may preview or apply campaign calendar corrections.');}
export function previewCalendar(repo:SqliteCampaignRepository,raw:unknown,principal:CharacterPrincipal|null){
 const c=calendarCommand.parse(raw);authorize(repo,c,principal);const r=repo.get(c.campaignId);if(!r||r.revision!==c.revision)throw Error('Campaign changed. Request a fresh calendar preview.');
 const s=structuredClone(r.session),before={clock:calendarView(s),starting:s.campaign.startingConditions??null,calendar:s.environment?.calendar??null,injury:c.injury?s.characters.find(ch=>ch.id===c.injury!.characterId)?.sheet?.injuries?.find(i=>i.id===c.injury!.id):null};
 const blockers:string[]=[],notes:string[]=[];
 const knownWeather=!!s.campaign.weather.trim()&&!/^(?:not established|unknown|pending|weather pending review)$/i.test(s.campaign.weather.trim());
 s.environment??={calendar:null,hexFlower:null,protocolRevision:0,weather:[],currentWeatherId:null,weatherStatus:knownWeather?'established':'pending',review:knownWeather?'Existing manual weather preserved; no daily weather protocol activated.':'Weather has not been established.',audit:[]};
 if(repo.db.prepare("SELECT 1 FROM combat_encounters WHERE campaign_id=? AND json_extract(state_json,'$.status')='active'").get(r.id))blockers.push('Resolve active combat before correcting its campaign clock metadata.');
 const form=activeChatForm(s);if(form?.entryId&&!completionFor(s,form.entryId))blockers.push('Resolve the submitted quarter before correcting calendar metadata.');
 if(c.category==='calendar-configuration'){
  if(!c.calendar)throw Error('Supply the reviewed calendar configuration.');validateRavenlandCalendar(c.calendar);if(JSON.stringify(c.calendar.labelAliases??[])!==JSON.stringify(s.environment.calendar?.labelAliases??[]))throw Error('Use a separately previewed phase-label correction to change historical labels.');
  if(s.environment.calendar&&s.calendarState)throw Error('An established calendar cannot be replaced wholesale. Use a scoped label correction; changing historical phase lengths requires a separate chronology review.');
  s.environment.calendar=c.calendar;if(s.activityState)s.activityState.settings.season=null;notes.push('The legacy independent activity-season preference is cleared. Current activity season follows the campaign calendar.');
  const p=namedDate(displayDate(s.campaign.date,c.calendar));if(!p||!ravenlandPhases.includes(p.phase as typeof ravenlandPhases[number]))blockers.push('The current legacy phase needs a phase-label correction to one of the eight campaign phases. You may configure the boundaries first.');
  // Configuring boundaries is safe even when a legacy label still needs review.
  if(blockers.at(-1)?.startsWith('The current legacy phase')){notes.push(blockers.pop()!);}
 }
 if(c.category==='phase-label'){
  if(!s.environment.calendar)throw Error('Review the eight phase lengths before correcting a calendar label.');
  if(!c.fromPhase||!c.toPhase||c.year===undefined||!ravenlandPhases.includes(c.toPhase as typeof ravenlandPhases[number]))throw Error('Choose an original phase, a Ravenland campaign phase, and the affected year.');
  const aliases=s.environment.calendar.labelAliases??=[];
  if(c.fromPhase.toLowerCase()===c.toPhase.toLowerCase()||aliases.some(a=>a.year===c.year&&[a.from.toLowerCase(),a.to.toLowerCase()].some(p=>p===c.fromPhase!.toLowerCase()||p===c.toPhase!.toLowerCase())))throw Error('Ambiguous, chained or duplicate label corrections require review.');
  const current=namedDate(s.campaign.date);if(!current||current.phase.toLowerCase()!==c.fromPhase.toLowerCase()||current.year!==c.year)throw Error('The proposed source label/year does not match the current campaign date.');
  aliases.push({from:c.fromPhase,to:c.toPhase,year:c.year});
  const originalDate=s.campaign.date;s.campaign.date=displayDate(s.campaign.date,s.environment.calendar);
  for(const f of s.chatJourney?.forms??[])if(!f.entryId&&sameDay(f.date,originalDate,s.environment.calendar))f.date=s.campaign.date;
  if(s.quarterDays?.active){if(s.quarterDays.active.status!=='DRAFT')blockers.push('Resolve the legacy quarter plan before relabeling its date.');else s.quarterDays.active.date=s.campaign.date;}
  if(s.campaign.startingConditions)s.campaign.startingConditions.date=displayDate(s.campaign.startingConditions.date,s.environment.calendar);
  const needs=s.activityState?.needs??[];for(let i=0;i<needs.length;i++)if(needs.slice(i+1).some(n=>n.characterId===needs[i].characterId&&n.resource===needs[i].resource&&sameDay(n.date,needs[i].date,s.environment?.calendar)))blockers.push('Two existing daily-needs receipts would share one corrected day. Resolve that conflict first.');
  const phase=calendarPhase(s);if(phase&&s.environment.hexFlower){const h=s.environment.hexFlower;if(inFlower(phase,h.x,h.y))h.phase=phase;else notes.push('The next seasonal weather flower requires a reviewed position before it can advance. Current established weather is preserved.');}
  notes.push('This relabels the same elapsed days. Original saved dates, dice, daily needs, provisions, injuries, campsites, encounters and completed quarters remain immutable. No weather is rerolled.');
 }
 if(c.category==='date-normalization'){
  if(!c.date)throw Error('Supply the proposed corrected date.');
  if(momentDistance(s.campaign,{date:c.date,quarter:s.campaign.quarter},s.environment.calendar)!==0)blockers.push('This would change elapsed time. Use normal verified time advancement to resolve obligations; this administrative workflow only corrects equivalent dates or scoped phase labels.');
  else s.campaign.date=displayDate(c.date,s.environment.calendar);
 }
 if(c.category==='starting-conditions'){
  if(!c.starting)throw Error('Supply reviewed historical starting conditions.');const d=namedDate(displayDate(c.starting.date,s.environment.calendar));if(!d||d.day<1||d.offset||d.day>(s.environment.calendar?.phases.find(p=>p.name===d.phase)?.days??45))throw Error('Choose a valid established starting date and reviewed phase boundary.');s.campaign.startingConditions=c.starting;
  notes.push('Historical metadata only. The current clock, location, weather and mechanical records will not change.');
 }
 if(c.category==='injury-timeline'){
  const injury=c.injury&&s.characters.find(ch=>ch.id===c.injury!.characterId)?.sheet?.injuries?.find(i=>i.id===c.injury!.id);if(!injury)throw Error('Select an original dated injury record.');
  const next=injuryRecordSchema.parse({...injury,sustainedDate:c.injury!.sustainedDate,sustainedQuarter:c.injury!.sustainedQuarter,duration:c.injury!.duration,...(c.injury!.unit?{unit:c.injury!.unit}:{})});Object.assign(injury,next);
  notes.push('Only this injury’s timeline metadata changes. Original receipt, effects, permanent status, treatment, recovery status and lethal deadline remain unchanged.');
 }
 if(!s.calendarState&&c.category!=='starting-conditions'&&c.category!=='injury-timeline'){
  const first=s.dayTracker?.[0],anchor=first?{date:first.date,quarter:first.quarter}:s.campaign.startingConditions??s.campaign;
  const elapsed=momentDistance(anchor,s.campaign,s.environment.calendar);
  const verified=elapsed!==null&&elapsed>=0;s.calendarState={anchorDate:verified?anchor.date:s.campaign.date,anchorQuarter:verified?anchor.quarter:s.campaign.quarter,elapsedQuarters:verified?elapsed:0};
  if(!verified)notes.push('Legacy start cannot be mapped yet. Elapsed identity begins at the reviewed current clock; original history is retained.');
 }
 const affected={dayTracker:s.dayTracker?.length??0,activityEntries:s.activityState?.entries.length??0,dailyNeeds:s.activityState?.needs.length??0,provisions:s.activityState?.provisions.length??0,savedDice:s.dice?.length??0,campsites:s.campsites?.length??0,injuries:s.characters.reduce((n,ch)=>n+(ch.sheet?.injuries?.length??0),0),encounters:Number(repo.db.prepare('SELECT count(*) AS n FROM combat_encounters WHERE campaign_id=?').get(r.id)!.n),consequences:Number(repo.db.prepare("SELECT count(*) AS n FROM campaign_consequences WHERE campaign_id=? AND status NOT IN ('resolved','superseded')").get(r.id)!.n)};
 const after={clock:calendarView(s),starting:s.campaign.startingConditions??null,calendar:s.environment.calendar,injury:c.injury?s.characters.find(ch=>ch.id===c.injury!.characterId)?.sheet?.injuries?.find(i=>i.id===c.injury!.id):null};
 const recoveryPreview=c.injury?{before:before.injury?injuryProgress(before.injury,injuryClockFor(r.session)):null,after:after.injury?injuryProgress(after.injury,injuryClockFor(s)):null}:null;
 const preview={recoveryPreview,category:c.category,before,after,affected,blockers:[...new Set(blockers)],notes};
 return {preview,previewHash:digest({command:c,principal:principal!.playerId,preview}),session:s,command:c};
}
export function applyCalendar(repo:SqliteCampaignRepository,raw:unknown,previewHash:string,principal:CharacterPrincipal|null){
 const c=calendarCommand.parse(raw);authorize(repo,c,principal);const {revision,...identity}=c;void revision;const hash=digest(identity);repo.db.exec('BEGIN IMMEDIATE');try{
  const prior=repo.db.prepare('SELECT fingerprint FROM calendar_corrections WHERE campaign_id=? AND request_id=?').get(c.campaignId,c.requestId);
  if(prior){if(prior.fingerprint!==hash)throw Error('Correction request reused with different values.');repo.db.exec('COMMIT');return {record:repo.get(c.campaignId)!,replayed:true};}
  const result=previewCalendar(repo,c,principal);if(result.previewHash!==previewHash)throw Error('Correction preview changed. Review the current values again.');if(result.preview.blockers.length)throw Error(result.preview.blockers.join(' '));
  result.session.environment!.audit.push({id:c.requestId,actorId:principal!.playerId,at:new Date().toISOString(),reason:c.category+': '+c.reason+(c.category==='phase-label'?' · '+c.fromPhase+' → '+c.toPhase+' · '+c.year:'')});
  const record=repo.update(c.campaignId,c.revision,result.session,{calendarValidated:true,environmentValidated:true,activitiesValidated:true,workflowValidated:true,elapsedQuarters:0,timeEventId:c.requestId});
  repo.db.prepare('INSERT INTO calendar_corrections VALUES (?,?,?,?,?,?,?,?,?,?)').run(c.campaignId,c.requestId,hash,principal!.playerId,c.category,c.reason,JSON.stringify(result.preview.before),JSON.stringify(result.preview.after),JSON.stringify(result.preview),new Date().toISOString());repo.db.exec('COMMIT');return {record,replayed:false};
 }catch(e){repo.db.exec('ROLLBACK');throw e;}
}
