import {loadCombatRules,citation} from './sources';
import {catalogWeapon} from '../../lib/equipment-catalog';
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
 const saved=ch.sheet?.weapons?.[index];if(saved?.destroyed||saved?.current==='0'&&Number(saved.gearBonus)>0)throw new AIError('weapon_broken','This weapon is broken and cannot be used until repaired.',409);
 if(saved?.current!==undefined&&Number(saved.gearBonus)===official.bonus){const modifier=verifiedWeaponModifier(repo,record,characterId,index);return {...official,name:w.name,bonus:w.bonus,skillModifier:modifier.amount,modifierSources:modifier.sources};}
 if(w.bonus===official.bonus)return {...official,name:w.name};
 let bonus=official.bonus;
 for(const card of record.session.dice??[]){
  if(card.characterId!==characterId||card.metadata.weaponIndex!==index||!card.result.pushed||!card.gearDamageApplied||!card.weaponSnapshot)continue;
  let snapshot;try{snapshot=JSON.parse(card.weaponSnapshot)}catch{continue}
  if(snapshot.name!==w.name||snapshot.skill!==w.skill||Number(snapshot.dmg)!==official.damage||Number(snapshot.current??snapshot.bonus)!==bonus)continue;
  try{verifiedRollSubmission(repo,record,{campaignId:record.id,characterId,kind:'roll',action:'',requestId:rollRequestId(record.id,card.id),rollId:card.id,rollFingerprint:savedRollFingerprint(card)},principal)}catch(error){if(error instanceof AIError)continue;throw error}
  bonus=Math.max(0,bonus-card.gearDamageApplied);
  if(bonus===w.bonus)return {...official,name:w.name,bonus};
 }
 return fail();
}

function verifiedWeaponModifier(repo:SqliteCampaignRepository,record:CampaignRecord,characterId:string,index:number){
 const ch=record.session.characters.find(c=>c.id===characterId)!,w=ch.sheet!.weapons![index],requested=Number(w.bonus??0);if(!Number.isInteger(requested)||Math.abs(requested)>10)throw new AIError('weapon_modifier','Invalid additional weapon modifier.',409);
 const entry=catalogWeapon(w.name??''),key=entry?.id??'';
 const talent=key.includes('axe')?'Axe Fighter':['dagger','knife','throwing-knife'].includes(key)?'Knife Fighter':key.includes('spear')||['pike','halberd','trident'].includes(key)?'Spear Fighter':['shortsword','broadsword','longsword','two-handed-sword','scimitar','falchion'].includes(key)?'Sword Fighter':entry?.category==='melee'&&/Blunt/.test(entry.features)?'Hammer Fighter':key.includes('bow')?'Sharpshooter':null;
 const saved=ch.sheet?.talents?.find(t=>t.name?.toLowerCase()===talent?.toLowerCase());let amount=0;const sources=[];
 if(saved&&Number(saved.rank)>=1){if(Number(saved.rank)>1)throw new AIError('talent_review','This talent rank has additional mechanical effects requiring its dedicated procedure or review.',409);const p=loadCombatRules(repo,record.id).handbook.find(p=>{const text=p.text.replace(/-\s+/g,'').replace(/\s+/g,' '),patterns:Record<string,RegExp>={'Axe Fighter':/RANK 1:.*attack rolls are modified by.*\+1.*axe/i,'Knife Fighter':/RANK 1:.*attack rolls are modified by.*\+1.*knife.*dagger/i,'Hammer Fighter':/RANK 1:.*get \+1 to all attack rolls with.*BLUNT melee weapon/i,'Spear Fighter':/RANK 1:.*get \+1 when you attack with.*spear.*pike.*halberd.*trident/i,'Sword Fighter':/RANK 1:.*attack and PARRY rolls are.*modified by \+1.*sword/i,'Sharpshooter':/RANK 1:.*attack rolls are modified.*by \+1 when you SHOOT a bow or a crossbow/i};return text.toLowerCase().includes(talent!.toLowerCase())&&patterns[talent!]!.test(text);});if(!p)throw new AIError('talent_evidence','Restore the official talent procedure before applying its modifier.',409);amount=1;sources.push(citation(p));}
 if(requested!==0&&requested!==amount)throw new AIError('weapon_modifier','The additional Bonus is not established by a supported applicable talent. Review it before calculating a combat pool.',409);
 return {amount,sources};
}
