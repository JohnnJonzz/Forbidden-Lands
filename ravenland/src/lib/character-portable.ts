import {z} from 'zod';
import {characterSchema} from './validation';
import {applySheet,sheetFor} from './character-sheet';
import type {Character} from './types';
// Portrait IDs, encounters, consequences and roll receipts are campaign assignments.
export const portableCharacterSchema=z.object({format:z.literal('ravenland-character'),version:z.literal(1),character:characterSchema.omit({portraitId:true})}).strict();
export function exportCharacter(character:Character){const {portraitId:_,...portable}=applySheet(character,sheetFor(character));return portableCharacterSchema.parse({format:'ravenland-character',version:1,character:portable});}
export function previewCharacter(raw:unknown){const parsed=portableCharacterSchema.parse(raw);return {portable:parsed,warnings:[...(parsed.character.sheet?.talents?.some(t=>!t.type)?['Some talent types need review; names and ranks are preserved.']:[]),...(parsed.character.sheet?.creatures?.length?['Imported creatures are independent copies with new identities. Accompanying and mounted status must be established again.']:[])]};}

export function copyCreatureOwnership<T extends Character>(character:T):T{if(!character.sheet?.creatures?.length)return character;const ids=new Map<string,string>(),itemId=(id:string)=>{let next=ids.get(id);if(!next){next=crypto.randomUUID();ids.set(id,next);}return next;};return {...character,sheet:{...character.sheet,gear:character.sheet.gear?.map(g=>({...g,...(g.itemId?{itemId:itemId(g.itemId)}:{})})),weapons:character.sheet.weapons?.map(w=>({...w,...(w.itemId?{itemId:itemId(w.itemId)}:{})})),creatures:character.sheet.creatures.map(c=>({...structuredClone(c),id:crypto.randomUUID(),inventory:c.inventory.map(i=>({...i,itemId:itemId(i.itemId)})),mounted:false,accompanies:false}))}};}
