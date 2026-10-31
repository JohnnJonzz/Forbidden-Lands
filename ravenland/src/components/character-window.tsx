'use client';
import {useCampaign} from '@/hooks/use-campaign';
import {SheetEmbed} from './sheet-embed';
import {DiceCard} from './dice-card';
export function CharacterWindow({campaignId,characterId}:{campaignId:string;characterId:string}){
 const storage=useCampaign(campaignId),character=storage.record?.session.characters.find(c=>c.id===characterId);
 if(!storage.record)return <main className="character-window"><h1>Character sheet</h1><p role="status">{storage.error||storage.status}</p><button onClick={()=>storage.retry()}>Retry</button></main>;
 if(!character)return <main className="character-window"><h1>Character not found</h1><p>This character does not belong to the requested campaign.</p></main>;
 return <main className="character-window"><header><h1>{character.name}</h1><span>{storage.record.session.campaign.name} · {storage.status}</span><a href={`/campaigns/${encodeURIComponent(campaignId)}`} target="_blank" rel="noopener">Open campaign chat</a></header><SheetEmbed dice={storage.record.session.dice} onDice={storage.diceCommand} campaignId={campaignId} character={character} mode="sheet" onChange={storage.saveSheet}/><section aria-label="Character pending dice"><h2>Staged rolls · also visible in campaign chat</h2>{storage.record.session.dice?.filter(d=>d.characterId===characterId&&d.status!=='Submitted').map(card=><DiceCard actorId={characterId} campaignId={campaignId} key={card.id} card={card} session={storage.record!.session} onCommand={storage.diceCommand}/>)}</section></main>
}
