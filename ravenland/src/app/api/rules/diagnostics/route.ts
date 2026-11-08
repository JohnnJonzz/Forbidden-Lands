import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireGM} from '@/server/ai/config';
import {aiFailure} from '@/server/ai/http';
import {getLocalRepository} from '@/server/sqlite';
import {retrieveRules} from '@/server/sourcebooks/retrieval';
export const runtime='nodejs';
export async function GET(request:Request){try{requireGM(request.headers.get('x-ravenland-gm-token'));const p=new URL(request.url).searchParams,campaignId=z.string().uuid().parse(p.get('campaignId')),query=z.string().min(1).max(3000).parse(p.get('query')),documentTitle=z.string().trim().min(1).max(200).optional().parse(p.get('documentTitle')||undefined),r=retrieveRules(getLocalRepository(),campaignId,query,'chat',{diagnostics:true,documentTitle});return NextResponse.json({sections:r.passages.map(p=>({documentId:p.documentId,title:p.title,primaryTopic:'primaryTopic'in p?p.primaryTopic:undefined,sourceType:'sourceType'in p?p.sourceType:'pdf',headingPath:'headingPath'in p?p.headingPath:undefined,heading:p.heading,pdfPage:p.startPage,sourceReference:'sourceReference'in p?p.sourceReference:undefined})),count:r.passages.length,estimatedTokens:r.estimatedTokens,budgetTokens:r.budgetTokens,...r.selection,planner:r.planner,audit:r.audit},{headers:{'Cache-Control':'private, no-store','Vary':'x-ravenland-gm-token'}})}catch(e){return aiFailure(e)}}
