import {CharacterWindow} from '@/components/character-window';
export default async function CharacterPage({params}:{params:Promise<{campaignId:string;characterId:string}>}){const {campaignId,characterId}=await params;return <CharacterWindow campaignId={campaignId} characterId={characterId}/>}
