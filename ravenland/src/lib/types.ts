import type {CharacterSheet} from './character-sheet';
export type Quarter = 'Morning' | 'Day' | 'Evening' | 'Night';
export type Panel = 'Map' | 'Dice Roller' | 'Characters' | 'Journal' | 'Campaign Settings' | 'Image Library' | 'Journey Settings' | 'Quarter-Day Activities';
export interface Character { portraitId?:string|null; sheet?:CharacterSheet; id: string; name: string; kin: string; profession: string; initials: string; color: string; strength: number; agility: number; wits: number; empathy: number; }
export interface Message { quarterDayFormId?:string; id: string; role: 'gm' | 'player'; author: string; text: string; }
export interface Campaign { name: string; description: string; settings: {tone:'Grim'|'Balanced'|'Heroic';houseRules:string}; date: string; quarter: Quarter; hex: string; location: string; terrain: string; weather: string; objective: string; }
export interface JournalEntry { id: string; title: string; text: string; }
export interface Session { locations?:import('./map/locations').KnownLocation[]; exploration?:import('./map/exploration').Exploration; chatJourney?:import('./journey/chat-schema').ChatJourney; dayCorrections?:import('./journey/day-tracker').DayCorrection[]; dayTracker?:import('./journey/day-tracker').DayRecord[]; diceGroups?:import('./dice/group-schema').DiceGroups; dice?:import('./dice/schema').PendingDice[]; quarterDays?:import('./journey/quarter-schema').QuarterState; journey?:import('./journey/schema').JourneyState; discoveries?:import('./map/types').Discovery[]; campaign: Campaign; characters: Character[]; messages: Message[]; journal: JournalEntry[]; }
// Replace this boundary with a server transport and repository in a later phase.
export interface GameMaster { respond(action: string, character: string): string; }

export interface CampaignRecord {id:string;revision:number;session:Session;createdAt:string;updatedAt:string}
export interface CampaignSummary {id:string;name:string;updatedAt:string}
