import {characterRegistry} from './character-registry-data';
export const standardAttributes=characterRegistry.attributes;
export const standardSkills=characterRegistry.skills;
export const standardAttributeIds=standardAttributes.map(attribute=>attribute.id);
export type AttributeId=typeof standardAttributes[number]['id'];
export type SkillId=typeof standardSkills[number]['id'];
export type RuleOrigin='official'|'optional'|'house-rule';
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
export function standardSkill(name:string){return standardSkills.find(s=>normalized(s.id)===normalized(name)||normalized(s.name)===normalized(name))??null}
// Extensions remain distinct from the official registry. No arbitrary sheet key
// or free-text house rule can add or rename an official skill.
export interface ScopedSkillDefinition {id:`optional:${string}`|`house:${string}`;name:string;attribute:AttributeId;origin:'optional'|'house-rule';sourceReference:string}
export function validateScopedSkill(definition:ScopedSkillDefinition){return /^(?:optional|house):[a-z0-9][a-z0-9-]{0,60}$/.test(definition.id)&&!standardSkill(definition.name)&&!!definition.sourceReference.trim()&&standardAttributes.some(a=>a.id===definition.attribute)&&definition.id.startsWith(definition.origin==='optional'?'optional:':'house:')}
export const registryContext={attributes:standardAttributes.map(a=>({id:a.id,name:a.name,origin:a.origin})),skills:standardSkills.map(s=>({id:s.id,name:s.name,attribute:s.attribute,origin:s.origin})),extensionPolicy:'Optional and campaign house-rule skills require a separately reviewed, scoped definition. Professions and activities are not skills.'};
