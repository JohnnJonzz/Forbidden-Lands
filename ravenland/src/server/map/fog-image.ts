import sharp from 'sharp';
import {mapImage} from './assets';
import type {Calibration,GeoHex} from '../../lib/map/types';
import {hexPolygon} from '../../lib/map/geometry';
const cache=new Map<string,Promise<Buffer>>();
// Response-only masking of the ORIGINAL source pixels. No alternative artwork,
// replacement map file or uploaded asset is created. Concealed raster labels are
// not delivered to player view, even when darkness opacity is reduced to zero.
export async function concealedMapImage(key:string,hexes:GeoHex[],grid:Calibration|null,explored:string[]){
 if(cache.has(key))return cache.get(key)!;const image=mapImage();if(!image)throw new Error('Map image missing');
 const render=(async()=>{const ids=new Set(explored);const polygons=grid?.verified?hexes.filter(h=>ids.has(h.coordinate)).map(h=>`<polygon points="${hexPolygon(h,grid)}" fill="white"/>`).join(''):'';const mask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}">${polygons}</svg>`);const cutout=await sharp(image.data).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();return sharp({create:{width:image.width,height:image.height,channels:4,background:'#454640'}}).composite([{input:cutout}]).png().toBuffer()})();
 cache.set(key,render);if(cache.size>8)cache.delete(cache.keys().next().value!);try{return await render}catch(e){cache.delete(key);throw e}
}
