import type {consequenceContext} from './context';
import type {executeConsequenceRoll} from './rolls';
export function urgentConsequence(context:ReturnType<typeof consequenceContext>){const c=context.focus;return c&&['life','mandatory'].includes(c.urgency)?c:null;}
// This validates outcome claims; it does not parse commands or choose actions.
// The model supplies atmosphere, NPC intentions and judgment, while procedures
// and completed results remain application-controlled.
export function guardConsequenceNarration(text:string,context:ReturnType<typeof consequenceContext>,result:ReturnType<typeof executeConsequenceRoll>|null){
 const focus=urgentConsequence(context),pendingLife=context.open.some(c=>c.category==='lethal_injury');
 const contradiction=pendingLife&&/\b(?:you|he|she|the patient) (?:dies|is dead|has died|is healed|has recovered|is saved|is rescued)|\b(?:wound heals|treatment succeeds|bleeds out|you wake up|(?:treatment|aid) saves (?:you|the patient))\b/i.test(text);
 const unverifiedTime=pendingLife&&/\b(?:round|minute|hour|day)s?\b[^.!?]{0,45}\b(?:pass(?:ed|es)?|elaps(?:ed|es)|consumed)\b|\b(?:counts? as|takes?|took|spends?|spent)\s+(?:(?:one|two|three|four|a|an|\d+)\s+)?(?:round|minute|hour|day)s?\b/i.test(text);
 const unsupportedChange=pendingLife&&/\b(?:takes? your|steals? your|empties? your|deducted|consumed|spent your|you are now captive|you have been rescued)\b/i.test(text);
 let prose=contradiction||unsupportedChange||unverifiedTime?focus?.description??'The recorded consequence remains unresolved.':text;
 if(result&&!prose.includes(result.summary))prose+='\n\n'+result.summary;
 if(focus&&!prose.includes(focus.nextProcedure))prose+='\n\n'+focus.nextProcedure;
 return prose;
}
