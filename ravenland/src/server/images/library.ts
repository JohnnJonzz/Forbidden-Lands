import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,link,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
import {z} from 'zod';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import type {LibraryImage} from '../../lib/images';
export const imageIdSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const campaignIdSchema=z.string().uuid();
export const maxImageBytes=8*1024*1024;
export class ImageLibrary {
 constructor(readonly repo:SqliteCampaignRepository=getLocalRepository(),readonly directory=process.env.RAVENLAND_IMAGE_DIR||join(dirname(process.env.RAVENLAND_DB_PATH||join(process.cwd(),'data/ravenland.sqlite')),'images')){}
 private campaign(id:string){campaignIdSchema.parse(id);if(!this.repo.get(id))throw new Error('Campaign not found');/* Future authenticated campaign membership check belongs here, including image reads. */}
 list(campaignId:string):LibraryImage[]{this.campaign(campaignId);return (this.repo.db.prepare('SELECT a.id,a.width,a.height,a.created_at AS createdAt,c.name,c.category FROM image_assets a JOIN campaign_images c ON c.image_id=a.id WHERE c.campaign_id=? ORDER BY a.created_at DESC,a.id').all(campaignId) as unknown as LibraryImage[])}
 async upload(campaignId:string,file:{bytes:Buffer;type:string;name:string}):Promise<LibraryImage>{
  this.campaign(campaignId);if(!file.bytes.length||file.bytes.length>maxImageBytes)throw new Error('Images must be between 1 byte and 8 MB');
  const formats:Record<string,string>={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'};if(!formats[file.type])throw new Error('Choose a PNG, JPEG or WebP image');
  let full:Buffer,thumb:Buffer,width:number,height:number;
  try{const input=sharp(file.bytes,{limitInputPixels:20_000_000,failOn:'warning'}),meta=await input.metadata();if(meta.format!==formats[file.type]||(meta.pages??1)>1||!meta.width||!meta.height||meta.width>8000||meta.height>8000)throw new Error('Unsupported image');const output=await input.rotate().webp({quality:92}).toBuffer({resolveWithObject:true});full=output.data;width=output.info.width;height=output.info.height;thumb=await sharp(full).resize(256,256,{fit:'cover',position:'centre'}).webp({quality:85}).toBuffer()}catch{throw new Error('Image could not be decoded. Use a still PNG, JPEG or WebP, at most 20 megapixels and 8000 pixels per side.')}
  const id=createHash('sha256').update(file.bytes).digest('hex');await mkdir(this.directory,{recursive:true});
  const store=async(path:string,bytes:Buffer)=>{const temp=join(this.directory,randomUUID()+'.tmp');await writeFile(temp,bytes,{flag:'wx'});try{await link(temp,path)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}finally{await unlink(temp)}};
  await store(join(this.directory,id+'.webp'),full);await store(join(this.directory,id+'.thumb.webp'),thumb);
  const name=file.name.replace(/[\\/\x00-\x1f]/g,' ').trim().slice(0,200)||'Character portrait';
  this.repo.db.exec('BEGIN IMMEDIATE');try{this.campaign(campaignId);this.repo.db.prepare('INSERT OR IGNORE INTO image_assets VALUES (?,?,?,?)').run(id,width,height,new Date().toISOString());this.repo.db.prepare('INSERT OR IGNORE INTO campaign_images VALUES (?,?,?,?)').run(campaignId,id,name,'Player Character');this.repo.db.exec('COMMIT')}catch(e){this.repo.db.exec('ROLLBACK');throw e}
  return this.list(campaignId).find(image=>image.id===id)!;
 }
 async read(campaignId:string,id:string,thumbnail:boolean){this.campaign(campaignId);imageIdSchema.parse(id);if(!this.repo.db.prepare('SELECT 1 FROM campaign_images WHERE campaign_id=? AND image_id=?').get(campaignId,id))throw new Error('Image not found in this campaign');return readFile(join(this.directory,id+(thumbnail?'.thumb.webp':'.webp')))}
 assign(raw:unknown){const input=z.object({campaignId:campaignIdSchema,characterId:z.string().min(1).max(100),imageId:imageIdSchema.nullable(),expectedImageId:imageIdSchema.nullable()}).strict().parse(raw);this.campaign(input.campaignId);this.repo.db.exec('BEGIN IMMEDIATE');try{const record=this.repo.get(input.campaignId)!;const character=record.session.characters.find(c=>c.id===input.characterId);if(!character)throw new Error('Character not found');/* Future character ownership check belongs here. */if((character.portraitId??null)!==input.expectedImageId&&(character.portraitId??null)!==input.imageId)throw new Error('Portrait changed in another window. Reopen the portrait selector before replacing it.');if(input.imageId&&!this.repo.db.prepare('SELECT 1 FROM campaign_images WHERE campaign_id=? AND image_id=?').get(input.campaignId,input.imageId))throw new Error('Choose an image from this campaign library');character.portraitId=input.imageId;const updated=this.repo.update(record.id,record.revision,record.session);this.repo.db.exec('COMMIT');return updated}catch(e){this.repo.db.exec('ROLLBACK');throw e}}
}
