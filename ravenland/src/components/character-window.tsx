'use client';
import {useCampaign} from '@/hooks/use-campaign';
import {useSheetRolls} from '@/hooks/use-sheet-rolls';
import {SheetEmbed} from './sheet-embed';
import {GroupReadiness} from './group-readiness';
import {DiceCard} from './dice-card';
export function CharacterWindow({campaignId,characterId}:{campaignId:string;characterId:string}){
 const storage=useCampaign(campaignId),rolls=useSheetRolls(storage.diceCommand,campaignId),character=storage.record?.session.characters.find(c=>c.id===characterId);
 if(!storage.record)return <main className="character-window"><h1>Character sheet</h1><p role="status">{storage.error||storage.status}</p><button onClick={()=>storage.retry()}>Retry</button></main>;
 if(!character)return <main className="character-window"><h1>Character not found</h1><p>This character does not belong to the requested campaign.</p></main>;
 return <main className="character-window"><header><h1>{character.name}</h1><span>{storage.record.session.campaign.name} · {storage.status}</span><a href={`/campaigns/${encodeURIComponent(campaignId)}`} target="_blank" rel="noopener">Open campaign chat</a></header>{rolls.failed.map(f=><p role="alert" key={f.id}>{f.error} <button onClick={rolls.retry}>Retry saving roll</button></p>)}<GroupReadiness session={storage.record.session} actorId={characterId} onCommand={storage.diceCommand}/><SheetEmbed campaignId={campaignId} character={character} mode="sheet" onChange={storage.saveSheet}/><section aria-label="Character pending dice"><h2>Staged rolls · also visible in campaign chat</h2>{storage.record.session.dice?.filter(d=>d.characterId===characterId&&d.status!=='Submitted').map(card=><DiceCard actorId={characterId} campaignId={campaignId} key={card.id} card={card} session={storage.record!.session} onCommand={storage.diceCommand}/>)}</section></main>
}
