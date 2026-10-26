import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function mapImagePath(){return process.env.RAVENLAND_MAP_PATH||join(process.cwd(),'data/source/Forbidden_Lands_Map.png')}
export function mapImage(){const file=mapImagePath();if(!existsSync(file))return null;const data=readFileSync(file);if(data.length<24||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Map must be a valid PNG');return {data,width:data.readUInt32BE(16),height:data.readUInt32BE(20),checksum:createHash('sha256').update(data).digest('hex')}}
