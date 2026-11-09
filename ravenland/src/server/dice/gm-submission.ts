import {createHash} from 'node:crypto';
import {pendingDiceSchema,type PendingDice} from '../../lib/dice/schema';
import {rollSubmissionSnapshot,type RollGMStatus} from '../../lib/dice/gm-submission';
import {countSuccesses,baneCounts} from '../../lib/dice/engine';
import {planRetrieval} from '../../lib/rules/planner';
import {standardSkill} from '../../lib/rules/character-registry';
import {requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import type {SqliteCampaignRepository} from '../sqlite';
import type {GMTurn} from '../../lib/ai/schema';
import type {CampaignRecord} from '../../lib/types';
import {AIError} from '../ai/config';

export function rollRequestId(campaignId:string,rollId:string){const hex=createHash('sha256').update('ravenland:gm-roll:'+campaignId+':'+rollId).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`}
export function savedRollFingerprint(card:PendingDice){return createHash('sha256').update(rollSubmissionSnapshot(card)).digest('hex')}
export function rollGMStatuses(repo:SqliteCampaignRepository,campaignId:string):RollGMStatus[]{return repo.db.prepare("SELECT id,payload,status,updated_at FROM ai_requests WHERE campaign_id=? AND kind='roll' ORDER BY updated_at DESC").all(campaignId).flatMap(r=>{const rollId=JSON.parse(r.payload as string).rollId;return typeof rollId==='string'&&['running','failed','completed'].includes(r.status as string)?[{rollId,requestId:r.id as string,status:r.status as RollGMStatus['status'],updatedAt:r.updated_at as string}]:[]})}
function verify(card:PendingDice){
 const a=card.original,r=card.result,utility=card.metadata.utility;
 if(a.skill!==r.skill||[...a.artifacts,...r.artifacts].some(d=>d.value>d.sides))throw new AIError('roll_unverified','The saved roll identity or artifact faces cannot be verified.',409);
 if(r.successes!==countSuccesses(r)||a.successes!==countSuccesses(a))throw new AIError('roll_unverified','Saved successes do not match the recorded dice. The roll cannot be submitted.',409);
 if(a.attributeDamage||a.gearDamage||a.willpower)throw new AIError('roll_unverified','The saved initial roll contains inconsistent push consequences.',409);
 if(!r.pushed){if(r.attributeDamage||r.gearDamage||r.willpower||card.gearDamageApplied||card.gearDamageManual||JSON.stringify([a.attribute,a.skillDice,a.gear,a.artifacts,a.negativeSkill])!==JSON.stringify([r.attribute,r.skillDice,r.gear,r.artifacts,r.negativeSkill]))throw new AIError('roll_unverified','The unpushed saved record is inconsistent. No result was invented.',409)}
 else{
  const locked=(before:number[],after:number[],ones:boolean)=>before.length===after.length&&before.every((v,i)=>!(v>=6||ones&&v===1)||v===after[i]);
  const banes=baneCounts(r);if(card.metadata.isArmor||utility||a.negativeSkill!==r.negativeSkill||a.skill!==r.skill||!locked(a.attribute,r.attribute,true)||!locked(a.skillDice,r.skillDice,false)||!locked(a.gear,r.gear,true)||a.artifacts.length!==r.artifacts.length||a.artifacts.some((d,i)=>d.sides!==r.artifacts[i].sides||(d.value===1||d.value>=6)&&d.value!==r.artifacts[i].value)||r.attributeDamage!==banes.attribute||r.gearDamage!==banes.gear||r.willpower>banes.attribute||card.gearDamageApplied+card.gearDamageManual!==r.gearDamage)throw new AIError('roll_unverified','The saved pushed roll or its recorded consequences cannot be verified.',409);
 }
 if(utility&&(r.pushed||r.attribute.length||r.skillDice.length||r.gear.length||r.artifacts.length||utility.kind==='Resource'&&utility.value>utility.sides))throw new AIError('roll_unverified','The saved utility roll cannot be verified.',409);
}
function matchingActions(repo:SqliteCampaignRepository,record:CampaignRecord,card:PendingDice){
 const used=new Set(repo.db.prepare("SELECT context_json FROM ai_requests WHERE campaign_id=? AND kind='roll' AND context_json IS NOT NULL").all(record.id).flatMap(row=>{const p=JSON.parse(row.context_json as string).rollSubmission;return p?.rollId!==card.id&&p?.match?.status==='matched'?[p.match.action.id]:[]}));
 const skill=standardSkill(card.result.skill),weapon=card.result.skill.match(/^Attack:\s*(.+)$/i)?.[1];
 const candidates=card.metadata.utility?[]:repo.db.prepare("SELECT id,payload,context_json,started_at FROM ai_requests WHERE campaign_id=? AND kind='chat' AND status='completed' AND started_at<=? ORDER BY started_at DESC,id DESC LIMIT 30").all(record.id,card.createdAt).flatMap(row=>{
  const c=JSON.parse(row.payload as string);if(c.characterId!==card.characterId||used.has(row.id)||planRetrieval(c.action).intent!=='gameplay_adjudication')return [];
  const ctx=row.context_json?JSON.parse(row.context_json as string):null,p=ctx?.actionPreparation;
  const compatible=weapon?/\b(?:shoot|fire|attack)\b/i.test(c.action)&&c.action.toLowerCase().includes(weapon.toLowerCase()):skill?.id==='marksmanship'?/\b(?:shoot|fire)\b/i.test(c.action):skill?new RegExp('\\b'+skill.name+'\\b','i').test(c.action)||p?.ruleInputs?.skill===skill.id:false;
  return compatible?[{id:row.id as string,declaration:c.action as string,characterId:c.characterId as string}]:[];
 });
 return candidates.length===1?{status:'matched' as const,action:candidates[0],candidates:[]}:{status:candidates.length?'ambiguous' as const:'unmatched' as const,action:null,candidates:candidates.slice(0,5)};
}
export function verifiedRollSubmission(repo:SqliteCampaignRepository,record:CampaignRecord,c:GMTurn,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 if(c.requestId!==rollRequestId(c.campaignId,c.rollId!))throw new AIError('roll_request','Use the stable request identifier for this roll.',409);
 const raw=record.session.dice?.find(d=>d.id===c.rollId);if(!raw)throw new AIError('roll_missing','The saved roll is missing from this campaign. Refresh Recent Dice Rolls.',404);
 const parsed=pendingDiceSchema.safeParse(raw);if(!parsed.success)throw new AIError('roll_unverified','The saved roll record is incomplete or invalid.',409);const card=parsed.data;
 if(card.characterId!==c.characterId)throw new AIError('roll_character','This roll belongs to a different character. Submit it with its original rolling character.',409);
 const character=record.session.characters.find(ch=>ch.id===card.characterId);if(!character)throw new AIError('roll_character','The rolling character is no longer in this campaign.',409);
 if(savedRollFingerprint(card)!==c.rollFingerprint)throw new AIError('roll_stale','The roll changed, possibly because it was pushed. Refresh and submit its current final result.',409);
 if(card.status==='Ready'||card.result.requestId)throw new AIError('roll_activity','Release this legacy activity-bound roll before submitting it independently to the GM.',409);
 verify(card);
 const prior=repo.db.prepare('SELECT context_json FROM ai_requests WHERE campaign_id=? AND id=?').get(record.id,c.requestId),saved=prior?.context_json?JSON.parse(prior.context_json as string).rollSubmission:null;
 const match=saved?.match??matchingActions(repo,record,card);
 return {version:1,rollId:card.id,createdAt:card.createdAt,character:{id:character.id,name:character.name},rollType:card.metadata.utility?.kind??(card.metadata.isArmor?'Armor':card.result.skill.startsWith('Attack: ')?'Attack':'Skill'),label:card.result.skill,original:card.original,result:card.result,successes:card.metadata.utility?null:countSuccesses(card.result),pushed:card.result.pushed,metadata:card.metadata,consequences:{attributeDamage:card.result.attributeDamage,gearDamage:card.result.gearDamage,willpowerGained:card.result.willpower,gearDamageApplied:card.gearDamageApplied,gearDamageManual:card.gearDamageManual,attributeDamageRequiresManualApplication:!card.metadata.attribute&&card.result.attributeDamage>0,alreadyHandledByDiceSystem:true},optionalSuccessAllocation:null,match,stateChangesPermitted:false};
}
export type VerifiedRollSubmission=ReturnType<typeof verifiedRollSubmission>;
export function completedRollReferences(repo:SqliteCampaignRepository,record:CampaignRecord,characterId:string){return repo.db.prepare("SELECT payload,context_json FROM ai_requests WHERE campaign_id=? AND kind='roll' AND status='completed' AND context_json IS NOT NULL ORDER BY updated_at DESC LIMIT 20").all(record.id).flatMap(row=>{const input=JSON.parse(row.payload as string),packet=JSON.parse(row.context_json as string).rollSubmission,card=record.session.dice?.find(d=>d.id===packet?.rollId);if(!packet||packet.character.id!==characterId||!card||savedRollFingerprint(card)!==input.rollFingerprint)return [];return [{rollId:packet.rollId,label:packet.label,successes:packet.successes,pushed:packet.pushed,match:packet.match,consequencesAlreadyHandled:true,optionalSuccessAllocation:null,source:'Verified saved dice submission'}]}).slice(0,3)}
export function rollRulesQuery(packet:VerifiedRollSubmission){const skill=standardSkill(packet.label),topic=skill?.id==='marksmanship'?'Marksmanship ranged attack':skill?.id==='melee'?'Melee attack':packet.rollType==='Attack'?'ranged or melee attack '+packet.label:packet.label;return `Explain the official rules for ${topic}, including success and failure options, push consequences, and fast/slow action economy. Describe optional effects without allocating them.`.slice(0,3000)}
export function rollReference(packet:VerifiedRollSubmission){return `${packet.character.name} submits ${packet.label}: ${packet.successes===null?'utility result recorded':packet.successes+' successes'}${packet.pushed?' (pushed)':''}. Roll ${packet.rollId}. Full details remain in Recent Dice Rolls.`}
