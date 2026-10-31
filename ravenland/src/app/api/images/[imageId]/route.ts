import {NextResponse} from 'next/server';
import {ImageLibrary} from '@/server/images/library';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{imageId:string}>}){try{const {imageId}=await params,url=new URL(request.url);const bytes=await new ImageLibrary().read(url.searchParams.get('campaignId')??'',imageId,url.searchParams.get('variant')==='thumbnail');return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'}})}catch{return NextResponse.json({error:'Image not found'},{status:404})}}
