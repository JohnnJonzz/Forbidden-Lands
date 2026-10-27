import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {ImageLibrary} from '../src/server/images/library';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {initialSession} from '../src/lib/mock';
import {backupSchema,sessionSchema} from '../src/lib/validation';
import {saveCharacter} from '../src/server/character-service';
import {sheetFor} from '../src/lib/character-sheet';
test('shared image library validates and decodes PNG/JPEG/WebP, strips metadata and creates square thumbnails',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-images-')),repo=new SqliteCampaignRepository(':memory:');try{const record=repo.create(initialSession),library=new ImageLibrary(repo,dir);
 for(const format of ['png','jpeg','webp'] as const){const bytes=await sharp({create:{width:120,height:60,channels:3,background:'#5a4321'}}).toFormat(format).toBuffer();const image=await library.upload(record.id,{bytes,type:format==='jpeg'?'image/jpeg':'image/'+format,name:'portrait.'+format});assert.equal(image.category,'Player Character');assert.equal(image.width,120);assert.equal(image.height,60);const full=await sharp(await library.read(record.id,image.id,false)).metadata(),thumb=await sharp(await library.read(record.id,image.id,true)).metadata();assert.equal(full.format,'webp');assert.equal(full.exif,undefined);assert.equal(thumb.width,256);assert.equal(thumb.height,256)}
 const count=library.list(record.id).length;await assert.rejects(()=>library.upload(record.id,{bytes:Buffer.from('<svg/>'),type:'image/png',name:'fake.png'}),/decoded/);await assert.rejects(()=>library.upload(record.id,{bytes:Buffer.alloc(8*1024*1024+1),type:'image/png',name:'large.png'}),/8 MB/);await assert.rejects(()=>library.upload(record.id,{bytes:Buffer.from('anything'),type:'image/svg+xml',name:'art.svg'}),/PNG/);const wide=await sharp({create:{width:8001,height:1,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(()=>library.upload(record.id,{bytes:wide,type:'image/png',name:'wide.png'}),/8000/);assert.equal(library.list(record.id).length,count);
 }finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
test('deduplicated portraits reuse files, keep character IDs/data, reject stale replacements and survive restart/import',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'raven-portraits-')),db=join(dir,'campaign.sqlite'),images=join(dir,'images');let repo=new SqliteCampaignRepository(db);try{const record=repo.create(initialSession);let library=new ImageLibrary(repo,images);const bytes=await sharp({create:{width:60,height:90,channels:3,background:'#80603a'}}).png().toBuffer(),image=await library.upload(record.id,{bytes,type:'image/png',name:'Hero.png'}),repeat=await library.upload(record.id,{bytes,type:'image/png',name:'Same portrait.png'});assert.equal(repeat.id,image.id);assert.equal(library.list(record.id).length,1);assert.equal(readdirSync(images).length,2);
 const assign=(characterId:string,imageId:string|null,expectedImageId:string|null)=>library.assign({campaignId:record.id,characterId,imageId,expectedImageId});assign('ilva',image.id,null);assign('brom',image.id,null);assert.equal(readdirSync(images).length,2);const saved=repo.get(record.id)!;assert.equal(saved.session.characters[0].id,'ilva');assert.equal(saved.session.characters[1].portraitId,image.id);assert.deepEqual(saved.session.characters[0].sheet,record.session.characters[0].sheet);assert.deepEqual(saved.session.messages,record.session.messages);
 const other=repo.create(initialSession);assert.throws(()=>library.assign({campaignId:other.id,characterId:'ilva',imageId:image.id,expectedImageId:null}),/campaign library/);await assert.rejects(()=>library.read(other.id,image.id,false),/not found/);assert.throws(()=>assign('missing',image.id,null),/Character/);
 assign('ilva',null,image.id);assert.throws(()=>assign('ilva',image.id,image.id),/changed in another window/);assert.equal(library.list(record.id).length,1);assign('ilva',image.id,null);const before=sheetFor(repo.get(record.id)!.session.characters[0]);saveCharacter({campaignId:record.id,characterId:'ilva',before,sheet:{...before,pride:'Portraits preserve other edits'}},repo);assert.equal(repo.get(record.id)!.session.characters[0].portraitId,image.id);
 const expected=repo.get(record.id)!.session;repo.close();repo=new SqliteCampaignRepository(db);library=new ImageLibrary(repo,images);assert.deepEqual(repo.get(record.id)!.session,expected);assert.ok((await library.read(record.id,image.id,true)).length>0);const imported=repo.create(backupSchema.parse({format:'ravenland-campaign',version:1,session:expected}).session);assert.equal(library.list(imported.id)[0].id,image.id);assert.ok((await library.read(imported.id,image.id,false)).length>0);assert.equal(readdirSync(images).length,2);assert.throws(()=>sessionSchema.parse({...expected,characters:[{...expected.characters[0],portraitId:'data:image/png;base64,binary'}]}));
 }finally{repo.close();rmSync(dir,{recursive:true,force:true})}
});
