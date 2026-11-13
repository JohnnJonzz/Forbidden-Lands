import type { CampaignRecord, CampaignSummary, Session } from '../lib/types';
type Result<T> = T | Promise<T>;
// Both synchronous local SQLite and asynchronous hosted PostgreSQL adapters can implement this contract.
export interface CampaignRepository {
 list():Result<CampaignSummary[]>;
 get(id:string):Result<CampaignRecord|null>;
 current():Result<CampaignRecord>;
 select(id:string):Result<CampaignRecord>;
 create(session:Session):Result<CampaignRecord>;
 update(id:string,revision:number,session:Session):Result<CampaignRecord>;
}
export class ConflictError extends Error {}
