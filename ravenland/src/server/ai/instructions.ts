import {z} from 'zod';
import {maxGMInstructionCharacters,type GMInstructionRecord} from '../../lib/ai/instructions';
import type {SqliteCampaignRepository} from '../sqlite';
import {AIError} from './config';
import {aiConfig} from './store';
import {defaultGMInstructions} from './default-instructions';

export const instructionCommandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('save'),campaignId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),text:z.string().max(maxGMInstructionCharacters).refine(text=>!!text.trim(),'Instructions cannot be empty')}).strict(),
 z.object({type:z.literal('restore'),campaignId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),confirmed:z.literal(true)}).strict(),
]);
// Internal server access. HTTP callers must pass requireGM before calling these functions.
export function readGMInstructions(repo:SqliteCampaignRepository,campaignId:string):GMInstructionRecord {
 aiConfig(repo,campaignId);
 const row=repo.db.prepare('SELECT gm_instructions,instructions_updated_at,instructions_revision FROM ai_campaign_config WHERE campaign_id=?').get(campaignId)!;
 return {text:row.gm_instructions===null?defaultGMInstructions:row.gm_instructions as string,isDefault:row.gm_instructions===null,revision:row.instructions_revision as number,lastSavedAt:row.instructions_updated_at as string|null};
}
export function changeGMInstructions(repo:SqliteCampaignRepository,input:unknown):GMInstructionRecord {
 const c=instructionCommandSchema.parse(input),db=repo.db;
 db.exec('BEGIN IMMEDIATE');
 try {
  aiConfig(repo,c.campaignId);
  const result=db.prepare('UPDATE ai_campaign_config SET gm_instructions=?,instructions_updated_at=?,instructions_revision=instructions_revision+1 WHERE campaign_id=? AND instructions_revision=?').run(c.type==='save'?c.text:null,new Date().toISOString(),c.campaignId,c.expectedRevision);
  if(!result.changes)throw new AIError('conflict','Instructions changed in another editor. Reload saved instructions before saving again.',409);
  const saved=readGMInstructions(repo,c.campaignId);db.exec('COMMIT');return saved;
 } catch(error){db.exec('ROLLBACK');throw error}
}
