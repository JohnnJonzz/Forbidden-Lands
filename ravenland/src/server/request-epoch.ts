import {assertLegacyGameplayAllowed} from './gameplay/boundary';
import type {SqliteCampaignRepository} from './sqlite';
import {AIError} from './ai/config';
export function assertCurrentRequest(repo:SqliteCampaignRepository,campaignId:string,requestId:string){assertLegacyGameplayAllowed(repo,campaignId);if(repo.db.prepare('SELECT 1 FROM retired_campaign_requests WHERE campaign_id=? AND request_id=?').get(campaignId,requestId))throw new AIError('campaign_reset','This request belongs to a reset campaign history. Start a fresh action instead of replaying it.',409);}
