import {CampaignApp} from '@/components/campaign-app';
export default async function CampaignPage({params}:{params:Promise<{campaignId:string}>}){const {campaignId}=await params;return <CampaignApp campaignId={campaignId}/>}
