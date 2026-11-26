'use client';
import {Castle,House,Landmark,MapPin,Mountain} from 'lucide-react';
import type {KnownLocation} from '@/lib/map/locations';
import {placeLocationLabels} from '@/lib/map/locations';
import type {Calibration,GeoHex} from '@/lib/map/types';
import {hexCenter} from '@/lib/map/geometry';
const symbols={Village:House,Castle,Dungeon:Mountain,Ruins:Landmark,Other:MapPin};
export function MapLocationAnnotations({locations,hexes,grid,view,size,names,icons,onSelect}:{locations:KnownLocation[];hexes:GeoHex[];grid:Calibration;view:{scale:number;x:number;y:number};size:{w:number;h:number};names:boolean;icons:boolean;onSelect:(id:string)=>void}){
 const hexIndex=new Map(hexes.map(h=>[h.coordinate,h]));const counts=new Map<string,number>();
 const points=locations.map(l=>{const h=hexIndex.get(l.hex);if(!h)return null;const c=hexCenter(h,grid),index=counts.get(l.hex)??0;counts.set(l.hex,index+1);return {...l,anchorX:-(index%4)*22,anchorY:20+Math.floor(index/4)*22,x:c.x*view.scale+view.x+(index%4)*22,y:c.y*view.scale+view.y-20-Math.floor(index/4)*22}}).filter((l):l is NonNullable<typeof l>=>!!l&&l.x>-300&&l.x<size.w+300&&l.y>-100&&l.y<size.h+100);
 const placements=placeLocationLabels(points);
 return <g className="location-annotations" data-testid="location-annotations">{points.map(l=>{const Icon=symbols[l.type],label=placements.get(l.id);return (icons||names&&label)&&<g key={l.id} data-location-id={l.id} data-hex={l.hex} transform={`translate(${(l.x-view.x)/view.scale} ${(l.y-view.y)/view.scale}) scale(${1/view.scale})`} className={'map-location '+(l.status==='Rumored'?'rumored':'')} role="button" tabIndex={0} aria-label={`${l.name}, ${l.type}, ${l.status}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect(l.id)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(l.id)}}}><title>{l.name} · {l.status}</title>{icons&&<><line x1={l.anchorX} y1={l.anchorY} x2="0" y2="8" stroke="#806538" strokeWidth="1.2" pointerEvents="none"/><circle r="11"/><Icon x={-8} y={-8} size={16}/></>}{names&&label&&<text x={label.dx} y={label.dy} fontSize="13">{l.name.length>36?l.name.slice(0,35)+'…':l.name}</text>}</g>})}</g>
}
