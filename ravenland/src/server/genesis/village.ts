import {secureDie} from '../combat/engine';
import {combatPages} from '../combat/sources';
import type {SqliteCampaignRepository} from '../sqlite';
export type VillageResult={table:string;dice:number[];total:number;result:string;source:{documentId:string;chunkId:string;page:number}};
// Table bodies stay in the authorized installed book, never in source code.
export function generateVillage(repo:SqliteCampaignRepository,campaignId:string,die=secureDie){
 const results:VillageResult[]=[];let missing:string|null=null;
 try{
  const pages=combatPages(repo,campaignId,'guide');
  for(const spec of [{heading:'SIZE OF THE VILLAGE',end:'168',sides:6,count:3},{heading:'AGE OF THE VILLAGE',end:'THE RULER OF THE VILLAGE',sides:66,count:4},{heading:'THE RULER OF THE VILLAGE',end:'THE PROBLEM OF THE VILLAGE',sides:66,count:12},{heading:'THE PROBLEM OF THE VILLAGE',end:'169',sides:66,count:12}]){
   const p=pages.find(p=>p.text.includes(spec.heading));if(!p)throw Error('Missing '+spec.heading);
   const body=p.text.split(spec.heading)[1].split(/\n\s*(?:THE [A-Z ]+|VILLAGE|John Hadley)/)[0];
   const entries=[...body.matchAll(/(?:^|\n)\s*(\d{1,2})(?:\s*[–−-]\s*(\d{1,2}))?\s+([^\n]+)/g)].map(m=>({lo:Number(m[1]),hi:Number(m[2]??m[1]),text:m[3].trim()}));
   // Two-column extraction is converted into separate lines by the PDF extractor.
   if(entries.length!==spec.count)throw Error('Unreliable '+spec.heading+' table extraction');
   const faces=spec.sides===6?[die(6)]:[die(6),die(6)];if(faces.some(n=>!Number.isInteger(n)||n<1||n>6))throw Error('Invalid trusted die');
   const total=faces.length===1?faces[0]:faces[0]*10+faces[1],row=entries.find(e=>total>=e.lo&&total<=e.hi);if(!row)throw Error('Uncovered table result');
   results.push({table:spec.heading,dice:faces,total,result:row.text,source:{documentId:p.documentId,chunkId:p.chunkId,page:p.startPage}});
  }
 }catch(e){missing=e instanceof Error?e.message:'Village evidence unavailable';}
 return {results,missing,policy:'Only these recorded rows are official results. Name, kin, NPCs, landmarks and prose are creative proposals. No unsupported subtable or age-in-years roll is claimed.'};
}
