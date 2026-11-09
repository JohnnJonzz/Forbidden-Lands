import {weaponRequest,type WeaponFactRequest,type WeaponField} from './weapon-request';
import {sourceRequest} from './source-request';
import {mechanicalTopics,requestedSubjects,type MechanicalTopic} from './topics';
export type RequestIntent='rules_reference'|'gameplay_adjudication'|'adventure_narration'|'general_conversation';
export type RetrievalDomain='equipment'|'character_rules'|'combat'|'journeying'|'magic'|'adventure_sites'|'generic';
export interface SourceRequirement {
 fact?:{kind:'weapon';weapon:string;fields:WeaponField[]}|{kind:'extra_damage'}|{kind:'first_hit'};id:string;label:string;query:string;role:'governing'|'supporting';
 // Each group requires at least one source-content term. These are retrieval
 // vocabulary, not a canonical skill list or executable game rules.
 anchors:string[];contentGroups:string[][];topic?:MechanicalTopic;
}
export interface RetrievalPlan {
 weaponFacts?:WeaponFactRequest;sourcePreference:'any'|'pdf_only';sourceTitle?:string;pageReference?:{kind:'printed'|'physical';value:number};version:1;intent:RequestIntent;modes:RequestIntent[];profile:RetrievalDomain;secondaryDomains:RetrievalDomain[];
 subjects:string[];requirements:SourceRequirement[];sourceCategories:string[];campaignContext:string[];
 optionalExceptions:string[];characterDataNeeded:boolean;stateChangesPermitted:false;proposalsPermitted:boolean;explanationOnly:boolean;
 entry?:{name:string;category:string};maxTargetedRetries:1;
}
const mechanical=/\b(?:rules?|mechanic\w*|skills?|attributes?|professions?|kin|talents?|equipment|push\w*|dice|rolls?|combat|shoot\w*|melee|ranged|attacks?|damage|gear|weapons?|injur\w*|broken|banes|encumbrance|armou?r|hunt\w*|forag\w*|fish\w*|journey\w*|camp|hike|spell\w*|magic|willpower|conditions?|rest|sleep|climb\w*|craft\w*|trade)\b/i;
const declaration=/\b(?:I|we)\s+(?:(?:will|want to|try to|attempt to)\s+)?(?:shoot|attack|hunt|forage|fish|hike|cast|climb|parry|dodge|repair|craft|roll|push|make camp)\b/i;
const explanation=/\b(?:explain|describe|compare|contrast|summari[sz]e|how|what|which|when|rules? for|walk.*through|tell me|I want to know|hypothetical|can I|can we|does|could I)\b/i;
const referenceCommand=/(?:^|[,.;:])\s*(?:please\s+)?(?:find|identify|locate|list)\b/i;
const site=/\b(?:enter|explore|examine|investigate|inspect|room|altar|doorway|laboratory|site|dungeon|ruins|what do (?:I|we) see)\b/i;
const noAction=/\b(?:do not|don't|without)\s+(?:perform|do|roll|advance|resolve|take|execute)\b/i;
function req(id:string,label:string,query:string,anchors:string[],contentGroups:string[][]=[],role:SourceRequirement['role']='supporting',topic?:MechanicalTopic):SourceRequirement{return {id,label,query,anchors,contentGroups,role,...(topic?{topic}:{})}}
export function planRetrieval(action:string,kind='chat'):RetrievalPlan {
 const declared=declaration.test(action)&&!noAction.test(action),reference=(mechanical.test(action)||requestedSubjects(action).length>0)&&(explanation.test(action)||referenceCommand.test(action)||/\?/.test(action))&&!declared;
 const narration=site.test(action)&&!reference,modes:RequestIntent[]=kind!=='chat'?['general_conversation']:declared?['gameplay_adjudication',...(narration?['adventure_narration' as const]:[])]:reference?['rules_reference']:narration?['adventure_narration']:['general_conversation'];
 if(declared&&explanation.test(action))modes.push('rules_reference');
 const intent=modes[0],readonly=intent==='rules_reference'||noAction.test(action);
 const entryMatch=action.match(/\b([\p{L}][\p{L}-]{1,35})\s+(profession|kin)\b/iu)??action.match(/\b([\p{L}][\p{L}-]{1,35})\s+(skill)\b/iu)??action.match(/\bskills?\s+(?:does|of)\s+(?:a |an |the )?([\p{L}][\p{L}-]{1,35})\b/iu),entry=entryMatch&&!/^(?:a|an|the|this|that|their|our|your|my|its|any|each|relevant|applicable|basic|specific|official|listed|required|character|characters|which|what|how|all)$/i.test(entryMatch[1])?{name:entryMatch[1],category:entryMatch[2]??'profession'}:undefined;
 const domains:RetrievalDomain[]=[];
 if(entry||/\b(?:skills?|attributes?|professions?|kin|talents?|equipment)\b/i.test(action)&&!declared)domains.push('character_rules');
 if(/\b(?:combat|shoot\w*|melee|ranged|attacks?|parry|dodge|longbow)\b/i.test(action))domains.push('combat');
 if(!entry&&/\b(?:hunt\w*|forag\w*|fish\w*|journey\w*|quarter.day|hike|camp|travel\w*)\b/i.test(action))domains.push('journeying');
 if(/\b(?:magic|spells?|spellcasting|cast|willpower)\b/i.test(action))domains.push('magic');
 if(narration)domains.push('adventure_sites');
 const facts=readonly?weaponRequest(action):null;if(facts){domains.unshift('equipment')}
 const profile=domains[0]??'generic',requirements:SourceRequirement[]=[];
 const topics=requestedSubjects(action);
 if(facts){
  for(const weapon of facts.weapons)requirements.push({...req('weapon:'+weapon,weapon+' equipment facts',weapon+' ranged weapons gear bonus damage range',[weapon],[],'governing'),fact:{kind:'weapon',weapon,fields:facts.fields}});
  if(facts.extraSuccessRule){requirements.push({...req('extra-damage','Extra-success damage rule','extra additional success increase damage ranged attack',[],[],'governing'),fact:{kind:'extra_damage'}});requirements.push({...req('first-hit','Successes needed to hit','sixes succeed success action',[],[],'supporting'),fact:{kind:'first_hit'}})}
 }else if(entry)requirements.push(req('entry',`${entry.name} ${entry.category}`,`${entry.name} ${entry.category} ${entry.category==='skill'?'roll test':'skills key attribute'}`,[entry.name],entry.category==='skill'?[[entry.name],['skill','roll','test','check','attribute','success','failure']]:[[entry.category,'skills','skill'],['skills','skill']],'governing'));
 else if(profile==='journeying'){
  const activities=topics.filter(t=>['forage','hunt','fish','journey','quarter','navigation','camp','recovery'].includes(t));
  for(const t of activities)requirements.push(req(t,mechanicalTopics[t].label,mechanicalTopics[t].terms,[mechanicalTopics[t].label,...mechanicalTopics[t].terms.split(' ')],[mechanicalTopics[t].terms.split(' ')],'governing',t));
  if(/\b(?:terrain|season|equipment|weather|modifier)\b/i.test(action))requirements.push(req('journey-modifiers','Applicable journey modifiers','journey terrain season equipment weather modifiers',['journey','terrain','season','weather','equipment'],[['modifier','modifiers','exception','exceptions'],['terrain','season','equipment','weather']]));
  if(!activities.length)requirements.push(req('journey','Journey activity','journey quarter day activities',['journey','activities'],[['activity','activities','quarter']],'governing','journey'));
  if(topics.includes('hunt')){
   requirements.push(req('hunt-search','Hunting search check','hunting survival search',['hunt','hunting','survival'],[['survival'],['search','find','track','roll','test','check']]));
   if(/\b(?:bow|hunt\w*)\b/i.test(action))requirements.push(req('hunt-attack','Hunting attack check','hunting marksmanship bow attack',['hunt','hunting','marksmanship'],[['marksmanship'],['attack','shoot','roll','test','check']]));
  }
  requirements.push(req('quarter','Quarter-day compatibility','quarter day activity restrictions compatible',['quarter','activities'],[['quarter'],['activities','activity','compatible','restrictions']]));
  if(!/\bcompare\b/i.test(action))requirements.push(req('mishaps','Activity mishaps and outcomes','journey hunting foraging fishing mishap resource outcomes',['mishap','hunt','forag','fish'],[['mishap','mishaps','failure'],['outcome','outcomes','food','water','resource','resources','failure']]));
 }else if(profile==='combat'){
  const ranged=/\b(?:shoot\w*|ranged|bow|longbow|marksmanship)\b/i.test(action),t=ranged?'ranged':'melee';
  const actionNames=[...new Set([...action.matchAll(/\b(?:ready weapon|aim|shoot)\b/gi)].map(m=>m[0].toLowerCase()))],namedActions=readonly&&actionNames.length>1?actionNames:[];
  for(const name of namedActions)requirements.push(req('action:'+name,name,name+' fast slow action',[name],[['fast action','slow action']],'governing'));
  if(!namedActions.length){requirements.push(req(t,mechanicalTopics[t].label,mechanicalTopics[t].terms,[ranged?'ranged':'melee',ranged?'marksmanship':'close combat'],[[ranged?'marksmanship':'melee'],['attack','attacks','roll','pool','procedure']],'governing',t));requirements.push(req('actions','Action economy','fast slow actions combat',['combat','action','actions'],[['action','actions'],['fast','slow','cost']],'supporting','actions'));}
  if(declared)requirements.push(req('pool','Applicable attack pool',ranged?'marksmanship agility ranged attack pool':'melee strength attack pool',['attack','marksmanship','melee'],[[ranged?'marksmanship':'melee'],['attribute','agility','strength','pool','dice']]));
  const weapon=action.match(/\bwith\s+(?:my |a |the |an )?([\p{L}-]+)(?:\s|[.!?]|$)/iu)?.[1];
  if(weapon)requirements.push(req('weapon','Declared weapon: '+weapon,weapon+' weapon range bonus damage',[weapon],[[weapon],['range','bonus','damage','gear','weapon']]));
  if(declared||/\b(?:range|modifier)\b/i.test(action))requirements.push(req('range','Range and situational modifiers','ranged range modifiers cover distance',['ranged','range','modifier'],[['range','distance'],['modifier','modifiers','cover','penalty','bonus']]));
  for(const t of topics.filter(t=>['defense','damage','armor','injuries','initiative'].includes(t)))requirements.push(req(t,mechanicalTopics[t].label,mechanicalTopics[t].terms,[mechanicalTopics[t].label,...mechanicalTopics[t].terms.split(' ')],[mechanicalTopics[t].terms.split(' ')],'supporting',t));
 }else if(profile==='magic'){
  requirements.push(req('magic','Spellcasting fundamentals','spellcasting willpower power level',['magic','spellcasting'],[['spell','spellcasting'],['willpower','power level','rank']],'governing','magic'));
  const discipline=action.match(/\b([\p{L}-]+)\s+(?:magic|discipline)\b/iu)?.[1];if(discipline&&!/^(?:the|a|of|does|how|explain)$/i.test(discipline))requirements.push(req('discipline','Requested magical discipline: '+discipline,discipline+' magic discipline',[discipline],[[discipline],['magic','spell','discipline']],'governing'));
  const spell=action.match(/\b(?:cast|spell called|spell named)\s+([\p{L} -]{2,50}?)(?:[.!?]|$)/iu)?.[1]?.trim();
  if(spell)requirements.push(req('spell','Declared spell: '+spell,spell+' spell rank', [spell],[[spell],['rank','power','range','duration']],'governing'));
  requirements.push(req('magic-mishaps','Spellcasting exceptions and mishaps','spellcasting discipline rank mishap',['magic','spellcasting','mishap'],[['mishap','mishaps'],['spell','spellcasting','discipline']]));
 }else if(profile==='character_rules'){
  for(const t of topics)requirements.push(req(t,mechanicalTopics[t].label,mechanicalTopics[t].terms,[mechanicalTopics[t].label,...mechanicalTopics[t].terms.split(' ')],[mechanicalTopics[t].terms.split(' ')],'governing',t));
  if(!requirements.length){const category=action.match(/\b(skills?|attributes?|professions?|kin|talents?|equipment)\b/i)?.[1]??'reference';requirements.push(req('character-reference',category,action.slice(0,350),[category],[[category]],'governing'))}
 }else if(profile!=='adventure_sites'&&intent!=='general_conversation'){
  for(const t of topics)requirements.push(req(t,mechanicalTopics[t].label,mechanicalTopics[t].terms,[mechanicalTopics[t].label,...mechanicalTopics[t].terms.split(' ')],[mechanicalTopics[t].terms.split(' ')],'governing',t));
  if(!requirements.length)requirements.push(req('generic','Governing action or rule',action.slice(0,350),action.match(/\b(?:climb\w*|repair\w*|craft\w*|trade)\b/gi)??['rule'],[['roll','check','test','skill','procedure']],'governing'));
 }
 if(narration)requirements.push(req('site','Current party-known site description','',[],[],'governing'));
 const characterDataNeeded=declared||/\b(?:my|our|this character)\b/i.test(action),campaignContext=profile==='adventure_sites'||modes.includes('adventure_narration')?['current location','party-known discoveries','approved campaign modifications','established room/NPC/event state','journal']:profile==='journeying'?['clock','terrain','weather','quarter-day assignments']:declared?['current situation','conditions']:[];
 const preference=sourceRequest(action);
 return {...(facts?{weaponFacts:facts}:{}),sourcePreference:readonly&&preference.pdfOnly?'pdf_only':'any',...(readonly&&preference.sourceTitle?{sourceTitle:preference.sourceTitle}:{}),...(preference.pageReference?{pageReference:preference.pageReference}:{}),version:1,intent,modes,profile,secondaryDomains:domains.slice(1),subjects:entry?[entry.name]:topics.map(t=>mechanicalTopics[t].label),requirements:[...new Map(requirements.map(r=>[r.id,r])).values()].slice(0,10),sourceCategories:profile==='adventure_sites'?['Adventure','Campaign Reference']:readonly&&preference.pdfOnly?['Rules','Bestiary','House Rules']:['Rules','Bestiary','House Rules','Curated Official Rules Summary'],campaignContext,optionalExceptions:characterDataNeeded?['applicable saved talents','current conditions','carried equipment']:[],characterDataNeeded,stateChangesPermitted:false,proposalsPermitted:!readonly&&intent!=='general_conversation',explanationOnly:readonly,...(entry?{entry}:{}),maxTargetedRetries:1};
}
