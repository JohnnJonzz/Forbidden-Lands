import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {requireGM,AIError} from '@/server/ai/config';
import {aiBody,aiFailure} from '@/server/ai/http';
import {SourcebookLibrary} from '@/server/sourcebooks/library';
import {maxPDFBytes} from '@/server/sourcebooks/storage';
import {sourceMetadataSchema} from '@/lib/sourcebooks/schema';
export const runtime='nodejs';
function libraryFailure(error:unknown){return aiFailure(error instanceof AIError||error instanceof ZodError||error instanceof SyntaxError?error:new AIError('library','Sourcebook request failed. Check storage and retry.',500))}
const id=z.string().uuid(),headers={'Cache-Control':'private, no-store','Vary':'x-ravenland-gm-token'};
export async function GET(request:Request){try{requireGM(request.headers.get('x-ravenland-gm-token'));const p=new URL(request.url).searchParams,campaignId=id.parse(p.get('campaignId')),library=new SourcebookLibrary(getLocalRepository());const query=p.get('query'),chunkId=p.get('chunkId');return NextResponse.json(chunkId?{passages:library.passage(campaignId,chunkId)}:query!==null?{passages:library.search({campaignId,query,...(p.get('category')?{category:p.get('category')}:{}),...(p.get('documentId')?{documentId:p.get('documentId')}:{})},'admin')}:{documents:library.list(campaignId),maxUploadBytes:maxPDFBytes()},{headers})}catch(error){const r=libraryFailure(error);r.headers.set('Cache-Control','private, no-store');return r}}
export async function POST(request:Request){try{requireGM(request.headers.get('x-ravenland-gm-token'));const library=new SourcebookLibrary(getLocalRepository());
 if(request.headers.get('content-type')?.split(';')[0]==='application/pdf'){
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new AIError('origin','Origin mismatch',403);
  const p=new URL(request.url).searchParams,campaignId=id.parse(p.get('campaignId')),metadata=sourceMetadataSchema.parse({title:p.get('title'),category:p.get('category'),...(p.get('visibility')?{visibility:p.get('visibility')}:{})});
  const length=Number(request.headers.get('content-length'));if(length>maxPDFBytes())throw new AIError('size','PDF exceeds the configured upload limit.',413);if(!request.body)throw new AIError('pdf','Choose a PDF file.');return NextResponse.json(await library.upload(campaignId,metadata,p.get('filename')??'document.pdf',request.body),{headers});
 }
 const c=z.discriminatedUnion('type',[
  z.object({type:z.literal('index'),campaignId:id,documentId:id}).strict(),
  z.object({type:z.literal('classify'),campaignId:id,documentId:id,revision:z.number().int().positive(),metadata:sourceMetadataSchema}).strict(),
  z.object({type:z.literal('delete'),campaignId:id,documentId:id,revision:z.number().int().positive(),confirmed:z.literal(true)}).strict(),
 ]).parse(await aiBody(request));
 if(c.type==='index')return NextResponse.json({document:await library.index(c.campaignId,c.documentId)},{headers});
 if(c.type==='classify')return NextResponse.json({document:library.classify(c.campaignId,c.documentId,c.revision,c.metadata)},{headers});
 await library.delete(c.campaignId,c.documentId,c.revision);return NextResponse.json({deleted:true},{headers});
}catch(error){const r=libraryFailure(error);r.headers.set('Cache-Control','private, no-store');return r}}
