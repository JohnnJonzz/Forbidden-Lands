import {loadEnvConfig} from '@next/env';
import {join} from 'node:path';
import {inspectPlayerAccessSetup} from '../src/server/player-access-setup';

loadEnvConfig(process.cwd());
try{
 const args=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2){if(!['--database','--campaign'].includes(process.argv[i])||!process.argv[i+1]||args.has(process.argv[i]))throw Error('Usage: npm run player-access:inspect -- [--database existing-file] [--campaign existing-UUID]');args.set(process.argv[i],process.argv[i+1])}
 console.log(JSON.stringify(inspectPlayerAccessSetup(args.get('--database')??process.env.RAVENLAND_DB_PATH??join(process.cwd(),'data/ravenland.sqlite'),args.get('--campaign')),null,2));
}catch(error){console.error(error instanceof Error&&/^(?:No existing|Choose an existing|The requested|Usage:|Player access configuration)/.test(error.message)?error.message:'Player access inspection failed. Check the existing database and application schema. No migration or setup write was attempted.');process.exitCode=1}
