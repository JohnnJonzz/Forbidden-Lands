import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,link,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
/** Object keys are portable; a future cloud adapter implements these operations.
 * putIfAbsent must publish a complete object atomically and never replace one.
 * Credentials, bucket names and disk paths never enter campaign records.
 */
export interface ImageStorage {
 putIfAbsent(key:string,bytes:Buffer,contentType:'image/webp'):Promise<void>;
 read(key:string):Promise<Buffer>;
}
export function defaultImageDirectory(){return process.env.RAVENLAND_IMAGE_DIR||join(dirname(process.env.RAVENLAND_DB_PATH||join(process.cwd(),'data/ravenland.sqlite')),'images')}
export class FileImageStorage implements ImageStorage {
 constructor(readonly directory:string=defaultImageDirectory()){}
 private path(key:string){if(!/^[a-f0-9]{64}(\.thumb)?\.webp$/.test(key))throw new Error('Invalid image object key');return join(this.directory,key)}
 async putIfAbsent(key:string,bytes:Buffer,contentType:'image/webp'){void contentType;const destination=this.path(key);await mkdir(this.directory,{recursive:true});const temp=join(this.directory,randomUUID()+'.tmp');await writeFile(temp,bytes,{flag:'wx'});try{await link(temp,destination)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}finally{await unlink(temp)}}
 async read(key:string){return readFile(this.path(key))}
}
