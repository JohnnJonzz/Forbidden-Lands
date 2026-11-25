import { CampaignApp } from "@/components/campaign-app";
import { redirect } from "next/navigation";
import { readProfile } from "@/server/gameplay/profile";
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.RAVENLAND_PHASE7_PROFILE) {
    const p = readProfile();
    redirect(`/campaigns/${p.campaignId}/play`);
  }
  return <CampaignApp />;
}
