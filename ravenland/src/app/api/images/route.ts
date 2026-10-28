import {z} from 'zod';
import {imageCategories} from '@/lib/images';
import {NextResponse} from 'next/server';
import {ImageLibrary,maxImageBytes} from '@/server/images/library';
export const runtime='nodejs';
export async function GET(request:Request){try{return NextResponse.json({images:new ImageLibrary().list(new URL(request.url).searchParams.get('campaignId')??'')},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Campaign image library not found'},{status:404})}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new Error('Origin mismatch');
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new Error('Upload an image file');
 const limit=maxImageBytes+65536;if(Number(request.headers.get('content-length')||0)>limit)throw new Error('Image upload exceeds 8 MB');
 const reader=request.body?.getReader();if(!reader)throw new Error('Empty upload');const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Image upload exceeds 8 MB')}chunks.push(value)}
 const data=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')!},body:Buffer.concat(chunks)}).formData(),file=data.get('file');if(!(file instanceof File))throw new Error('Choose an image');
 const category=z.enum(imageCategories).parse(data.get('category')??'Player Character');
 const image=await new ImageLibrary().upload(String(data.get('campaignId')??''),{bytes:Buffer.from(await file.arrayBuffer()),type:file.type,name:String(data.get('name')??file.name)},category);return NextResponse.json({image},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Image upload failed'},{status:400})}}

export async function PATCH(request:Request){try{const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw new Error('Origin mismatch');const body=await request.text();if(body.length>4096)throw new Error('Invalid image metadata');return NextResponse.json({image:new ImageLibrary().updateCategory(JSON.parse(body))})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Category update failed'},{status:400})}}
