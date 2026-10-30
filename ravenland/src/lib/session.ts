import {recordManualClockChange} from './journey/engine';
import {applySheet,type CharacterSheet} from './character-sheet';
import type { Session, Message, Campaign, JournalEntry } from './types';
export type Action = {type:'sheet';characterId:string;sheet:CharacterSheet}| {type:'message';message:Message}|{type:'journal';entry:JournalEntry}|{type:'campaign';patch:Partial<Campaign>}|{type:'reset';session:Session};
export function sessionReducer(state:Session, action:Action):Session {
 switch(action.type){
 case 'sheet':return {...state,characters:state.characters.map(character=>character.id===action.characterId?applySheet(character,action.sheet):character)};
 case 'message':return {...state,messages:[...state.messages,action.message]};
 case 'journal':return {...state,journal:[...state.journal,action.entry]};
 case 'campaign':return recordManualClockChange(state,{...state,campaign:{...state.campaign,...action.patch}},new Date().toISOString(),crypto.randomUUID());
 case 'reset':return {...action.session,...(state.locations?{locations:state.locations,journal:[...action.session.journal.filter(e=>!state.journal.some(j=>j.id===e.id&&state.locations?.some(l=>l.journalEntryId===j.id))),...state.journal.filter(e=>state.locations?.some(l=>l.journalEntryId===e.id))]}:{}),...(state.exploration?{exploration:state.exploration}:{}),...(state.chatJourney?{chatJourney:state.chatJourney}:{}),...(state.dayTracker?{dayTracker:state.dayTracker}:{}),...(state.dayCorrections?{dayCorrections:state.dayCorrections}:{})};
 }
}
export function rollPool(base:number,skill:number,gear:number,random= Math.random) {
 const roll=(count:number,type:string)=>Array.from({length:Math.min(30,Math.max(0,Math.trunc(count)))},()=>({type,value:Math.floor(random()*6)+1}));
 const dice=[...roll(base,'base'),...roll(Math.abs(skill),skill<0?'negative':'skill'),...roll(gear,'gear')];
 return {dice,successes:Math.max(0,dice.reduce((total,die)=>total+(die.value===6?(die.type==='negative'?-1:1):0),0))};
}
