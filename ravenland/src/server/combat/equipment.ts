import type {CombatWeapon} from '../../lib/combat/types';
import type {CampaignRecord} from '../../lib/types';
import type {SqliteCampaignRepository} from '../sqlite';
import type {CharacterPrincipal} from '../character-access';
import {verifiedRollSubmission,rollRequestId,savedRollFingerprint} from '../dice/gm-submission';
import {mechanicalCharacter} from '../mechanical-character';
import {AIError} from '../ai/config';

// Read saved push wear, rather than resetting current Gear Bonus to the book or
// charging damage again. Arbitrary modifiers still require adjudication.
export function verifiedCombatWeapon(repo:SqliteCampaignRepository,record:CampaignRecord,characterId:string,index:number,official:CombatWeapon,principal:CharacterPrincipal|null):CombatWeapon{
 const ch=record.session.characters.find(c=>c.id===characterId)!,w=mechanicalCharacter(ch).weapons[index];
 const fail=()=>{throw new AIError('combat_weapon','Recorded weapon values differ from the official entry without matching saved push wear. Resolve modifiers before combat calculation.',409)};
 if(w.damage!==official.damage||w.bonus===null||w.bonus<0||w.bonus>official.bonus)return fail();
 if(w.bonus===official.bonus)return {...official,name:w.name};
 let bonus=official.bonus;
 for(const card of record.session.dice??[]){
  if(card.characterId!==characterId||card.metadata.weaponIndex!==index||!card.result.pushed||!card.gearDamageApplied||!card.weaponSnapshot)continue;
  let snapshot;try{snapshot=JSON.parse(card.weaponSnapshot)}catch{continue}
  if(snapshot.name!==w.name||snapshot.skill!==w.skill||Number(snapshot.dmg)!==official.damage||Number(snapshot.bonus)!==bonus)continue;
  try{verifiedRollSubmission(repo,record,{campaignId:record.id,characterId,kind:'roll',action:'',requestId:rollRequestId(record.id,card.id),rollId:card.id,rollFingerprint:savedRollFingerprint(card)},principal)}catch(error){if(error instanceof AIError)continue;throw error}
  bonus=Math.max(0,bonus-card.gearDamageApplied);
  if(bonus===w.bonus)return {...official,name:w.name,bonus};
 }
 return fail();
}
