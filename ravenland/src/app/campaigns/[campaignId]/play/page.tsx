import { GameplayApp } from "@/components/gameplay-app";
export default async function PlayPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <GameplayApp campaignId={campaignId} />;
}
