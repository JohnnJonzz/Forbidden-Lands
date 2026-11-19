import {z} from 'zod';
import type {SqliteCampaignRepository} from './sqlite';
export type LocalLibraryAuthority={trustedLocal:boolean};
export function inheritLibraries(repo:SqliteCampaignRepository,campaignId:string,authority:LocalLibraryAuthority){
 if(!authority.trustedLocal)throw Error('Installation library synchronization requires the trusted local controller.');
 if(!repo.get(campaignId))throw Error('Campaign not found.');
 const db=repo.db,own=!db.isTransaction;if(own)db.exec('BEGIN IMMEDIATE');try{
 const sources=db.prepare("WITH candidates AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY sha256,visibility,category ORDER BY (status='Indexed') DESC,uploaded_at,id) AS duplicate_rank FROM source_documents) INSERT OR IGNORE INTO campaign_sourcebooks(campaign_id,document_id,applicable) SELECT ?,c.id,CASE WHEN c.category='House Rules' THEN 0 ELSE 1 END FROM candidates c WHERE c.campaign_id<>? AND c.duplicate_rank=1 AND NOT EXISTS(SELECT 1 FROM accessible_source_documents a WHERE a.campaign_id=? AND a.sha256=c.sha256 AND a.visibility=c.visibility AND a.category=c.category AND (a.status='Indexed' OR c.status<>'Indexed'))").run(campaignId,campaignId,campaignId).changes;
 const rules=db.prepare('INSERT OR IGNORE INTO campaign_curated_rules(campaign_id,document_id,active_override) SELECT ?,id,0 FROM curated_rules WHERE campaign_id<>?').run(campaignId,campaignId).changes;
 const images=db.prepare("INSERT OR IGNORE INTO campaign_images(campaign_id,image_id,name,category) SELECT ?,a.id,COALESCE((SELECT c.name FROM campaign_images c WHERE c.image_id=a.id ORDER BY c.campaign_id LIMIT 1),'Saved image'),COALESCE((SELECT c.category FROM campaign_images c WHERE c.image_id=a.id ORDER BY c.campaign_id LIMIT 1),'Scene') FROM image_assets a").run(campaignId).changes;
 if(own)db.exec('COMMIT');return {sources:Number(sources),rules:Number(rules),images:Number(images)};
 }catch(e){if(own)db.exec('ROLLBACK');throw e;}
}
export function setInheritedRuleApplicability(repo:SqliteCampaignRepository,raw:unknown){const c=z.object({campaignId:z.string().uuid(),documentId:z.string().uuid(),kind:z.enum(['curated','pdf']),active:z.boolean(),confirmed:z.literal(true)}).strict().parse(raw);const sql=c.kind==='curated'?'UPDATE campaign_curated_rules SET active_override=? WHERE campaign_id=? AND document_id=?':'UPDATE campaign_sourcebooks SET applicable=? WHERE campaign_id=? AND document_id=?';const result=repo.db.prepare(sql).run(c.active?1:0,c.campaignId,c.documentId);if(!result.changes)throw Error('Select an inherited library reference in this campaign.');return {applied:true};}
