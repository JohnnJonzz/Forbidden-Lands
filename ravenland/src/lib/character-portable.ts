import {z} from 'zod';
import {characterSchema} from './validation';
import {applySheet,sheetFor} from './character-sheet';
import type {Character} from './types';
// Portrait IDs, encounters, consequences and roll receipts are campaign assignments.
export const portableCharacterSchema=z.object({format:z.literal('ravenland-character'),version:z.literal(1),character:characterSchema.omit({portraitId:true})}).strict();
export function exportCharacter(character:Character){const {portraitId:_,...portable}=applySheet(character,sheetFor(character));return portableCharacterSchema.parse({format:'ravenland-character',version:1,character:portable});}
export function previewCharacter(raw:unknown){const parsed=portableCharacterSchema.parse(raw);return {portable:parsed,warnings:parsed.character.sheet?.talents?.some(t=>!t.type)?['Some talent types need review; names and ranks are preserved.']:[]};}
