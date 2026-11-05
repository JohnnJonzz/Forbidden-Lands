// Match the campaign's existing Recent Dice Rolls display timezone.
export const aiTimestamp=(at:string)=>new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(at))+' CT';
