import type {Calendar} from './environment';
import type {Quarter} from './types';
import {fantasyDayDistance,resolveNamedDate,namedDate} from './calendar';
export interface InjuryRecord {
 id:string; name:string; sustainedDate:string; sustainedQuarter:Quarter|'';
 duration:string; unit:'days'|'hours'|'quarter_days'|'review';
 permanent:boolean; status:'active'|'healed'; source:string; treatment:string; recordedAt:string;
}
export interface InjuryClock {date:string;quarter:Quarter;calendar?:Calendar|null}
const injuryQuarters=['Morning','Day','Evening','Night'];
export function injuryProgress(injury:InjuryRecord,clock?:InjuryClock|null){
 if(injury.permanent)return 'Permanent';
 if(injury.status==='healed')return 'Healing confirmed manually';
 if(!injury.sustainedDate.trim()||!injury.sustainedQuarter)return 'Date unknown';
 const duration=Number(injury.duration);
 if(!injury.duration.trim()||!Number.isFinite(duration)||duration<=0||injury.unit==='review')return 'Healing time requires review';
 if(!clock)return 'Campaign clock unavailable';
 const valid=(date:string)=>{const d=namedDate(date);if(!d||d.day<1)return false;const phase=clock.calendar?.phases.find(p=>p.name.toLowerCase()===d.phase.toLowerCase());return d.day<=(phase?.days??45);};
 if(!valid(injury.sustainedDate)||!valid(clock.date))return 'Calendar requires review';
 const days=fantasyDayDistance(injury.sustainedDate,clock.date,clock.calendar);
 if(days===null)return 'Calendar requires review';
 const elapsed=days*4+injuryQuarters.indexOf(clock.quarter)-injuryQuarters.indexOf(injury.sustainedQuarter);
 if(elapsed<0)return 'Clock precedes injury · review required';
 const total=duration*(injury.unit==='days'?4:injury.unit==='hours'?1/6:1);
 const remaining=total-elapsed;
 if(remaining<=0)return 'Healing due · confirm recovery';
 const remainingHours=remaining*6,remainingDays=remainingHours/24;
 const text=remainingHours>=24?`${Number(remainingDays.toFixed(2))} days`:`${Number(remainingHours.toFixed(2))} hours`;
 const dueQuarters=injuryQuarters.indexOf(injury.sustainedQuarter)+total;
 const date=Number.isInteger(dueQuarters)?resolveNamedDate(injury.sustainedDate,clock.calendar,Math.floor(dueQuarters/4)):null;
 return `${text} remaining${date?' · due '+date+' '+injuryQuarters[dueQuarters%4]:''}`;
}
