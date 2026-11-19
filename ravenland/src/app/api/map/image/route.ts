import {mapImage} from '@/server/map/assets';
import {getMapStore} from '@/server/map/store';
import {requireMapAccess} from '@/server/map/exploration';
import {getLocalRepository} from '@/server/sqlite';
import {concealedMapImage} from '@/server/map/fog-image';
import {mapFailure} from '@/server/map/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const url=new URL(request.url),id=url.searchParams.get('campaignId');if(!id)return new Response('Campaign ID required',{status:400});const view=url.searchParams.get('view')==='gm'?'gm':'player';requireMapAccess(id,view,getLocalRepository());const image=mapImage();if(!image)return new Response('Map image not installed',{status:404});const store=getMapStore(),data=store.publicMap(id,view),concealed=data.exploration!.enabled&&view!=='gm';const bytes=concealed?await concealedMapImage(data.imageKey!,store.hexes(),data.calibration,data.exploration!.explored):image.data;return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Map-View':concealed?'concealed':'full'}})}catch(e){return mapFailure(e)}}
