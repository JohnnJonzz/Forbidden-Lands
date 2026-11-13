import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
import {AIError} from '../ai/config';
const summaries:Record<string,string>={ocr:'No extractable text was found. OCR is required; upload a text-based PDF.',password:'Password-protected PDFs are not supported. Upload an unlocked copy.',limit:'PDF exceeds the extraction page or text limit.',invalid:'PDF structure could not be read. Check the file and retry.'};
export interface PDFPageEvidence {pageLabel:string|null;footerLabels:string[]}
export async function extractPDF(filename:string,onDocument:(pages:number)=>void,onPage:(page:number,text:string,evidence?:PDFPageEvidence)=>void){
 const child=spawn(process.execPath,['--max-old-space-size=384',join(process.cwd(),'scripts/extract-sourcebook.mjs'),filename],{stdio:['ignore','pipe','ignore'],env:{...process.env,NODE_OPTIONS:''}});
 let complete=false,failure:string|null=null,pages=0,next=1;
 const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});void exited.catch(()=>{});
 const timer=setTimeout(()=>{failure='PDF processing timed out. Try a smaller document or retry.';child.kill('SIGKILL')},180000);
 try{for await(const line of createInterface({input:child.stdout})){if(line.length>1300000)throw Error('oversized extraction');if(!line.startsWith('{'))continue;const event=JSON.parse(line);if(event.type==='document'&&Number.isInteger(event.pages)&&event.pages>0&&event.pages<=2000){pages=event.pages;onDocument(pages)}else if(event.type==='page'&&event.page===next&&event.page<=pages&&typeof event.text==='string'&&event.text.length<=200000){const evidence={pageLabel:typeof event.pageLabel==='string'?event.pageLabel.slice(0,40):null,footerLabels:Array.isArray(event.footerLabels)?event.footerLabels.filter((v:unknown)=>typeof v==='string'&&/^\d{1,4}$/.test(v)).slice(0,8):[]};onPage(event.page,event.text,evidence);next++}else if(event.type==='complete')complete=true;else if(event.type==='error')failure=summaries[event.code]??summaries.invalid;else throw Error('Invalid extraction protocol')}
 const code=await exited;if(code!==0||!complete||next!==pages+1)throw new AIError('extraction',failure??summaries.invalid);
 }catch(error){child.kill('SIGKILL');await exited.catch(()=>{});throw error instanceof AIError?error:new AIError('extraction',summaries.invalid)}finally{clearTimeout(timer)}
}
export function chunkPage(text:string){const chunks:{text:string;heading:string|null}[]=[];let start=0;while(start<text.length){let end=Math.min(start+2400,text.length);if(end<text.length){const line=text.lastIndexOf('\n',end),space=text.lastIndexOf(' ',end);if(line>start+1600)end=line;else if(space>start+1800)end=space}const body=text.slice(start,end).trim();if(body)chunks.push({text:body,heading:body.split('\n')[0].length<=100?body.split('\n')[0]:null});if(end===text.length)break;start=Math.max(start+1,end-220)}return chunks}
