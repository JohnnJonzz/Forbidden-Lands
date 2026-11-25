import { CharacterWindow } from "@/components/character-window";
import { Phase7CharacterWindow } from "@/components/phase7-character-window";
import { getLocalRepository } from "@/server/sqlite";
import { isPhase7Campaign } from "@/server/gameplay/boundary";
import { hasRollQueue } from "@/server/gameplay/upgrade";
export const dynamic = "force-dynamic";
export default async function CharacterPage({
  params,
}: {
  params: Promise<{ campaignId: string; characterId: string }>;
}) {
  const { campaignId, characterId } = await params,
    repo = getLocalRepository();
  return isPhase7Campaign(repo, campaignId) && hasRollQueue(repo) ? (
    <Phase7CharacterWindow campaignId={campaignId} characterId={characterId} />
  ) : (
    <CharacterWindow campaignId={campaignId} characterId={characterId} />
  );
}
