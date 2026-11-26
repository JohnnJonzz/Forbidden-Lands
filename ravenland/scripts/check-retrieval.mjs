import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const prepared=spawnSync(process.execPath,['scripts/generate-sheet.mjs'],{stdio:'inherit'});if(prepared.status!==0)process.exit(prepared.status??1);
for(const args of [['--test',...Array.from((await import('node:fs')).readdirSync('tests')).filter(name=>name.endsWith('.test.ts')).map(name=>'tests/'+name)],['--test','tests/real-sourcebooks.integration.ts']]){const r=spawnSync(process.execPath,[join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),...args],{stdio:'inherit',env:{...process.env,RAVENLAND_REQUIRE_REAL_SOURCEBOOKS:'1'}});if(r.status!==0){process.exitCode=r.status??1;break}}
