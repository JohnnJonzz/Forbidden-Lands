import type {Session} from '../types';
import type {ChatCommand} from './chat-schema';
import type {JourneyGeography} from './engine';
import {expeditionFor,navigationContext,verifyRoute,visitedHexes,type RoutePlan} from './expedition';
export function applyExpeditionCommand(s:Session,c:ChatCommand,geo:JourneyGeography,now:string,verifiedPlan?:RoutePlan):boolean{
 if(!['quarter-chat-plan-route','quarter-chat-enter-hex','quarter-chat-expedition-review'].includes(c.type))return false;
 if(!('entryId' in c))throw Error('Submitted journey required');const entry=s.dayTracker!.find(e=>e.id===c.entryId)!,p=expeditionFor(s,c.entryId),updates=s.chatJourney!.updates;
 const add=(patch:Partial<typeof updates[number]>)=>updates.push({id:c.actionId,entryId:c.entryId,kind:'expedition_review',text:'',at:now,...patch});
 if(c.type==='quarter-chat-plan-route'){const checked=verifyRoute(s,c.entryId,c.review,geo,verifiedPlan?.allowance),plan=verifiedPlan??{...c.review,...checked,rulingId:null,ruleFingerprint:'pure-engine-test'};add({kind:'route',text:c.review.conditions,routePlan:plan});if(!p.entries.length){const a=entry.assignments.find(a=>a.activity==='Lead the Way'),roll=s.dice?.find(r=>r.id===a?.rollId);if(roll&&plan.route[0]===entry.destination&&(!roll.journeyContext||roll.journeyContext.entryId===entry.id&&roll.journeyContext.hex===plan.route[0]&&roll.journeyContext.modifier===plan.navigationModifier)&&!s.chatJourney!.updates.some(u=>u.entryReceipt?.navigationRollId===roll.id)){roll.journeyContext=navigationContext(s)??undefined;}}return true;}
 if(!p.plan||!p.routeId)throw Error('Review and confirm the per-hex route for this submitted journey first.');
 if(c.type==='quarter-chat-expedition-review'){
  if(c.kind==='mishap')throw Error('Mishap review must use the source-backed server adapter.');
  if(c.kind==='encounter'&&!['none','encounter','resolved'].includes(c.result))throw Error('Choose a quarter-day encounter result.');
  const priorMishap=p.reviews.filter(r=>r.kind==='mishap'&&r.result==='held').at(-1);add({text:c.reason,expeditionReview:{...(c.kind==='resume'&&priorMishap?.navigationRollId?{navigationRollId:priorMishap.navigationRollId}:{}),kind:c.kind,result:c.kind==='interruption'?'held':c.result,encounterId:c.encounterId,...(c.kind==='interruption'?{limit:p.entries.length}:{})}});return true;
 }
 if(c.type!=='quarter-chat-enter-hex')throw Error('Unsupported route command');
 if(c.routeId!==p.routeId||c.step!==p.nextStep)throw Error('This route step changed or was already entered. Refresh the saved journey.');
 if(p.interrupted)throw Error('Resolve the journey interruption before entering another hex.');
 if(!p.nextHex||p.nextStep>=p.limit)throw Error('No reviewed movement allowance remains this quarter-day.');
 if(p.entries.length&&!p.encounter)throw Error('Review the quarter-day encounter check and current consequences before continuing; Keep Watch success is not proof that no encounter occurred.');
 const from=p.entries.at(-1)?.hex??entry.from,target=p.nextHex;if(s.campaign.hex!==from||!geo.adjacent(from,target))throw Error('Current position/route no longer supports this step.');
 const visited=visitedHexes(s).has(target),leader=entry.assignments.find(a=>a.activity==='Lead the Way')!;
 if(visited){if(c.navigationRollId)throw Error('This recorded visited-hex return needs no new navigation roll; select the visited exception.');}
 else{const roll=s.dice?.find(r=>r.id===c.navigationRollId&&r.characterId===leader.characterId),context=navigationContext(s);if(!roll||roll.metadata.utility||roll.result.skill!=='Survival'||!context||JSON.stringify(roll.journeyContext)!==JSON.stringify(context))throw Error('Select a saved Survival roll bound to this journey, route step, hex and reviewed modifier.');if(updates.some(u=>u.entryReceipt?.navigationRollId===roll.id))throw Error('A navigation roll cannot authorize another hex.');if(roll.result.successes<1&&!p.reviews.some(r=>(r.kind==='mishap'&&r.result==='resolved'||r.kind==='resume'&&r.result==='resume')&&r.navigationRollId===roll.id))throw Error('Resolve the failed navigation roll and its recorded D66 mishap before movement.');roll.status='Submitted';roll.submittedAt=now;}
 const h=geo.lookup(target)!;Object.assign(s.campaign,{hex:target,terrain:h.terrain??'',location:h.printedFeatures.length===1?h.printedFeatures[0]:target});if(s.exploration)s.exploration.explored=[...new Set([...s.exploration.explored,from,target])];
 add({kind:'entered',text:c.adjudication,entryReceipt:{routeId:p.routeId,step:c.step,from,hex:target,navigationRollId:c.navigationRollId,visitedException:visited,modifier:p.plan.navigationModifier,adjudication:c.adjudication}});
 s.journal.push({id:c.actionId+':entry',title:'Journey entered '+target,text:`${entry.date} · ${entry.quarter} · ${from} → ${target}\n${visited?'Recorded visited-hex exception':'Saved Survival roll '+c.navigationRollId}\n${c.adjudication}\nThe quarter remains pending; no additional quarter-day was charged.`});return true;
}
