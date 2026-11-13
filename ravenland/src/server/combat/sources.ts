import type {SqliteCampaignRepository} from '../sqlite';
import {AIError} from '../ai/config';
import {weaponRow,hitThresholdRule} from '../sourcebooks/mechanical-facts';
import type {SourcePassage} from '../../lib/sourcebooks/schema';
import type {CombatSource,CombatWeapon,EnemyTemplate,MonsterAttack,CombatRange} from '../../lib/combat/types';
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const number=(s:string)=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12}[s.toLowerCase()]??(/^\d+$/.test(s)?Number(s):null));
export const citation=(p:SourcePassage):CombatSource=>({documentId:p.documentId,chunkId:p.chunkId,page:p.startPage,title:p.title});
// Private application retrieval. Never expose these page bodies through player
// search/context APIs, and never change the source's visibility to use it.
export function combatPages(repo:SqliteCampaignRepository,campaignId:string,book:'handbook'|'guide'){
 const rows=repo.db.prepare("SELECT c.id AS chunkId,c.document_id AS documentId,d.title,d.category,c.start_page AS startPage,c.end_page AS endPage,c.sequence,c.text,c.heading,d.original_filename FROM source_chunks c JOIN source_documents d ON d.id=c.document_id WHERE d.campaign_id=? AND d.status='Indexed' AND d.category IN ('Rules','Bestiary') ORDER BY d.id,c.sequence LIMIT 1600").all(campaignId) as unknown as (SourcePassage&{original_filename:string})[];
 const selected=rows.filter(p=>normalize(p.title+' '+p.original_filename).includes(book==='handbook'?'playershandbook':'gamemastersguide'));
 const ids=[...new Set(selected.map(p=>p.documentId))];if(ids.length!==1)throw new AIError('combat_sources','Combat requires exactly one indexed official fifth-printing '+(book==='handbook'?"Player’s Handbook":"Gamemaster’s Guide")+' in this campaign. Resolve missing or ambiguous editions in Rules Library.',409);
 const pages=new Map<number,SourcePassage>();for(const p of selected){const old=pages.get(p.startPage);if(!old){pages.set(p.startPage,{...p});continue}let overlap=Math.min(300,old.text.length,p.text.length);while(overlap>0&&old.text.slice(-overlap)!==p.text.slice(0,overlap))overlap--;old.text+=overlap?p.text.slice(overlap):'\n'+p.text}
 return [...pages.values()];
}
export function loadCombatRules(repo:SqliteCampaignRepository,campaignId:string){
 const overrides=repo.db.prepare("SELECT override_scope FROM curated_rules WHERE campaign_id=? AND document_type='House Rule' AND override_scope<>''").all(campaignId);if(overrides.some(r=>/combat|attack|damage|defen[cs]e|armor|initiative|monster|melee|shoot/i.test(r.override_scope as string)))throw new AIError('combat_house_rule','A scoped combat house rule needs explicit adjudication before automated combat. Official rules will not silently override it.',409);
 const handbook=combatPages(repo,campaignId,'handbook'),guide=combatPages(repo,campaignId,'guide');
 const requirePage=(pages:SourcePassage[],pattern:RegExp,label:string)=>{const p=pages.find(p=>pattern.test(p.text.replace(/-\s+/g,'').replace(/\s+/g,' ')));if(!p)throw new AIError('combat_evidence','The indexed official source does not establish '+label+'. No mechanic was assumed.',409);return p};
 const initiative=requirePage(handbook,/ten cards, numbered 1 through 10.*Number 1 acts first/i,'initiative'),actions=requirePage(handbook,/one slow action and one fast action.*two fast actions/i,'action allowance'),timing=requirePage(handbook,/defender must declare.*DODGE.*PARRY.*before you roll/i,'defense timing'),melee=requirePage(handbook,/SLASH\s*:.*STAB:.*GRAPPLE:/i,'distinct melee actions'),shoot=requirePage(handbook,/SHOOT:\s*Slow action.*MARKSMANSHIP.*For every additional.*damage increases by one/i,'automatic SHOOT damage'),armor=requirePage(handbook,/Every x x you roll decreases the damage by one.*Natural armor is not degraded/i,'armor'),broken=requirePage(handbook,/attribute score reaches zero.*Broken/i,'Broken status'),monster=requirePage(guide,/monster attack is a slow action.*cannot be pushed/i,'monster attacks'),monsterDefense=requirePage(guide,/monster attacks can.t be PARRIED.*can be DODGED/i,'monster defense restrictions');
 const hit=handbook.find(p=>hitThresholdRule(p)?.fact.value===1);if(!hit)throw new AIError('combat_evidence','The official success threshold could not be established.',409);
 return {handbook,guide,sources:[initiative,actions,timing,melee,shoot,armor,broken,monster,monsterDefense,hit].map(citation)};
}
export function officialWeapon(pages:SourcePassage[],name:string):CombatWeapon{
 const aliases:Record<string,string>={'long bow':'Longbow','short bow':'Short Bow','two-handed axe':'Two- Handed Axe'};name=aliases[name.toLowerCase()]??name;
 for(const p of pages){const row=weaponRow(p,name);if(!row.damage||!row.gearBonus||!row.range)continue;
 const start=p.text.toLowerCase().indexOf(name.toLowerCase()),line=p.text.slice(start,start+180),features=['Edged','Blunt','Pointed','Parrying'].filter(f=>new RegExp('\\b'+f+'\\b','i').test(line.split(/\n(?=[A-Z][a-z])/)[0]??''));
 return {name,skill:/RANGED WEAPONS/.test(p.text)?'marksmanship':'melee',bonus:Number(row.gearBonus.value),damage:Number(row.damage.value),range:String(row.range.value),features:features.join(', '),source:citation(p),ready:true,loaded:false};
 }
 throw new AIError('combat_equipment','Official equipment statistics could not be verified for '+name+'.',409);
}
function shieldBonus(pages:SourcePassage[]){for(const p of pages){if(!/SHIELDS/.test(p.text))continue;const m=p.text.match(/Large Shield\s*\+?(\d+)/i);if(m)return {value:Number(m[1]),source:citation(p)}}throw new AIError('combat_equipment','The official Large Shield bonus is not established.',409)}
function attributes(text:string){const result:Record<string,number>={};for(const m of text.matchAll(/\b(STRENGTH|AGILITY|WITS|EMPATHY)\s+(\d+)/gi))result[m[1].toLowerCase()]=Number(m[2]);return result}
function skills(text:string){const out:Record<string,number>={};for(const [name,id] of [['Melee','melee'],['Marksmanship','marksmanship'],['Move','move'],['Scouting','scouting'],['Endurance','endurance'],['Survival','survival'],['Might','might']] as const){const m=text.replace(/-\s+/g,'').match(new RegExp('\\b'+name+'\\s+(\\d+)','i'));if(m)out[id]=Number(m[1])}return out}
function rating(pages:SourcePassage[],name:string){for(const p of pages){if(!/ARMOR & HELMETS/.test(p.text))continue;const m=p.text.match(new RegExp('(?:^|\\n)'+name+'\\s+(\\d+)\\s+\\d+\\s+(?:Body|Head)','i'));if(m)return {value:Number(m[1]),source:citation(p)}}throw new AIError('combat_equipment','Armor rating is not established for '+name+'.',409)}
export function lookupEnemy(repo:SqliteCampaignRepository,campaignId:string,query:string,generated=false):EnemyTemplate{
 const rules=loadCombatRules(repo,campaignId),name=query.trim().replace(/s$/i,''),n=normalize(query),npcName=['Bandit','Soldier','Rider','Thief'].find(x=>normalize(x)===n||normalize(x+'s')===n);
 if(generated){
  const p=rules.guide.find(p=>/typical human being has 3 in all at-?\s*tributes/i.test(p.text));if(!p)throw new AIError('combat_evidence','The official NPC generation baseline is unavailable.',409);
  return {name:query,kind:'humanoid',origin:'generated',attributes:{strength:3,agility:3,wits:3,empathy:3},skills:{},weapons:[officialWeapon(rules.handbook,'Dagger')],armor:0,helmet:0,naturalArmor:false,shield:0,talents:[],movement:null,attacks:[],specialRules:[],sources:[citation(p)],notes:['Generated human: official human attribute baseline; untrained skills, no talents or armor; GM-selected verified dagger. Not a published named stat block.']};
 }
 if(npcName){const p=rules.guide.find(p=>/TYPICAL NPCS/.test(p.text)&&new RegExp('\\b'+npcName+'\\b').test(p.text));if(!p)throw new AIError('combat_evidence','Official '+npcName+' statistics could not be retrieved.',409);
  const section=p.text.slice(p.text.indexOf(npcName+' ')).split(/\n(?:Bandit|Soldier|Rider|Thief)\s/)[0],a=attributes(section);if(Object.keys(a).length!==4)throw new AIError('combat_evidence','The NPC attribute row is incomplete.',409);
  // Choose one published alternative, never merge all alternatives into equipment.
  const weapons=npcName==='Thief'?['Dagger','Sling']:npcName==='Rider'?['Broadsword','Dagger']:npcName==='Soldier'?['Broadsword','Longbow']:['Broadsword','Sling'];
  for(const w of weapons)if(!normalize(section).includes(normalize(w)))throw new AIError('combat_evidence','The selected equipment is not in the published NPC row.',409);
  const shield=npcName==='Soldier'?shieldBonus(rules.handbook):null,body=rating(rules.handbook,npcName==='Rider'?'Studded Leather':'Leather'),helmet=npcName==='Rider'||npcName==='Soldier'?rating(rules.handbook,'Open Helmet'):null;
  return {name:npcName,kind:'humanoid',origin:'official',attributes:a,skills:skills(section),weapons:weapons.map(w=>officialWeapon(rules.handbook,w)),armor:body.value,helmet:helmet?.value??0,naturalArmor:false,shield:shield?.value??0,talents:[],movement:null,attacks:[],specialRules:[],sources:[citation(p),body.source,...(helmet?[helmet.source]:[]),...(shield?[shield.source]:[])],notes:['Equipment selected from the published alternatives; unlisted skills are untrained. No unlisted talent is assumed.']};
 }
 // Exact supported headings anchor the record; adjoining pages supply the table
 // and statistics. Names are identifiers, never a substitute for source data.
 const keys:Record<string,string>={graybear:'GR AY BEAR',minotaur:'MINOTAUR',nightwarg:'NIGHTWARGS',nightwargs:'NIGHTWARGS',drakewyrm:'DR AKEW YRM'};
 const heading=keys[n]??keys[normalize(name)];if(!heading)throw new AIError('combat_lookup','No supported, complete official enemy entry was found. Try Bandit, Soldier, Rider, Thief, Gray Bear, Minotaur, Nightwarg, or Drakewyrm; unsupported entries require review, not invented stats.',409);
 const intro=rules.guide.find(p=>p.text.includes('\n'+heading+'\n'));if(!intro)throw new AIError('combat_lookup','The official monster entry is not indexed.',409);
 const pages=rules.guide.filter(p=>p.startPage>=intro.startPage&&p.startPage<=intro.startPage+1),text=pages.map(p=>p.text).join('\n'),a=attributes(text),armor=text.match(/ARMOR RATING:\s*(\d+)/i),movement=text.match(/MOVEMENT(?: RATE)?:\s*(\d+)/i),tablePage=pages.find(p=>/MONSTER ATTACKS\s+D6\s+ATTACK/.test(p.text));
 if(!a.strength||!armor||!tablePage)throw new AIError('combat_evidence','The official monster attributes, armor or attack table are incomplete.',409);
 const attacks:MonsterAttack[]=[],table=tablePage.text.split(/MONSTER ATTACKS\s+D6\s+ATTACK/)[1];
 for(let face=1;face<=6;face++){const m=table.match(new RegExp('(?:^|\\n)'+face+'\\s+([A-Z][A-Z !/-]+!)\\s+([\\s\\S]*?)(?=\\n'+(face+1)+'\\s+[A-Z]|$)'));if(!m)throw new AIError('combat_evidence','Incomplete monster attack table; no attack invented.',409);
  const procedure=m[2].split(/\n(?:ATTRIBUTES:|Some say|John Hadley|leyman)/)[0].replace(/-\s+/g,'').replace(/\s+/g,' ').trim(),dice=procedure.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) Base Dice/i),damage=procedure.match(/Weapon Damage (?:of )?(\d+)/i),effects:string[]=[],review:string[]=[];
  if(/prone|felled to the ground|thrown to the ground/i.test(procedure))effects.push('prone');if(/thrown.*NEAR/i.test(procedure))effects.push('thrown to Near');if(/become\s+COLD/i.test(procedure))effects.push('cold');if(/GRAPPLED/i.test(procedure))effects.push('grappled; Break Free required');
  const fear=/fear attack/i.test(procedure);if(fear&&!rules.handbook.some(p=>/fear attack is rolled/.test(p.text)))review.push('Official fear procedure is unavailable.');
  if(/extra attack|subsequent|every round|half of|devour|MOVE roll|highest|nearest/i.test(procedure))review.push('Conditional, targeting, armor bypass or follow-on procedure requires explicit adjudication.');
  if((!damage&&!fear&&!/Damage according to the weapon/i.test(procedure))||!dice)review.push('A complete automatic attack pool/damage is not established.');
  attacks.push({key:String(face),name:m[1].trim().replace(/!$/,''),dice:dice?number(dice[1]):null,damage:damage?Number(damage[1]):fear?0:/Damage according to the weapon/i.test(procedure)&&/TYPICAL GEAR:/.test(text)?officialWeapon(rules.handbook,text.match(/TYPICAL GEAR:\s*([^\n]+)/i)![1].trim()).damage:null,damageAttribute:fear?'wits':'strength',ignoreArmor:/ignoring three points of armor/.test(procedure)?3:0,range:/within\s+NEAR/.test(procedure)?'Near':'Arm',targets:/all (?:targets|adventurers)|everyone/i.test(procedure)?'all':/two .*adventurers/i.test(procedure)?'two':'one',parry:!fear&&/(?:can|may) be PARRIED/.test(procedure)&&!/(?:cannot|can't) be PARRIED/.test(procedure),dodge:!fear&&!/(?:cannot|can't) be DODGED/.test(procedure),effects,procedure,review,source:citation(tablePage)});
 }
 return {name:query,kind:'monster',origin:'official',attributes:a,skills:skills(text),weapons:[],armor:Number(armor[1]),helmet:0,naturalArmor:true,shield:0,talents:[],movement:movement?Number(movement[1]):null,attacks,specialRules:[...text.matchAll(/(?:FERAL RAGE|ETHEREAL FORM|DRAWN TO GLITTER):[\s\S]*?(?=MONSTER ATTACKS|$)/g)].map(m=>m[0].replace(/\s+/g,' ').slice(0,1400)),sources:pages.map(citation),notes:['Published monster attack table; complex entries pause for source-backed adjudication. No player statistics are changed.']};
}
