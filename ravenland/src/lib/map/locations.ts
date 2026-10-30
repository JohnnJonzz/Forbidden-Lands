import {z} from 'zod';
import type {Session} from '../types';
export const locationTypes=['Village','Castle','Dungeon','Ruins','Other'] as const;
export const locationStatuses=['Rumored','Discovered','Visited'] as const;
export const locationInputSchema=z.object({name:z.string().trim().min(1).max(100),type:z.enum(locationTypes),hex:z.string().min(1).max(50),status:z.enum(locationStatuses),notes:z.string().max(5000).default(''),canonicalLocationId:z.string().min(1).max(100).optional(),journalNarrative:z.string().max(15000).optional()}).strict();
export const locationSchema=locationInputSchema.omit({journalNarrative:true}).extend({id:z.string().uuid(),discoveredOn:z.string().max(100),quarter:z.enum(['Morning','Day','Evening','Night']),journalEntryId:z.string().min(1).max(100).optional(),updatedAt:z.string().datetime()}).strict();
export const locationRegistrySchema=z.array(locationSchema).max(1000).refine(a=>new Set(a.map(l=>l.id)).size===a.length,'Duplicate location IDs').refine(uniqueLocations,'Duplicate locations');
export type KnownLocation=z.infer<typeof locationSchema>;
export type LocationInput=z.input<typeof locationInputSchema>;
export function locationIdentity(l:Pick<KnownLocation,'name'|'hex'|'canonicalLocationId'>){return l.canonicalLocationId?'canonical:'+l.canonicalLocationId:l.hex+':'+l.name.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ').trim()}
export function sameLocation(a:Pick<KnownLocation,'name'|'hex'|'canonicalLocationId'>,b:Pick<KnownLocation,'name'|'hex'|'canonicalLocationId'>){return !!a.canonicalLocationId&&a.canonicalLocationId===b.canonicalLocationId||locationIdentity({...a,canonicalLocationId:undefined})===locationIdentity({...b,canonicalLocationId:undefined})}
function uniqueLocations(items:KnownLocation[]){const names=new Set<string>(),canonical=new Set<string>();for(const l of items){const name=locationIdentity({...l,canonicalLocationId:undefined});if(names.has(name)||l.canonicalLocationId&&canonical.has(l.canonicalLocationId))return false;names.add(name);if(l.canonicalLocationId)canonical.add(l.canonicalLocationId)}return true}
export function visibleLocations(s:Session,explored:string[],options:{fog:boolean;rumors:boolean}){const known=new Set(explored);return (s.locations??[]).filter(l=>l.status==='Rumored'?options.rumors:!options.fog||known.has(l.hex))}
export const locationCommandSchema=z.object({campaignId:z.string().uuid(),actionId:z.string().uuid(),confirmed:z.literal(true),id:z.string().uuid().optional(),expectedUpdatedAt:z.string().datetime().optional(),location:locationInputSchema}).strict();
// Screen-space label placement; icons always remain available when a label won't fit.
export function placeLocationLabels(items:{id:string;name:string;x:number;y:number}[]){const boxes:{x:number;y:number;w:number;h:number}[]=[],placed=new Map<string,{dx:number;dy:number}>();for(const item of items){const w=Math.min(280,item.name.length*7+8),h=18;for(const dy of [-22,-44,22,44,-66,66]){const box={x:item.x+13,y:item.y+dy-13,w,h};if(boxes.every(b=>box.x+box.w<b.x||b.x+b.w<box.x||box.y+box.h<b.y||b.y+b.h<box.y)){boxes.push(box);placed.set(item.id,{dx:13,dy});break}}}return placed}
