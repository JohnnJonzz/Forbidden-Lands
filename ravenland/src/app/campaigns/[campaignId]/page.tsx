import { CampaignApp } from "@/components/campaign-app";
import { getLocalRepository } from "@/server/sqlite";
import { isPhase7Campaign } from "@/server/gameplay/boundary";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  if (isPhase7Campaign(getLocalRepository(), campaignId))
    redirect(`/campaigns/${campaignId}/play`);
  return <CampaignApp campaignId={campaignId} />;
}
