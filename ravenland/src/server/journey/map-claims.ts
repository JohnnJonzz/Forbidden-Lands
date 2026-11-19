import type {SqliteCampaignRepository} from '../sqlite';
import {SqliteMapStore} from '../map/store';
import {hexCenter} from '../../lib/map/geometry';
export function guardMapClaims(repo:SqliteCampaignRepository,id:string,text:string){
 const record=repo.get(id);if(!record)return text;const map=new SqliteMapStore(repo),current=record.session.campaign;
 let unverified=false;const clean=text.replace(/\b(?:hex\s+)?([A-Z]{1,2}\d{2})\b/g,(whole,hex)=>{if(hex===current.hex||['D10','D12','D20'].includes(hex)||map.lookup(hex))return whole;unverified=true;return '[unverified map position]'});
 if(unverified)return clean+' The exact map position is unverified; preserve the direction as testimony and review a Rumored Location separately.';
 const data=map.publicMap(id),origin=data.hexes.find(h=>h.coordinate===current.hex);if(!data.calibration?.verified||!origin)return clean;
 const escaped=current.location.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('\\b([A-Z]{1,2}\\d{2})\\b[^.!?]{0,40}?\\b(northeast|northwest|southeast|southwest|north|south|east|west) of (?:'+current.hex+'|'+escaped+')\\b','gi');
 return clean.replace(pattern,(whole,hex,direction)=>{const target=data.hexes.find(h=>h.coordinate===hex);if(!target)return whole;const a=hexCenter(origin,data.calibration!),b=hexCenter(target,data.calibration!),angle=(Math.atan2(b.x-a.x,-(b.y-a.y))*180/Math.PI+360)%360,actual=['North','Northeast','East','Southeast','South','Southwest','West','Northwest'][Math.round(angle/45)%8];return actual.toLowerCase().includes(direction.toLowerCase())?whole:`Map review: ${hex} lies ${actual.toLowerCase()} of ${current.hex}; the NPC's reported direction remains testimony`});
}
