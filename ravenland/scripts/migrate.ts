import { SqliteCampaignRepository } from '../src/server/sqlite';
import {join} from 'node:path';
const repository=new SqliteCampaignRepository(process.env.RAVENLAND_DB_PATH||join(process.cwd(),'data/ravenland.sqlite'));
repository.close();
console.log('SQLite migrations applied. Existing campaign records preserved.');
