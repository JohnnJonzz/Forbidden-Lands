import type {SqliteCampaignRepository} from '../sqlite';
import {expeditionFor} from '../../lib/journey/expedition';
import type {CombatEncounter} from '../../lib/combat/types';
export function expeditionEncounters(repo:SqliteCampaignRepository,id:string,entryId:string){const s=repo.get(id)!.session,e=s.dayTracker?.find(e=>e.id===entryId);if(!e)return [];const p=expeditionFor(s,entryId),hexes=new Set([e.from,...p.entries.map(r=>r.hex)]);return repo.db.prepare('SELECT state_json FROM combat_encounters WHERE campaign_id=? ORDER BY updated_at').all(id).map(r=>JSON.parse(String(r.state_json)) as CombatEncounter).filter(encounter=>encounter.startedAt>=e.submittedAt&&(hexes.has(encounter.sceneHex)||encounter.administrativeAbort?.journeyEntryId===entryId));}
