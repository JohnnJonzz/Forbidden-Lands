import {z} from 'zod';
import {displayDate,namedDate,fantasyDayDistance} from './calendar';
import type {Session,Quarter} from './types';
import type {Calendar} from './environment';
import {PHASES} from './weather-hex-data';
import type {Phase} from './weather-hex';
export const ravenlandPhases=['Springrise','Springwane','Summerrise','Summerwane','Fallrise','Fallwane','Winterrise','Winterwane'] as const;
export const startingConditionsSchema=z.object({date:z.string().max(100),quarter:z.enum(['Morning','Day','Evening','Night']),hex:z.string().max(50),location:z.string().max(200),terrain:z.string().max(200),provenance:z.string().max(300)}).strict();
export const calendarStateSchema=z.object({anchorDate:z.string().max(100),anchorQuarter:z.enum(['Morning','Day','Evening','Night']),elapsedQuarters:z.number().int().nonnegative()}).strict();
export const quarterIndex=(q:Quarter)=>['Morning','Day','Evening','Night'].indexOf(q);
export function calendarPhase(s:Session):Phase|null{const d=namedDate(displayDate(s.campaign.date,s.environment?.calendar));const p=d?.phase.toLowerCase();return PHASES.includes(p as Phase)?p as Phase:null;}
export function campaignSeason(s:Session):'Spring'|'Summer'|'Autumn'|'Winter'|null {const p=calendarPhase(s);return p?.startsWith('spring')?'Spring':p?.startsWith('summer')?'Summer':p?.startsWith('fall')?'Autumn':p?.startsWith('winter')?'Winter':null;}
// The legacy preference is a fallback only until the calendar has been reviewed.
export function activitySeason(s:Session){return campaignSeason(s)??(s.calendarState?null:s.activityState?.settings.season??null);}
export function momentDistance(a:{date:string;quarter:Quarter},b:{date:string;quarter:Quarter},calendar?:Calendar|null){const days=fantasyDayDistance(a.date,b.date,calendar);return days===null?null:days*4+quarterIndex(b.quarter)-quarterIndex(a.quarter);}
export function startingConditions(s:Session){return s.campaign.startingConditions??null;}
export function validateRavenlandCalendar(calendar:Calendar){if(calendar.phases.length!==8||calendar.phases.some((p,i)=>p.name!==ravenlandPhases[i]||![45,46].includes(p.days)))throw Error('Review all eight Ravenland campaign phases in order, with 45 or 46 days each. These are campaign labels; festival boundaries require your approval.');}
export function calendarView(s:Session){return {date:displayDate(s.campaign.date,s.environment?.calendar),quarter:s.campaign.quarter,phase:calendarPhase(s),season:campaignSeason(s),elapsedDays:s.calendarState?Math.floor(s.calendarState.elapsedQuarters/4):null,elapsedQuarters:s.calendarState?.elapsedQuarters??null};}
