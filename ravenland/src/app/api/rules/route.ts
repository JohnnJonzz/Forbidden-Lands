import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getLocalRepository} from '@/server/sqlite';
import {aiFailure} from '@/server/ai/http';
import {CompendiumStore} from '@/server/compendium/store';
import {searchPlayerRules,playerPDFPassage} from '@/server/compendium/search';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,campaignId=z.string().uuid().parse(p.get('campaignId')),repo=getLocalRepository();let body:unknown;
 if(p.has('id'))body={rule:new CompendiumStore(repo).get(campaignId,z.string().uuid().parse(p.get('id')),'player')};
 else if(p.has('chunkId'))body={passage:playerPDFPassage(repo,campaignId,z.string().uuid().parse(p.get('chunkId')))};
 else body={passages:searchPlayerRules(repo,{campaignId,query:p.get('query')??'',...(p.get('topic')?{topic:p.get('topic')}:{}),...(p.get('sourceType')?{sourceType:p.get('sourceType')}:{})})};
 return NextResponse.json(body,{headers:{'Cache-Control':'no-store'}})
 }catch(e){return aiFailure(e)}}
