export type Quarter = 'Morning' | 'Day' | 'Evening' | 'Night';
export type Panel = 'Map' | 'Dice Roller' | 'Characters' | 'Journal' | 'Campaign Settings';
export interface Character { id: string; name: string; kin: string; profession: string; initials: string; color: string; strength: number; agility: number; wits: number; empathy: number; }
export interface Message { id: string; role: 'gm' | 'player'; author: string; text: string; }
export interface Campaign { name: string; date: string; quarter: Quarter; hex: string; location: string; terrain: string; weather: string; objective: string; }
export interface JournalEntry { id: string; title: string; text: string; }
export interface Session { campaign: Campaign; characters: Character[]; messages: Message[]; journal: JournalEntry[]; }
// Replace this boundary with a server transport and repository in a later phase.
export interface GameMaster { respond(action: string, character: string): string; }
