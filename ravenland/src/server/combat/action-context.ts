import type {SqliteCampaignRepository} from '../sqlite';
import {mayReadCharacter,requireCharacterAccess,type CharacterPrincipal} from '../character-access';
import {activeCombat} from './store';
import {AIError} from '../ai/config';
import {recordedWeaponRefs,playerWeaponState,ammunition,weaponReference} from './player-weapons';
import {catalogWeapon} from '../../lib/equipment-catalog';
import {combatWorkflow} from './workflow';
import type {GMTurn} from '../../lib/ai/schema';

export function actionContext(repo:SqliteCampaignRepository,c:GMTurn,principal:CharacterPrincipal|null){
 requireCharacterAccess(principal,c.campaignId,c.characterId);
 const record=repo.get(c.campaignId),e=activeCombat(repo,c.campaignId),ch=record?.session.characters.find(ch=>ch.id===c.characterId),actor=e?.combatants.find(a=>a.id===c.characterId&&a.side==='player');
 if(!record||!e||!ch||!actor)throw new AIError('combat_actor','Choose an authorized character participating in this encounter.',409);
 const choices=recordedWeaponRefs(ch).concat([{index:-1,ref:weaponReference(ch,-1),name:'Unarmed',skill:'melee'}]);
 const weapons=choices.map(w=>{const entry=catalogWeapon(w.name),state=w.index===-1?{reference:w.ref,held:true,ready:false,loaded:false}:playerWeaponState(actor,ch,w.index);return {...w,...state,drawn:state.held,stowed:!state.held,attackTypes:w.index===-1?['punch']:entry?.category==='ranged'?['shoot']:[...(/Edged|Blunt/.test(entry?.features??'')?['slash']:[]),...(/Pointed/.test(entry?.features??'')?['stab']:[])],ammunition:entry?.category==='ranged'?ammunition(ch,{name:w.name,canonicalName:entry.name,skill:'marksmanship'} as Parameters<typeof ammunition>[1]):null};});
 return {
  revision:e.revision,campaignRevision:record.revision,
  input:{playerDeclaration:c.action,encounterId:e.id,actorId:ch.id,
   controlledCharacters:record.session.characters.filter(ch=>mayReadCharacter(principal,c.campaignId,ch.id)).map(ch=>({id:ch.id,name:ch.name})),
   combatants:e.combatants.map(a=>({id:a.id,name:a.name,side:a.side,broken:a.broken,withdrawn:a.withdrawn})),
   positions:{range:e.range,representation:'One shared range; no full zone graph',condition:e.movementCondition??'clear'},
   activeId:e.combatants[e.turn].id,availableActions:{fast:actor.fast,slow:actor.slow},prone:actor.prone,weapons,
   pending:e.pending?{id:e.pending.id,actorId:e.pending.actorId,targets:e.pending.targets,kind:e.pending.kind,phase:e.pending.phase}:null,
   attackChoice:e.actionDraft?.characterId===ch.id?{...e.actionDraft,weaponRef:weapons.find(w=>w.index===e.actionDraft!.weaponIndex)?.ref}:null,
   workflow:combatWorkflow(e,record.session.characters),
   supportedActions:['move','draw_weapon','ready_weapon','load_weapon','prepare_attack','end_turn','declare_defense','stand','clarify']
  }
 };
}
export type ActionContext=ReturnType<typeof actionContext>['input'];
