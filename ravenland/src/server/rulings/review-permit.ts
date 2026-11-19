import type { SqliteCampaignRepository } from "../sqlite";
import type { CharacterPrincipal } from "../character-access";
import { requireController } from "../mutation-authority";
const issued = new WeakSet<object>();
export interface ReviewedRulingPermit {
  campaignId: string;
  pendingId: string;
  state: string;
  rulingId: string;
}
export function reviewedRulingPermit(
  repo: SqliteCampaignRepository,
  p: CharacterPrincipal | null,
  campaignId: string,
  pendingId: string,
  state: string,
  rulingId: string,
) {
  requireController(p, campaignId);
  const permit = { campaignId, pendingId, state, rulingId };
  issued.add(permit);
  return permit;
}
export function validReviewedPermit(
  repo: SqliteCampaignRepository,
  p: ReviewedRulingPermit | undefined,
  campaignId: string,
  pendingId: string,
  state: string,
) {
  return (
    !!p &&
    issued.has(p) &&
    p.campaignId === campaignId &&
    p.pendingId === pendingId &&
    p.state === state &&
    !!repo.db
      .prepare(
        "SELECT 1 FROM gm_rulings WHERE campaign_id=? AND id=? AND status='accepted'",
      )
      .get(campaignId, p.rulingId)
  );
}
