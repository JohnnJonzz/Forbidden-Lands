import {weightUnits} from './carrying';
// Shared by sheet preview and authoritative inventory/journey checks.
export function creatureLoad(c:{attributes:{strength:number|null};damage:{strength:number};mounted:boolean;inventory:{item?:string;carried:boolean;weight:string;quantity:number}[];coins:number}){
 const weight=weightUnits;
 const strength=c.attributes.strength===null?null:Math.max(0,c.attributes.strength-c.damage.strength),capacity=strength===null?null:strength*(c.mounted?2:4);
 const total=c.inventory.filter(i=>i.carried&&(i.item===undefined||!!i.item.trim())).reduce((n,i)=>n+weight[i.weight]*i.quantity,0)+Math.floor(c.coins/100)*.5;
 return {capacity,total,overloaded:capacity===null?null:total>capacity,mode:c.mounted?'Mounted':'Led on foot'};
}
