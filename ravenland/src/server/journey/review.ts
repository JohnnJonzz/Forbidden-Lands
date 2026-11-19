import {expeditionFor,navigationContext} from '../../lib/journey/expedition';
import type {SqliteCampaignRepository} from '../sqlite';
import {publicQuarterPacket} from '../../lib/journey/chat-engine';
import {sheetFor,applySheet} from '../../lib/character-sheet';
import type {Session} from '../../lib/types';
import {combatPages,citation} from '../combat/sources';
import {SqliteMapStore} from '../map/store';
import {AIError} from '../ai/config';
const attributes=['strength','agility','wits','empathy'] as const;
export function restReview(s:Session,entryId:string){
 const view=publicQuarterPacket(s,entryId),resting=view.entry.assignments.filter(a=>['Rest','Sleep'].includes(a.activity));
 return resting.map(a=>{const ch=s.characters.find(c=>c.id===a.characterId);if(!ch)return {characterId:a.characterId,name:a.characterName,missing:['Character no longer in party'],changes:[]};const sheet=sheetFor(ch),missing:string[]=[],changes:{attribute:string;before:number;after:number}[]=[];
 for(const attr of attributes){const current=sheet[`attr-${attr}`],base=sheet[`attr-${attr}-regular`];if(typeof current!=='string'||typeof base!=='string'||!/^\d+$/.test(current)||!/^\d+$/.test(base)||Number(current)>Number(base))missing.push('Review '+attr+' current/base values');else if(Number(current)===0)missing.push('Broken '+attr+' requires its recovery procedure before quarter-day Rest recovery');else if(Number(current)<Number(base))changes.push({attribute:attr,before:Number(current),after:Number(base)});}
 for(const [key,value] of Object.entries(sheet))if(key.startsWith('cond-')&&value===true)missing.push('Review active '+key.slice(5)+' condition; its recovery restrictions are not inferred');
 return {characterId:ch.id,name:ch.name,missing,changes};});
}
export function applyReviewedRest(repo:SqliteCampaignRepository,id:string,s:Session,entryId:string){
 const review=restReview(s,entryId);if(!review.length)throw new AIError('rest_activity','This activity contains no Rest or Sleep assignment; recovery is not applicable.',409);if(review.some(r=>r.missing.length))throw new AIError('rest_review',review.flatMap(r=>r.missing.map(m=>r.name+': '+m)).join('; '),409);
 const house=repo.db.prepare("SELECT override_scope FROM applicable_curated_rules WHERE campaign_id=? AND document_type='House Rule'").all(id).some(r=>/rest|sleep|recover|heal|journey/i.test(String(r.override_scope)));
 const pdf=repo.db.prepare("SELECT 1 FROM source_chunks c JOIN applicable_source_documents d ON d.id=c.document_id WHERE d.campaign_id=? AND d.category='House Rules' AND (lower(c.text) LIKE '%recovery%' OR lower(c.text) LIKE '%rest%') LIMIT 1").get(id);
 if(house||pdf)throw new AIError('rest_house_rule','Review the applicable Rest/recovery house rule before automatic recovery.',409);
 const pages=combatPages(repo,id,'handbook').map(p=>({...p,text:p.text.replace(/-\s+/g,'').replace(/\s+/g,' ')})),recovery=pages.find(p=>/recover all[\s\S]{0,140}remaining lost attribute points/i.test(p.text)),rest=pages.find(p=>/REST is[\s\S]{0,80}interrupted/i.test(p.text));if(!recovery||!rest)throw new AIError('rest_evidence','Restore the Handbook Rest and further-recovery evidence before applying recovery.',409);
 for(const r of review){const ch=s.characters.find(c=>c.id===r.characterId)!,sheet=sheetFor(ch);for(const c of r.changes)sheet[`attr-${c.attribute}` as 'attr-strength']=String(c.after);s.characters=s.characters.map(c=>c.id===ch.id?applySheet(c,sheet):c);}
 return {review,sources:[citation(recovery),citation(rest)]};
}
export function reviewQuarter(repo:SqliteCampaignRepository,id:string,entryId:string){const record=repo.get(id);if(!record)throw new AIError('not_found','Campaign not found',404);const packet=publicQuarterPacket(record.session,entryId),rest=restReview(record.session,entryId);const target=packet.entry.traveling?new SqliteMapStore(repo).lookupForCampaign(id,packet.entry.destination):null;return {expedition:expeditionFor(record.session,entryId),navigationCheck:navigationContext(record.session),encounters:repo.db.prepare('SELECT id,state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at DESC LIMIT 20').all(id).map(r=>{const e=JSON.parse(String(r.state_json));return {id:String(r.id),name:e.sceneLocation,status:e.status,hex:e.sceneHex}}).filter(e=>e.hex===record.session.campaign.hex),revision:record.revision,packet,rest,travel:target?{destination:target.coordinate,terrain:target.terrain,waterways:target.waterways,routes:target.routes,review:'Review the actual Handbook terrain/mode rate, river crossing, visibility, encumbrance, encounters and mishaps. Saved roll success alone does not establish arrival.'}:null,next:packet.status==='Completed'?'This activity is complete. Plan '+record.session.campaign.quarter+'.':packet.entry.traveling?'Review actual terrain, travel rate, recorded outcomes, encounters and ending hex before confirming completion.':'Confirm uninterrupted Rest eligibility and review any other activities, then complete this exact submission. No recovery or time has been applied by review.'};}
