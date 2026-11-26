// Operator-only diagnostic: read-only SQLite, no repository/migrations/server.
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {recoveryPreview} from '../src/server/combat/recovery';
import {activeChatForm} from '../src/lib/journey/chat-engine';
import type {CombatEncounter} from '../src/lib/combat/types';
import type {Session} from '../src/lib/types';
const {values}=parseArgs({options:{db:{type:'string'},encounter:{type:'string'},attack:{type:'string'}}});
if(!values.db||!values.encounter)throw Error('Usage: tsx scripts/inspect-combat-recovery.ts --db /path/to/db.sqlite --encounter ID [--attack ID]');
const db=new DatabaseSync(values.db,{readOnly:true});
try{const row=db.prepare('SELECT campaign_id,state_json FROM combat_encounters WHERE id=?').get(values.encounter);if(!row)throw Error('Encounter ID not found. No record was created or changed.');const e=JSON.parse(String(row.state_json)) as CombatEncounter;if(values.attack&&e.pending?.id!==values.attack)throw Error('Pending attack does not match the diagnostic reference; inspect the current saved encounter before proceeding.');const campaign=db.prepare('SELECT public_state FROM campaigns WHERE id=?').get(String(row.campaign_id));if(!campaign)throw Error('Campaign not found');const s=JSON.parse(String(campaign.public_state)) as Session,f=activeChatForm(s);console.log(JSON.stringify({readOnly:true,encounterId:e.id,campaignId:e.campaignId,name:s.campaign.name,status:e.status,administrativelyAborted:!!e.administrativeAbort,actualClock:s.campaign,encounterScene:{hex:e.sceneHex,location:e.sceneLocation},locationMismatch:e.sceneHex!==s.campaign.hex||e.sceneLocation!==s.campaign.location,recovery:recoveryPreview(e,s),journey:f?{formId:f.id,entryId:f.entryId,from:f.from,intended:f.draft.destination,originalRecord:s.dayTracker?.find(d=>d.id===f.entryId)}:null,criticalObligations:e.combatants.flatMap(a=>({name:a.name,critical:a.critical,brokenProcedures:a.brokenProcedures??[]}))},null,2));}finally{db.close()}
