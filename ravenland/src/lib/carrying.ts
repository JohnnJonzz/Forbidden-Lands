export const weightUnits:Record<string,number>={Heavy:2,Normal:1,Light:.5,Tiny:0};
// One pure calculation is compiled into the standalone/embedded sheet and used by services.
export function carryingTotals(sheet:Record<string,any>,catalog:{weapons:readonly any[]}={weapons:[]}){
 const weights=weightUnits,issues:string[]=[],seen=new Map<string,number>();
 const key=(v:string)=>v.trim().toLowerCase().replace(/[‐‑–]/g,'-');let gear=0,weapons=0,armor=0,resources=0,coins=0;
 const gearRows=(sheet.gear??[]).filter((g:any)=>g.item?.trim());
 const add=(id:string|undefined,weight:number)=>{if(id){if(seen.has(id)){if(seen.get(id)!==weight)issues.push('Linked item has inconsistent weight/quantity');return 0;}seen.set(id,weight);}return weight;};
 for(const g of gearRows){if(/^(?:food|water|arrows?|torches?|rations?)$/i.test(g.item.trim()))issues.push('Review consumable recorded as physical gear: '+g.item);const n=g.quantity===''||g.quantity===undefined?null:Number(g.quantity);if(n===null||!Number.isInteger(n)||n<0||weights[g.weight]===undefined){issues.push('Review quantity/weight for '+g.item);continue;}gear+=add(g.itemId,weights[g.weight]*n);}
 for(const w of sheet.weapons??[]){if(!w.name?.trim())continue;const entry=catalog.weapons.find(e=>[e.name,e.id,...(e.aliases??[])].some((n:string)=>key(n)===key(w.name)));const weight=w.weight|| (entry?(/\bHeavy\b/i.test(entry.features)?'Heavy':/\bLight\b/i.test(entry.features)?'Light':'Normal'):null);if(weight===null||weights[weight]===undefined){issues.push('Review weapon weight for '+w.name);continue;}
  const identity=(name:string)=>catalog.weapons.find(e=>[e.name,e.id,...(e.aliases??[])].some((n:string)=>key(n)===key(name)))?.id??key(name);
  if(gearRows.some((g:any)=>identity(g.item)===identity(w.name)&&(!g.itemId||!w.itemId)))issues.push('Resolve legacy item identity for '+w.name+' in weapons and inventory');
  weapons+=add(w.itemId,weights[weight]);
 }
 for(const p of ['armor','helmet','shield'])if(sheet[p+'-name']?.trim()){const carried=sheet[p+'-carried'],worn=sheet[p+'-worn'];if(carried==='Yes'||carried===undefined&&worn===true){const w=weights[sheet[p+'-weight']];if(w===undefined)issues.push('Review '+p+' weight');else armor+=w;}else if(carried!=='No')issues.push('Review '+p+' carried status');}
 for(const p of ['food','water','arrows','torches']){const raw=sheet['res-'+p];if(/^D(?:6|8|10|12)$/i.test(raw??'')){resources++;if(gearRows.some((g:any)=>key(g.item)===p))issues.push('Review '+p+' represented both as gear and a resource die');}else if(raw!==undefined&&raw!==''&&!/^(?:None|Empty|0)$/i.test(raw))issues.push('Review '+p+' resource value');}
 let coinCount=0;for(const kind of ['copper','silver','gold']){const value=sheet['coin-'+kind];if(value!==undefined&&value!==''){const n=Number(value);if(!Number.isInteger(n)||n<0)issues.push('Review '+kind+' coins');else coinCount+=n;}}coins=Math.floor(coinCount/100)*.5;
 const strength=Number(sheet['attr-strength-regular']);if(!Number.isInteger(strength)||strength<1)issues.push('Base Strength is unestablished');
 const bonus=Number(sheet['capacity-bonus']||0);if(!Number.isFinite(bonus)||bonus<0)issues.push('Review capacity bonus');
 const capacity=Number.isInteger(strength)&&strength>0?strength*2+(Number.isFinite(bonus)&&bonus>=0?bonus:0):null,total=issues.length?null:gear+weapons+armor+resources+coins;
 return {gear,weapons,armor,resources,coins,total,capacity,overloaded:total!==null&&capacity!==null?total>capacity:null,issues};
}
