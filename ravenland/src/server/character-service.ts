import {activeCombat} from './combat/store';
import {animalTemplate,creatureFingerprint} from './creatures/rules';
import {isDeepStrictEqual} from 'node:util';
import {verifiedTalentTypes} from './character-talents';
import {normalizeCharacterSheet} from '../lib/character-data';
import {reconcileCombatSheets} from './combat/lifecycle-store';
import {z} from 'zod';
import {characterSheetSchema,applySheet,sheetFor} from '../lib/character-sheet';
import {getLocalRepository,type SqliteCampaignRepository} from './sqlite';
const command=z.object({campaignId:z.string().uuid(),characterId:z.string().min(1).max(100),before:characterSheetSchema,sheet:characterSheetSchema}).strict();
export function saveCharacter(raw:unknown,repo:SqliteCampaignRepository=getLocalRepository()){
 const c=command.parse(raw),db=repo.db;db.exec('BEGIN IMMEDIATE');try{
  const record=repo.get(c.campaignId);if(!record)throw new Error('Campaign not found');const i=record.session.characters.findIndex(ch=>ch.id===c.characterId);if(i<0)throw new Error('Character not found');
  // Future authenticated ownership policy belongs at this same server boundary.
  const current=sheetFor(record.session.characters[i]),merged={...current} as Record<string,unknown>,before=normalizeCharacterSheet(c.before) as Record<string,unknown>,next=normalizeCharacterSheet(c.sheet) as Record<string,unknown>;
  for(const key of new Set([...Object.keys(before),...Object.keys(next)])){
   if(isDeepStrictEqual(before[key],next[key]))continue;
   if(!isDeepStrictEqual(merged[key],before[key])&&!isDeepStrictEqual(merged[key],next[key]))throw new Error('This character field changed in another window. Reload the saved sheet before editing it again.');
   if(next[key]===undefined)delete merged[key];else merged[key]=next[key];
  }
  const edited=characterSheetSchema.parse(merged);if(record.session.calendarState){for(const next of edited.injuries??[])if(!current.injuries?.some(i=>i.id===next.id)&&(next.sustainedDate||next.sustainedQuarter||next.duration||next.unit!=='review'))throw Error('Establish new injury dates and durations through the Table GM timeline preview.');for(const old of current.injuries??[]){const next=edited.injuries?.find(i=>i.id===old.id);if(!next||['sustainedDate','sustainedQuarter','duration','unit'].some(k=>(old as Record<string,unknown>)[k]!== (next as Record<string,unknown>)[k]))throw Error('Use the Table GM Correct Current Campaign State → Injury timeline metadata preview to correct a dated injury.');}}const live=activeCombat(repo,record.id);for(const actor of live?.combatants.filter(a=>a.companion?.ownerId===c.characterId)??[]){const old=current.creatures?.find(v=>v.id===actor.companion!.creatureId),changed=edited.creatures?.find(v=>v.id===actor.companion!.creatureId);if(!old||!changed||creatureFingerprint(old)!==creatureFingerprint(changed)||JSON.stringify({d:old.damage,status:old.status,armorDamage:old.armorDamage})!==JSON.stringify({d:changed.damage,status:changed.status,armorDamage:changed.armorDamage}))throw new Error('This creature is participating in active combat. Resolve its actual damage and status through the combat procedure.');}for(const creature of edited.creatures??[]){const old=current.creatures?.find(c=>c.id===creature.id);if(creature.origin==='official'&&(!old||creatureFingerprint(old)!==creatureFingerprint(creature)||old.origin!==creature.origin)){const canonical=animalTemplate(repo,record.id,creature.templateId??'');if(creatureFingerprint(creature)!==creatureFingerprint({...creature,...canonical}))throw new Error('Official creature statistics must match their source. Make the record custom for a Table GM ruling.');}if(record.session.characters.some(ch=>ch.id!==c.characterId&&ch.sheet?.creatures?.some(v=>v.id===creature.id)))throw new Error('This creature already belongs to another character; link its existing roles rather than duplicating its identity.');}
  record.session.characters[i]=applySheet(record.session.characters[i],verifiedTalentTypes(repo,record.id,characterSheetSchema.parse(merged)));reconcileCombatSheets(repo,record.id,record.session);const updated=repo.update(record.id,record.revision,record.session);db.exec('COMMIT');return updated;
 }catch(e){db.exec('ROLLBACK');throw e}
}
