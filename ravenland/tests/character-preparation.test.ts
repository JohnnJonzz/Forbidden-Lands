import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {initialSession} from '../src/lib/mock';
import type {CharacterSheet} from '../src/lib/character-sheet';
import {characterSheetSchema} from '../src/lib/character-sheet';
import {standardSkills,standardAttributes,standardSkill,validateScopedSkill} from '../src/lib/rules/character-registry';
import {prepareAction} from '../src/server/action-preparation';
import {AIService} from '../src/server/ai/service';
import {assembleContext} from '../src/server/ai/context';
import {principalForToken,requestPrincipal,playerAccessConfigured,requireCharacterAccess,type CharacterPrincipal} from '../src/server/character-access';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {CompendiumStore} from '../src/server/compendium/store';
import {retrieveRules} from '../src/server/sourcebooks/retrieval';
const declaration='I shoot the bandit with my longbow.';
function sheet(current='3',skill='2'):CharacterSheet{return {'attr-agility':current,'attr-agility-regular':'4','skill-marksmanship':skill,'cond-hungry':false,'cond-thirsty':false,'cond-sleepy':false,'cond-cold':false,talents:[],weapons:[{name:'Longbow',bonus:'2',dmg:'1',range:'Long',skill:'marksmanship',artifact:'None',equipped:true}],'dark-secret':'PRIVATE_CHARACTER_SECRET'}}
function fixture(){const repo=new SqliteCampaignRepository(':memory:'),s=structuredClone(initialSession);s.characters[0].sheet=sheet();s.characters[1].sheet=sheet('2','4');s.characters[1].sheet!['dark-secret']='OTHER_PLAYER_SECRET';const r=repo.create(s),id=r.id,actor=s.characters[0].id,other=s.characters[1].id,principal:CharacterPrincipal={playerId:'player-one',grants:[{campaignId:id,characterIds:[actor]}]},doc=randomUUID();
 repo.db.prepare("INSERT INTO source_documents(id,campaign_id,title,original_filename,file_size,sha256,storage_key,page_count,uploaded_at,status,category,visibility) VALUES (?,?,?,?,?,?,?,?,?,'Indexed','Rules','Public Rules')").run(doc,id,"Player's Handbook — original synthetic fixture",'test.pdf',100,doc,doc+'.pdf',4,'fixture');
 for(const [i,text] of [
  'MARKSMANSHIP (AGILITY)\nSynthetic skill reference: this marksmanship skill uses Agility. A ranged attack uses a roll for MARKSMANSHIP. Consult the actual source for procedure.',
  'DICE POOLS\nSynthetic skill roll procedure: roll Base Dice equal to the attribute, Skill Dice equal to skill level, and Gear Dice for gear bonus. These are combined for a skill roll.',
  'RANGED WEAPONS\nWeapon Gear Bonus Damage Range\nLongbow +2 1 Long\nOriginal synthetic fixture.',
  'RANGED COMBAT\nREADY WEAPON: Fast action. Ready the synthetic weapon before use.\nAIM: Fast action. Review the aiming procedure before applying bonuses.\nSHOOT: Slow action. Roll for MARKSMANSHIP and the weapon’s Gear Bonus. Review defenses and damage separately.'
 ].entries())repo.db.prepare('INSERT INTO source_chunks VALUES (?,?,?,?,?,?,?)').run(randomUUID(),doc,i,i+1,i+1,text,text.split('\n')[0]);
 return {repo,id,actor,other,principal,input:{campaignId:id,characterId:actor,declaration},change(fn:(s:typeof r.session)=>void){const r=repo.get(id)!;fn(r.session);repo.update(id,r.revision,r.session)}};
}
test('one canonical official registry excludes professions and invented skills; scoped extensions stay separate',()=>{
 assert.equal(standardAttributes.length,4);assert.equal(standardSkills.length,16);assert.equal(standardSkill('Marksmanship')?.attribute,'agility');assert.equal(standardSkill('Animal Handling')?.id,'animalhandling');
 assert.equal(standardSkill('Navigation'),null);assert.equal(standardSkill('Hunter'),null);assert.equal(validateScopedSkill({id:'house:navigation',name:'Navigation',attribute:'wits',origin:'house-rule',sourceReference:'Reviewed campaign exception'}),true);assert.equal(standardSkill('Navigation'),null);
 assert.equal(validateScopedSkill({id:'house:marksmanship',name:'Marksmanship',attribute:'wits',origin:'house-rule',sourceReference:'Not an official rename'}),false);
 assert.equal(characterSheetSchema.safeParse({'skill-navigation':'5'}).success,false);
});
test('prepare the saved current Agility + Marksmanship + equipped Longbow bonus without any write',async()=>{
 const f=fixture();try{const before=f.repo.get(f.id),changes=f.repo.db.prepare('SELECT total_changes() AS n').get()!.n,p=prepareAction(f.repo,f.input,f.principal);
 assert.equal(p.status,'ready',JSON.stringify(p.missing));assert.deepEqual(p.basePool,{base:3,skill:2,gear:2,total:7});assert.equal(p.ruleInputs.skill,'marksmanship');assert.equal(p.ruleInputs.attribute,'agility');assert.ok(p.sources.length);assert.equal(p.stateChangesPermitted,false);assert.ok(!JSON.stringify(p).includes('PRIVATE_CHARACTER_SECRET'));assert.ok(!JSON.stringify(p).includes('OTHER_PLAYER_SECRET'));
 assert.equal(f.repo.db.prepare('SELECT total_changes() AS n').get()!.n,changes);assert.deepEqual(f.repo.get(f.id),before);
 }finally{f.repo.close()}
});
test('different authorized characters use their own saved values, never another actor or browser defaults',()=>{
 const f=fixture();try{const principal:CharacterPrincipal={playerId:'player-two',grants:[{campaignId:f.id,characterIds:[f.other]}]};const p=prepareAction(f.repo,{...f.input,characterId:f.other},principal);assert.deepEqual(p.basePool,{base:2,skill:4,gear:2,total:8});assert.equal(p.character.id,f.other)}finally{f.repo.close()}
});
test('missing weapon and ambiguous rows are unresolved; readiness flags remain advisory',()=>{
 for(const change of [(s:CharacterSheet)=>{s.weapons=[]},(s:CharacterSheet)=>{s.weapons!.push({...s.weapons![0]})}]){
  const f=fixture();try{f.change(s=>change(s.characters[0].sheet!));const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'needs_review');assert.equal(p.characterInputs.weapon,null);assert.equal(p.basePool,null)}finally{f.repo.close()}
 }
});
test('a recorded Longbow needs no Equipped flag for a verified read-only base pool',()=>{for(const equipped of [undefined,false]){const f=fixture();try{f.change(s=>{s.characters[0].sheet!.weapons![0].equipped=equipped});const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'ready');assert.deepEqual(p.basePool,{base:3,skill:2,gear:2,total:7})}finally{f.repo.close()}}});
test('incomplete attributes and skills remain unknown rather than receiving sheet defaults',()=>{
 const f=fixture();try{f.change(s=>{s.characters[0].sheet={'attr-agility':'','skill-marksmanship':''}});const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.characterInputs.attribute,null);assert.equal(p.characterInputs.skill,null);assert.equal(p.basePool,null);assert.equal(p.status,'needs_review');f.change(s=>{delete s.characters[0].sheet});assert.equal(prepareAction(f.repo,f.input,f.principal).basePool,null)}finally{f.repo.close()}
});
test('invalid skills, talents, artifacts, conditions and modified bonuses require review without invented modifiers',()=>{
 for(const change of [(s:CharacterSheet)=>{s.weapons![0].skill='Navigation'},(s:CharacterSheet)=>{s.talents=[{name:'Path of the Arrow',rank:'2',desc:'INJECTED PRIVATE BONUS +99'}]},(s:CharacterSheet)=>{s['cond-cold']=true},(s:CharacterSheet)=>{s.weapons![0].artifact='D8'},(s:CharacterSheet)=>{s.weapons![0].bonus='1'}]){
  const f=fixture();try{f.change(s=>change(s.characters[0].sheet!));const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'needs_review');assert.ok(!JSON.stringify(p).includes('INJECTED'));assert.ok((p.basePool?.total??0)<=7)}finally{f.repo.close()}
 }
 const f=fixture();try{for(const skill of ['Navigation','Hunter'])assert.equal(prepareAction(f.repo,{...f.input,skill},f.principal).status,'needs_review')}finally{f.repo.close()}
});
test('authorization precedes all character access; cross-campaign or forged identities cannot prepare actions',async()=>{
 const f=fixture();try{const before=f.repo.get(f.id),changes=f.repo.db.prepare('SELECT total_changes() AS n').get()!.n;assert.throws(()=>prepareAction(f.repo,f.input,null),/Connect player access/);assert.throws(()=>prepareAction(f.repo,{...f.input,characterId:f.other},f.principal),/not authorized/);assert.throws(()=>prepareAction(f.repo,{...f.input,campaignId:randomUUID()},f.principal),/not authorized/);await assert.rejects(()=>new AIService(f.repo).run({campaignId:f.id,characterId:f.actor,kind:'chat',requestId:randomUUID(),action:declaration}),/Connect player access/);assert.equal(f.repo.db.prepare('SELECT total_changes() AS n').get()!.n,changes);assert.deepEqual(f.repo.get(f.id),before)}finally{f.repo.close()}
});
test('only a server-configured opaque credential resolves ownership; context excludes other players and secrets',()=>{
 const f=fixture(),old=process.env.RAVENLAND_PLAYER_GRANTS,token='LOCAL_TEST_PLAYER_TOKEN_AT_LEAST_32_CHARACTERS';try{process.env.RAVENLAND_PLAYER_GRANTS=JSON.stringify([{...f.principal,tokenHash:createHash('sha256').update(token).digest('hex')}]);assert.equal(principalForToken(token)?.playerId,f.principal.playerId);assert.equal(requestPrincipal(new Request('http://localhost',{headers:{'x-player-id':f.principal.playerId}})),null);assert.equal(principalForToken('wrong'.repeat(10)),null);const configured=process.env.RAVENLAND_PLAYER_GRANTS;const duplicate=JSON.parse(configured!);process.env.RAVENLAND_PLAYER_GRANTS=JSON.stringify([duplicate[0],{...duplicate[0],playerId:'another-player'}]);assert.throws(()=>principalForToken(token),/configuration requires administrator review/);process.env.RAVENLAND_PLAYER_GRANTS=configured;
 const denied=assembleContext(f.repo,f.id,declaration,{characterId:f.actor});assert.equal(denied.retrievalContext.actor,null);assert.ok(!('attributes'in denied.party[0]));
 const owned=assembleContext(f.repo,f.id,declaration,{characterId:f.actor,principal:f.principal});assert.equal(owned.retrievalContext.actor?.skills['skill-marksmanship'],2);assert.ok(!JSON.stringify(owned).includes('PRIVATE_CHARACTER_SECRET'));assert.ok(!JSON.stringify(owned).includes('OTHER_PLAYER_SECRET'));
 }finally{if(old===undefined)delete process.env.RAVENLAND_PLAYER_GRANTS;else process.env.RAVENLAND_PLAYER_GRANTS=old;f.repo.close()}
});
test('keyword-only pool overviews cannot establish the additive dice procedure',()=>{
 const f=fixture();try{f.repo.db.prepare("UPDATE source_chunks SET text='DICE POOLS Base Dice Skill Dice Gear Dice attribute skill level. Original synthetic overview with no quantitative procedure.' WHERE heading='DICE POOLS'").run();const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.ruleInputs.poolRuleVerified,false);assert.equal(p.basePool,null);assert.equal(p.status,'needs_review')}finally{f.repo.close()}
});
test('a verified explicitly scoped house Gear Bonus keeps its authority and source label',()=>{
 const f=fixture();try{new CompendiumStore(f.repo).save(f.id,{title:'Longbow Gear Bonus exception',body:'Longbow: Gear Bonus 3.',topic:'Combat',documentType:'House Rule',visibility:'Player Visible',sourceReference:'Original synthetic house rule',overrideScope:'Longbow Gear Bonus'});f.change(s=>{s.characters[0].sheet!.weapons![0].bonus='3'});const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'ready',JSON.stringify(p.missing));assert.equal(p.ruleInputs.gearBonusOrigin,'house-rule');assert.equal(p.basePool?.gear,3);assert.ok(p.sources.some(s=>s.sourceType==='house-rule'))}finally{f.repo.close()}
});
test('unauthorized actor identifiers cannot leak talent names into retrieval plans',()=>{
 const f=fixture();try{f.change(s=>{s.characters[0].sheet!.talents=[{name:'PRIVATE_TALENT_TOKEN',rank:'1'}]});const r=retrieveRules(f.repo,f.id,declaration,'chat',{characterId:f.actor,diagnostics:true});assert.ok(!JSON.stringify(r).includes('PRIVATE_TALENT_TOKEN'));assert.ok(!r.planner?.plan.requirements.some(r=>r.id==='exceptions'))}finally{f.repo.close()}
});
test('the GM reference path rejects invented skills and keeps multi-word official skill names',async()=>{
 const f=fixture();try{const provider={async generate(){throw Error('Invented skill must not reach model generation')},async test(){throw Error('No model call')}};
  for(const name of ['Navigation','Hunter']){const reply=await new AIService(f.repo,provider).run({campaignId:f.id,characterId:f.actor,kind:'chat',requestId:randomUUID(),action:'Explain the '+name+' skill.'});assert.equal(reply.provider,'application');assert.match(reply.narration,/not an official Forbidden Lands skill/);assert.deepEqual(reply.actions,[])}
  assert.equal(retrieveRules(f.repo,f.id,'Explain the Animal Handling skill.','chat').planner?.plan.entry?.name,'Animal Handling');
 }finally{f.repo.close()}
});
test('owning a character cannot authorize GM-only rule passages or replace missing evidence with presets',()=>{
 const f=fixture();try{f.repo.db.prepare("UPDATE source_documents SET visibility='GM Only'").run();const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'needs_review');assert.equal(p.ruleInputs.weaponGearBonus,null);assert.equal(p.basePool,null);assert.deepEqual(p.sources,[])}finally{f.repo.close()}
});
test('conditional house bonuses cannot be activated by merely storing the larger number',()=>{
 const f=fixture();try{new CompendiumStore(f.repo).save(f.id,{title:'Conditional Longbow Gear Bonus',body:'Longbow: Gear Bonus 3 when you spend Willpower.',topic:'Combat',documentType:'House Rule',visibility:'Player Visible',sourceReference:'Original synthetic conditional rule',overrideScope:'Longbow Gear Bonus'});f.change(s=>{s.characters[0].sheet!.weapons![0].bonus='3'});const p=prepareAction(f.repo,f.input,f.principal);assert.equal(p.status,'needs_review');assert.equal(p.ruleInputs.weaponGearBonus,null);assert.equal(p.basePool,null)}finally{f.repo.close()}
});

