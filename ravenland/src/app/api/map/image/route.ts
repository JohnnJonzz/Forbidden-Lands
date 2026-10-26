import {mapImage} from '@/server/map/assets';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const image=mapImage();if(!image)return new Response('Map image not installed',{status:404});return new Response(new Uint8Array(image.data),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}})}
