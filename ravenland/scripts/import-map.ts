import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectWorkbook,readGeography} from '../src/server/map/importer';
import {SqliteCampaignRepository} from '../src/server/sqlite';
import {SqliteMapStore} from '../src/server/map/store';
async function main(){const args=process.argv.slice(2);const file=args[0];if(!file)throw new Error('Usage: npm run map:import -- workbook.xlsx --inspect OR workbook.xlsx mapping.json [--replace]');if(args.includes('--inspect')){console.log(JSON.stringify(await inspectWorkbook(resolve(file)),null,2));return}if(!args[1])throw new Error('An explicit reviewed mapping JSON is required');const data=await readGeography(resolve(file),JSON.parse(readFileSync(args[1],'utf8')));const repository=new SqliteCampaignRepository(process.env.RAVENLAND_DB_PATH||resolve('data/ravenland.sqlite'));try{new SqliteMapStore(repository).import(data,args.includes('--replace'));console.log(`Imported ${data.hexes.length} source hexes and ${data.edges.length} directed adjacency records. Calibration must be verified before travel.`)}finally{repository.close()}}
main().catch(error=>{console.error(error.message);process.exitCode=1});