test('access setup distinguishes empty, configured and invalid configuration without treating GM review as ownership',()=>{
 const f=fixture(),before=process.env.RAVENLAND_PLAYER_GRANTS,reviewBefore=process.env.RAVENLAND_GM_REVIEW_TOKEN,review='LOCAL_ADMIN_REVIEW_TEST_CREDENTIAL_AT_LEAST_32';
 try{process.env.RAVENLAND_GM_REVIEW_TOKEN=review;
  for(const empty of ['', '  ', '[]']){process.env.RAVENLAND_PLAYER_GRANTS=empty;assert.equal(playerAccessConfigured(),false);assert.equal(principalForToken(review),null);assert.throws(()=>requireCharacterAccess(null,f.id,f.actor),/No character grants are configured/)}
  process.env.RAVENLAND_PLAYER_GRANTS=JSON.stringify([{...f.principal,tokenHash:createHash('sha256').update('TEST_SCOPED_PLAYER_CREDENTIAL_AT_LEAST_32').digest('hex')}]);assert.equal(playerAccessConfigured(),true);assert.equal(requestPrincipal(new Request('http://localhost',{headers:{'x-ravenland-gm-token':review}})),null);assert.equal(principalForToken(review),null);assert.throws(()=>requireCharacterAccess(null,f.id,f.actor),/Campaign Settings/);
  process.env.RAVENLAND_PLAYER_GRANTS='not valid JSON';assert.throws(()=>playerAccessConfigured(),/configuration requires administrator review/);
 }finally{if(before===undefined)delete process.env.RAVENLAND_PLAYER_GRANTS;else process.env.RAVENLAND_PLAYER_GRANTS=before;if(reviewBefore===undefined)delete process.env.RAVENLAND_GM_REVIEW_TOKEN;else process.env.RAVENLAND_GM_REVIEW_TOKEN=reviewBefore;f.repo.close()}
});
