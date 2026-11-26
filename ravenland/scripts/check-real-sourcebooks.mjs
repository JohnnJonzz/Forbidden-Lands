import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const r=spawnSync(process.execPath,[join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),'--test','tests/real-sourcebooks.integration.ts'],{stdio:'inherit',env:{...process.env,RAVENLAND_REQUIRE_REAL_SOURCEBOOKS:'1'}});process.exitCode=r.status??1;
