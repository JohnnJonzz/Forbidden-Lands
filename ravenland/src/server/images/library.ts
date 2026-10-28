import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {getLocalRepository,type SqliteCampaignRepository} from '../sqlite';
import {imageCategories,maxImageBytes,type LibraryImage,type ImageCategory} from '../../lib/images';
import {FileImageStorage,defaultImageDirectory,type ImageStorage} from './storage';
export {maxImageBytes} from '../../lib/images';
export const imageIdSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const campaignIdSchema=z.string().uuid();
export class ImageLibrary {
 readonly storage:ImageStorage;
 constructor(readonly repo:SqliteCampaignRepository=getLocalRepository(),storage:string|ImageStorage=defaultImageDirectory()){this.storage=typeof storage==='string'?new FileImageStorage(storage):storage}
 private campaign(id:string){campaignIdSchema.parse(id);if(!this.repo.get(id))throw new Error('Campaign not found');/* Future authenticated campaign membership check belongs here, including image reads. */}
 list(campaignId:string):LibraryImage[]{this.campaign(campaignId);return (this.repo.db.prepare('SELECT a.id,a.width,a.height,a.created_at AS createdAt,c.name,c.category FROM image_assets a JOIN campaign_images c ON c.image_id=a.id WHERE c.campaign_id=? ORDER BY a.created_at DESC,a.id').all(campaignId) as unknown as LibraryImage[])}
 async upload(campaignId:string,file:{bytes:Buffer;type:string;name:string},category:ImageCategory='Player Character'):Promise<LibraryImage>{
  this.campaign(campaignId);z.enum(imageCategories).parse(category);if(!file.bytes.length||file.bytes.length>maxImageBytes)throw new Error('Images must be between 1 byte and 8 MB');
  const formats:Record<string,string>={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'};if(!formats[file.type])throw new Error('Choose a PNG, JPEG or WebP image');
  let full:Buffer,thumb:Buffer,width:number,height:number;
  try{const input=sharp(file.bytes,{limitInputPixels:20_000_000,failOn:'warning'}),meta=await input.metadata();if(meta.format!==formats[file.type]||(meta.pages??1)>1||!meta.width||!meta.height||meta.width>8000||meta.height>8000)throw new Error('Unsupported image');const output=await input.rotate().webp({quality:92}).toBuffer({resolveWithObject:true});full=output.data;width=output.info.width;height=output.info.height;thumb=await sharp(full).resize(256,256,{fit:'cover',position:'centre'}).webp({quality:85}).toBuffer()}catch{throw new Error('Image could not be decoded. Use a still PNG, JPEG or WebP, at most 20 megapixels and 8000 pixels per side.')}
  const id=createHash('sha256').update(file.bytes).digest('hex');
  await this.storage.putIfAbsent(id+'.webp',full,'image/webp');await this.storage.putIfAbsent(id+'.thumb.webp',thumb,'image/webp');
  const name=file.name.replace(/[\\/\x00-\x1f]/g,' ').trim().slice(0,200)||'Image';
  this.repo.db.exec('BEGIN IMMEDIATE');try{this.campaign(campaignId);this.repo.db.prepare('INSERT OR IGNORE INTO image_assets VALUES (?,?,?,?)').run(id,width,height,new Date().toISOString());this.repo.db.prepare('INSERT INTO campaign_images VALUES (?,?,?,?) ON CONFLICT(campaign_id,image_id) DO UPDATE SET name=excluded.name,category=excluded.category').run(campaignId,id,name,category);this.repo.db.exec('COMMIT')}catch(e){this.repo.db.exec('ROLLBACK');throw e}
  return this.list(campaignId).find(image=>image.id===id)!;
 }
 updateCategory(raw:unknown){const c=z.object({campaignId:campaignIdSchema,imageId:imageIdSchema,category:z.enum(imageCategories),expectedCategory:z.enum(imageCategories)}).strict().parse(raw);this.campaign(c.campaignId);const result=this.repo.db.prepare('UPDATE campaign_images SET category=? WHERE campaign_id=? AND image_id=? AND category=?').run(c.category,c.campaignId,c.imageId,c.expectedCategory);const image=this.list(c.campaignId).find(i=>i.id===c.imageId);if(!image)throw new Error('Image not found in this campaign');if(!result.changes&&image.category!==c.category)throw new Error('Category changed in another window. Reload the library before editing.');return image}
 async read(campaignId:string,id:string,thumbnail:boolean){this.campaign(campaignId);imageIdSchema.parse(id);if(!this.repo.db.prepare('SELECT 1 FROM campaign_images WHERE campaign_id=? AND image_id=?').get(campaignId,id))throw new Error('Image not found in this campaign');return this.storage.read(id+(thumbnail?'.thumb.webp':'.webp'))}
 assign(raw:unknown){const input=z.object({campaignId:campaignIdSchema,characterId:z.string().min(1).max(100),imageId:imageIdSchema.nullable(),expectedImageId:imageIdSchema.nullable()}).strict().parse(raw);this.campaign(input.campaignId);this.repo.db.exec('BEGIN IMMEDIATE');try{const record=this.repo.get(input.campaignId)!;const character=record.session.characters.find(c=>c.id===input.characterId);if(!character)throw new Error('Character not found');/* Future character ownership check belongs here. */if((character.portraitId??null)!==input.expectedImageId&&(character.portraitId??null)!==input.imageId)throw new Error('Portrait changed in another window. Reopen the portrait selector before replacing it.');if(input.imageId&&!this.repo.db.prepare('SELECT 1 FROM campaign_images WHERE campaign_id=? AND image_id=?').get(input.campaignId,input.imageId))throw new Error('Choose an image from this campaign library');character.portraitId=input.imageId;const updated=this.repo.update(record.id,record.revision,record.session);this.repo.db.exec('COMMIT');return updated}catch(e){this.repo.db.exec('ROLLBACK');throw e}}
}
