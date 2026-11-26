import {sourcebookUploadBytes,pdfSizeMessage} from '../../lib/sourcebook-upload-limits';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,rename,unlink,realpath} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {AIError} from '../ai/config';
export const maxPDFBytes=sourcebookUploadBytes;
export function sourcebookDirectory(){return process.env.RAVENLAND_SOURCEBOOK_DIR||join(dirname(process.env.RAVENLAND_DB_PATH||join(process.cwd(),'data/ravenland.sqlite')),'sourcebooks')}
// Portable keys; cloud adapters can spool a private object locally for extraction.
export interface SourcebookStorage {
 put(key:string,stream:ReadableStream<Uint8Array>,limit:number,expectedBytes?:number):Promise<{size:number;sha256:string}>;
 withLocalFile<T>(key:string,read:(filename:string)=>Promise<T>):Promise<T>;
 remove(key:string):Promise<void>;
}
export class FileSourcebookStorage implements SourcebookStorage {
 constructor(readonly directory=sourcebookDirectory()){}
 private async path(key:string,create=false){if(!/^[a-f0-9-]{36}\.pdf$/.test(key))throw new AIError('storage','Invalid document key');if(create)await mkdir(this.directory,{recursive:true});const dir=await realpath(this.directory),publicDir=resolve(process.cwd(),'public'),actualPublic=await realpath(publicDir).catch(()=>publicDir);if([publicDir,actualPublic].some(root=>dir===root||dir.startsWith(root+sep)))throw new AIError('storage','Sourcebook storage must be outside public assets.',500);return join(dir,key)}
 async put(key:string,stream:ReadableStream<Uint8Array>,limit:number,expectedBytes?:number){const target=await this.path(key,true),temp=target+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600),reader=stream.getReader(),hash=createHash('sha256');let size=0,head=Buffer.alloc(0),tail=Buffer.alloc(0);try{while(true){const {value,done}=await reader.read().catch(()=>{throw new AIError('upload_interrupted','PDF upload was interrupted. No document was saved. Retry the original file.',400)});if(done)break;size+=value.byteLength;if(size>limit)throw new AIError('size',pdfSizeMessage(limit),413);const bytes=Buffer.from(value);hash.update(bytes);if(head.length<1024)head=Buffer.concat([head,bytes.subarray(0,1024-head.length)]);tail=Buffer.concat([tail,bytes]).subarray(-2048);await file.writeFile(bytes)}if(expectedBytes!==undefined&&size!==expectedBytes)throw new AIError('upload_incomplete',`PDF upload was incomplete: received ${size} of ${expectedBytes} bytes. No document was saved. Retry the original file.`,400);if(size<32||!head.toString('latin1').includes('%PDF-')||!tail.toString('latin1').includes('%%EOF'))throw new AIError('pdf','This file does not have a valid PDF header and trailer.');await file.close();await rename(temp,target);return {size,sha256:hash.digest('hex')}}catch(error){await reader.cancel().catch(()=>{});await file.close().catch(()=>{});await unlink(temp).catch(()=>{});throw error}finally{reader.releaseLock()}}
 async withLocalFile<T>(key:string,read:(filename:string)=>Promise<T>){const path=await this.path(key),actual=await realpath(path);if(actual!==path)throw new AIError('storage','Unsafe document storage path',500);return read(path)}
 async remove(key:string){try{await unlink(await this.path(key))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
}
