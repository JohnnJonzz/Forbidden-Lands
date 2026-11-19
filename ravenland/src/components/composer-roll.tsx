'use client';
import type {PendingDice} from '@/lib/dice/schema';
import {canPush,baneCounts} from '@/lib/dice/engine';
export function ComposerRoll({card,name,onRemove,onPush,onCancelDraft,busy}:{card:PendingDice;name:string;onRemove:()=>void;onPush:()=>void;onCancelDraft:()=>void;busy:boolean}){
 return <div className="composer-roll" role="region" aria-label="Attached dice result" data-attached-roll={card.id}><strong>{name} · {card.result.skill} · {card.metadata.utility?'Utility result':card.result.successes+' successes'}</strong><span>{card.result.pushed?'Pushed once':'Not pushed'} · {baneCounts(card.result).total} ones</span><small>Saved push: {card.result.attributeDamage} attribute damage · {card.result.gearDamage} gear damage · {card.result.willpower} Willpower gained</small><div>{canPush(card)&&<button type="button" className="quiet-button" disabled={busy} onClick={onPush}>Push on character sheet</button>}<button type="button" className="quiet-button" disabled={busy} onClick={onRemove}>Remove attachment</button><button type="button" className="quiet-button" disabled={busy} onClick={onCancelDraft}>Cancel draft</button></div></div>;
}
