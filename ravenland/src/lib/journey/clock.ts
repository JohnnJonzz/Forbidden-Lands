import type {Quarter} from '../types';
export const quarters:Quarter[]=['Morning','Day','Evening','Night'];
export const calendarReview='Fantasy month lengths and year boundaries are unverified. Named dates retain their original label plus elapsed-day offsets. ISO dates use explicitly civil Gregorian arithmetic, not a claimed Forbidden Lands calendar.';
export function nextDate(date:string):string{
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const parsed=new Date(date+'T12:00:00Z');if(!Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===date){parsed.setUTCDate(parsed.getUTCDate()+1);return parsed.toISOString().slice(0,10)}}
 const match=/^(.*?) \(\+(\d+) days?\)$/.exec(date);const offset=match?Number(match[2])+1:1;return `${match?match[1]:date} (+${offset} ${offset===1?'day':'days'})`;
}
export function advanceQuarter(date:string,quarter:Quarter){const index=quarters.indexOf(quarter);if(index<0)throw new Error('Invalid quarter');return {date:index===3?nextDate(date):date,quarter:quarters[(index+1)%4]}}
