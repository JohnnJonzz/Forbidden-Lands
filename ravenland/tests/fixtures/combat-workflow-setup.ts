import {officialWeapon,loadCombatRules} from '../../src/server/combat/sources';
import {readFileSync} from 'node:fs';
import {SqliteCampaignRepository} from '../../src/server/sqlite';
import {SourcebookLibrary} from '../../src/server/sourcebooks/library';
import {FileSourcebookStorage} from '../../src/server/sourcebooks/storage';
import {initialSession} from '../../src/lib/mock';
(async()=>{
 const repo=new SqliteCampaignRepository(process.env.RAVENLAND_DB_PATH!),s=structuredClone(initialSession),names=['Edrus Braveheart','Rose Thorn','Brom Stonehand','Ilva Ashborn'];
 s.messages=[];for(const [i,c] of s.characters.entries()){c.name=names[i];c.sheet={'attr-strength':i===1?'3':'4','attr-strength-regular':'4','attr-agility':'3','attr-agility-regular':'3','attr-wits':'3','attr-wits-regular':'3','attr-empathy':'3','attr-empathy-regular':'3','skill-move':'2','skill-melee':'2','skill-marksmanship':'2','res-arrows':'12','armor-worn':false,'helmet-worn':false,weapons:[{name:'Longbow',bonus:'2',dmg:'1',range:'Long',skill:'marksmanship'}]}}
 if(process.env.RAVENLAND_NARRATIVE_COMBAT_TEST==='1'){s.campaign.location='The narrow stairwell';s.messages=[{id:'scene-established',role:'gm',author:'The Game Master',text:'Rose waits below the stairs with the recovered evidence. She remains a bystander while Edrus faces the bandit.'}];s.characters[0].sheet!.weapons!.push({name:'Falchion',bonus:'1',dmg:'2',range:'Arm',skill:'melee',feat:'Edged, Pointed'})}
 if(process.env.RAVENLAND_SETUP_FIDELITY_TEST==='1')s.campaign.location='The Hollow Watch';
 const r=repo.create(s),library=new SourcebookLibrary(repo,new FileSourcebookStorage(process.env.RAVENLAND_DB_PATH+'.books'));
 for(const [filename,title,visibility] of [['Forbidden_Lands_Players_Handbook_5th_printing.pdf',"Forbidden Lands Player's Handbook",'Public Rules'],['Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf',"Forbidden Lands Gamemaster's Guide",'GM Only']] as const){const bytes=readFileSync(process.env.RAVENLAND_REAL_SOURCEBOOK_DIR+'/'+filename),doc=await library.upload(r.id,{title,category:'Rules',visibility},filename,new ReadableStream({start(c){c.enqueue(bytes);c.close()}}));if((await library.index(r.id,doc.document.id)).status!=='Indexed')throw Error('Real PDF indexing failed')}
 if(process.env.RAVENLAND_SETUP_FIDELITY_TEST==='1'){const current=repo.get(r.id)!,w=officialWeapon(loadCombatRules(repo,r.id).handbook,'Dagger');current.session.characters[0].sheet!.weapons=[{name:w.name,bonus:String(w.bonus),dmg:String(w.damage),range:'Arm',skill:'melee',feat:w.features}];current.session.characters[0].sheet!.willpower='0';repo.update(r.id,current.revision,current.session)}
 console.log(JSON.stringify({id:r.id,characters:r.session.characters.map(c=>({id:c.id,name:c.name}))}));repo.close();
})().catch(e=>{console.error(e);process.exitCode=1});
