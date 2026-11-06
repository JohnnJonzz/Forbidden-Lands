// Runs in a separate, time/memory-bounded Node process. Never renders or executes PDF actions.
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
async function send(value){if(!process.stdout.write(JSON.stringify(value)+'\n'))await once(process.stdout,'drain')}
let task;
try {
 task=getDocument({url:pathToFileURL(process.argv[2]).href,isEvalSupported:false,stopAtErrors:true,disableFontFace:true,useSystemFonts:false,verbosity:0});
 const pdf=await task.promise;if(pdf.numPages>2000)throw Error('limit');await send({type:'document',pages:pdf.numPages});let characters=0,nonempty=0;
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),content=await page.getTextContent();let text='',lastY=null;
  for(const item of content.items){if(!('str'in item))continue;const y=Math.round(item.transform[5]);if(lastY!==null&&Math.abs(y-lastY)>3&&!text.endsWith('\n'))text+='\n';text+=item.str+(item.hasEOL?'\n':' ');lastY=y}
  text=text.replace(/[ \t]+\n/g,'\n').trim();characters+=text.length;if(text.length>200000||characters>30000000)throw Error('limit');if(text)nonempty++;
  await send({type:'page',page:number,text});page.cleanup();
 }
 if(!nonempty){await send({type:'error',code:'ocr'});process.exitCode=1}else await send({type:'complete'});
}catch(error){await send({type:'error',code:error?.name==='PasswordException'?'password':error?.message==='limit'?'limit':'invalid'});process.exitCode=1}
finally{await task?.destroy().catch(()=>{})}
