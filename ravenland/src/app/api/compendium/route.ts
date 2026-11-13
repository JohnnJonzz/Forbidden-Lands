import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {requireGM,AIError} from '@/server/ai/config';
import {aiBody,aiFailure} from '@/server/ai/http';
import {CompendiumStore} from '@/server/compendium/store';
import {ruleInputSchema,ruleMetadataSchema,ruleTopics,ruleVisibilities} from '@/lib/compendium/schema';
export const runtime='nodejs';
const id=z.string().uuid(),headers={'Cache-Control':'private, no-store','Vary':'x-ravenland-gm-token'};
export async function GET(request:Request){try{requireGM(request.headers.get('x-ravenland-gm-token'));const p=new URL(request.url).searchParams,campaignId=id.parse(p.get('campaignId')),store=new CompendiumStore(getLocalRepository());if(p.get('type')==='metadata-preview')return NextResponse.json({suggestions:store.metadataPreview(campaignId),limit:200},{headers});return NextResponse.json(p.has('id')?{rule:store.get(campaignId,id.parse(p.get('id')),'admin')}:{rules:store.list(campaignId,p.get('topic')?z.enum(ruleTopics).parse(p.get('topic')):undefined,p.get('visibility')?z.enum(ruleVisibilities).parse(p.get('visibility')):undefined,z.string().max(400).parse(p.get('query')??'')).map(({body,...summary})=>summary)},{headers})}catch(e){return fail(e)}}
function fail(e:unknown){const response=aiFailure(e);response.headers.set('Cache-Control','private, no-store');return response}
export async function POST(request:Request){try{requireGM(request.headers.get('x-ravenland-gm-token'));const p=new URL(request.url).searchParams;
 if(p.get('type')==='import'){
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new AIError('origin','Origin mismatch',403);
  const filename=(p.get('filename')??'').split(/[\\/]/).at(-1)!;if(!/\.(md|txt)$/i.test(filename))throw new AIError('file','Import a .md or .txt file.');if(!['text/plain','text/markdown','text/x-markdown','application/octet-stream'].includes(request.headers.get('content-type')?.split(';')[0]??''))throw new AIError('file','Use a Markdown or plain-text file.');if(!request.body)throw new AIError('file','Choose a text file.');const reader=request.body.getReader(),buffers:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw new AIError('size','Text import exceeds 1 MB.',413);buffers.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
  let body:string;try{body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(buffers))}catch{throw new AIError('encoding','Use a UTF-8 encoded text file.');}if(!body.trim()||body.length>160000||/[\x00-\x08\x0b\x0e-\x1f]/.test(body))throw new AIError('file','Enter readable text of at most 160,000 characters.');return NextResponse.json({body,title:filename.replace(/\.(md|txt)$/i,'').slice(0,200),visibility:'GM Only',saved:false},{headers});
 }
 const c=z.discriminatedUnion('type',[
  z.object({type:z.literal('metadata'),campaignId:id,id,revision:z.number().int().positive(),metadata:ruleMetadataSchema.required()}).strict(),
  z.object({type:z.literal('apply-metadata-suggestions'),campaignId:id,confirmed:z.literal(true),entries:z.array(z.object({id,revision:z.number().int().positive(),metadata:ruleMetadataSchema.required()}).strict()).min(1).max(200)}).strict(),
  z.object({type:z.literal('repair-index'),campaignId:id,confirmed:z.literal(true)}).strict(),
  z.object({type:z.literal('create'),campaignId:id,input:ruleInputSchema}).strict(),
  z.object({type:z.literal('save'),campaignId:id,id,revision:z.number().int().positive(),input:ruleInputSchema}).strict(),
  z.object({type:z.literal('delete'),campaignId:id,id,revision:z.number().int().positive(),confirmed:z.literal(true)}).strict(),
  z.object({type:z.literal('reindex'),campaignId:id,id,revision:z.number().int().positive()}).strict(),
 ]).parse(await aiBody(request,1048576)),store=new CompendiumStore(getLocalRepository());
 if(c.type==='metadata')return NextResponse.json({rule:store.saveMetadata(c.campaignId,c.id,c.revision,c.metadata)},{headers});
 if(c.type==='apply-metadata-suggestions')return NextResponse.json({applied:store.applyMetadata(c.campaignId,c.entries)},{headers});
 if(c.type==='repair-index')return NextResponse.json({reindexed:store.rebuild(c.campaignId)},{headers});
 if(c.type==='create')return NextResponse.json({rule:store.save(c.campaignId,c.input)},{headers});if(c.type==='save')return NextResponse.json({rule:store.save(c.campaignId,c.input,c.id,c.revision)},{headers});if(c.type==='reindex')return NextResponse.json({rule:store.reindex(c.campaignId,c.id,c.revision)},{headers});store.delete(c.campaignId,c.id,c.revision);return NextResponse.json({deleted:true},{headers});
 }catch(e){return fail(e)}}
