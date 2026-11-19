import {z} from 'zod';
import type {Session} from '../types';
import type {GeoHex,Discovery} from './types';
export const explorationSchema=z.object({enabled:z.boolean(),opacity:z.number().min(0).max(1),explored:z.array(z.string().min(1).max(50)).max(10000).refine(a=>new Set(a).size===a.length,'Duplicate explored hex IDs')}).strict();
export type Exploration=z.infer<typeof explorationSchema>;
export function explorationFor(s:Session,hexes:Pick<GeoHex,'coordinate'>[]){const canonical=new Set(hexes.map(h=>h.coordinate)),stored=s.exploration??{enabled:true,opacity:.9,explored:[]};return {...stored,explored:[...new Set([...stored.explored,s.campaign.hex])].filter(id=>canonical.has(id)||!hexes.length&&stored.explored.includes(id)).sort()}}
export function explorationState(s:Session,hexes:GeoHex[],discoveries:Discovery[]=s.discoveries??[],gm=false){const state=explorationFor(s,hexes),known=new Set(state.explored);const locations=hexes.flatMap(h=>[...h.printedFeatures,...discoveries.filter(d=>d.coordinate===h.coordinate).map(d=>d.title)].map(name=>({coordinate:h.coordinate,name})));return {...state,currentHex:hexes.some(h=>h.coordinate===s.campaign.hex)?s.campaign.hex:null,unexplored:hexes.filter(h=>!known.has(h.coordinate)).map(h=>h.coordinate),knownLocations:locations.filter(l=>known.has(l.coordinate)),...(gm?{undiscoveredLocations:locations.filter(l=>!known.has(l.coordinate))}:{})}}
export const explorationCommandSchema=z.discriminatedUnion('type',[
 z.object({campaignId:z.string().uuid(),actionId:z.string().uuid(),type:z.literal('preferences'),enabled:z.boolean().optional(),opacity:z.number().min(0).max(1).optional()}).strict(),
 z.object({campaignId:z.string().uuid(),actionId:z.string().uuid(),type:z.enum(['reveal','hide']),hexes:z.array(z.string().min(1).max(50)).min(1).max(1022)}).strict(),
 z.object({campaignId:z.string().uuid(),actionId:z.string().uuid(),type:z.literal('reset'),confirmed:z.literal(true)}).strict()
]);
