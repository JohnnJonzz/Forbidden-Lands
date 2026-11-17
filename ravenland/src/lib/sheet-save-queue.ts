import type {CharacterSheet} from './character-sheet';
// Keep the acknowledged snapshot separate from a user's latest intention.
export class SheetSaveQueue {
 private desired:CharacterSheet; private running:Promise<void>|null=null;
 error:Error|null=null;
 constructor(public acknowledged:CharacterSheet,private persist:(sheet:CharacterSheet,before:CharacterSheet)=>Promise<unknown>,private changed:(pending:boolean,error:Error|null)=>void){this.desired=structuredClone(acknowledged);}
 get draft(){return this.desired;}
 get dirty(){return JSON.stringify(this.desired)!==JSON.stringify(this.acknowledged);}
 submit(sheet:CharacterSheet){this.desired=structuredClone(sheet);return this.flush();}
 restore(before:CharacterSheet,sheet:CharacterSheet){this.acknowledged=structuredClone(before);this.desired=structuredClone(sheet);return this.flush();}
 reset(sheet:CharacterSheet){if(this.running)throw Error('Wait for the current save before discarding a draft.');this.acknowledged=structuredClone(sheet);this.desired=structuredClone(sheet);this.error=null;this.changed(false,null);}
 async flush():Promise<void>{if(this.running)return this.running;this.error=null;this.changed(this.dirty,null);this.running=(async()=>{while(this.dirty){const sheet=structuredClone(this.desired),before=structuredClone(this.acknowledged);try{const result=await this.persist(sheet,before),ack=(result as {acknowledged?:CharacterSheet}|undefined)?.acknowledged??sheet,latest=this.desired;this.acknowledged=structuredClone(ack);if(JSON.stringify(latest)===JSON.stringify(sheet))this.desired=structuredClone(ack);else{const merged={...ack} as Record<string,unknown>;for(const key of new Set([...Object.keys(sheet),...Object.keys(latest)])){if(JSON.stringify((sheet as Record<string,unknown>)[key])!==JSON.stringify((latest as Record<string,unknown>)[key])){if((latest as Record<string,unknown>)[key]===undefined)delete merged[key];else merged[key]=(latest as Record<string,unknown>)[key];}}this.desired=merged as CharacterSheet;}this.changed(this.dirty,null);}catch(e){this.error=e instanceof Error?e:Error('Character could not be saved');break;}}})().finally(()=>{this.running=null;this.changed(this.dirty,this.error);});return this.running;}
}
