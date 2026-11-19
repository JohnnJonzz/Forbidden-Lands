// Public DTO only. Instruction contents are served exclusively by the privileged endpoint.
export const maxGMInstructionCharacters=80000;
export interface GMInstructionRecord {text:string;isDefault:boolean;revision:number;lastSavedAt:string|null}
