import { AIError } from "../ai/config";
import type { SqliteCampaignRepository } from "../sqlite";
export function isPhase7Campaign(repo: SqliteCampaignRepository, id: string) {
  return (
    !!repo.db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='phase7_campaigns'",
      )
      .get() &&
    !!repo.db
      .prepare("SELECT 1 FROM phase7_campaigns WHERE campaign_id=?")
      .get(id)
  );
}
export function assertLegacyGameplayAllowed(
  repo: SqliteCampaignRepository,
  id: string,
) {
  if (isPhase7Campaign(repo, id))
    throw new AIError(
      "phase7_boundary",
      "This campaign uses the Phase 7 activity engine. Phase 6 gameplay handlers cannot create plans, bind rolls, resolve scenes or advance its clock. Open its Phase 7 play screen.",
      409,
    );
}
