import {detectTopics,mechanicalTopics} from '../rules/topics';
export function normalizeTag(value:string){const tag=value.normalize('NFKC').toLowerCase().replace(/^#+/,'').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');return ({quarterday:'quarter-day',charactercreation:'character-creation'} as Record<string,string>)[tag.replaceAll('-','')]??tag}
export function normalizeTags(values:string[]){return [...new Set(values.map(normalizeTag).filter(Boolean))].slice(0,20)}
// Results cards use a short plain description, never a raw Markdown slice.
export function readableDescription(body:string,max=240){return body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,' ').split(/\r?\n/).filter(line=>!/^\s*(?:#{1,6}\s|\*{0,2}(?:category|classification|primary topic|tags|source reference|visibility)\*{0,2}\s*:|\|?\s*[-:|]{3,})/i.test(line)).join(' ').replace(/<[^>]*>/g,' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`#|>]/g,'').replace(/\s+/g,' ').trim().slice(0,max)}
export interface DocumentMetadata {primaryTopic:string;tags:string[];description:string}
export interface MetadataSource extends DocumentMetadata {title:string;body:string;topic:string}
export function suggestMetadata(source:MetadataSource){
 const headings=source.body.match(/^#{1,6}\s+.+$/gm)??[],topics=detectTopics(source.title+' '+headings.slice(0,12).join(' ')),generic=/^(?:general|core|rules|compendium|book|journeying|journeys)(?:\s|$)/i.test(source.title)&&topics.length>2;
 const primary=source.title.replace(/\s*[—–-]\s*Official (?:Rules |Procedure|Summary).*$/i,'').replace(/\s*[—–-]\s*Official Procedure$/i,'').replace(/^(?:Journey|Journeys)\s*[-—–:]\s*/i,'').replace(/\s*[-—–]\s*/g,' ').trim();
 const tags=topics.slice(0,6).map(t=>normalizeTag(mechanicalTopics[t].label));
 if(topics.some(t=>['journey','forage','hunt','fish','camp'].includes(t)))tags.unshift('journeying');
 if(/\bprofession\b/i.test(source.title))tags.splice(0,tags.length,'profession','character-creation','skills',...source.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2&&w!=='profession').slice(0,2));
 for(const word of ['survival','marksmanship','quarter-day','food','water','mishaps'])if(new RegExp('\\b'+word.replace('-','[ -]')+'\\b','i').test(source.body)&&tags.length<8)tags.push(word);
 const suggested={primaryTopic:source.primaryTopic||(!generic?primary:''),tags:source.tags.length?source.tags:normalizeTags(tags),description:source.description||readableDescription(source.body)};
 const changed=suggested.primaryTopic!==source.primaryTopic||JSON.stringify(suggested.tags)!==JSON.stringify(source.tags)||suggested.description!==source.description;
 return {suggested,changed,needsReview:generic||!suggested.primaryTopic,reason:generic?'Multiple subjects under a general title; review primary topic.':!suggested.primaryTopic?'No clear primary topic.':'Deterministic title, heading and content suggestion; review before applying.'};
}

export function metadataSignals(source:{title:string;primaryTopic?:string;tags?:string[];description?:string;heading?:string|null},query:string){const terms=query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[],phrase=query.replaceAll('"','').trim().toLowerCase(),fields:string[]=[];if(source.title.toLowerCase()===phrase)fields.push('exact title');if(source.primaryTopic&&source.primaryTopic.toLowerCase()===phrase)fields.push('exact primary topic');for(const [field,value] of [['primary topic',source.primaryTopic??''],['tags',source.tags?.join(' ')??''],['heading',source.heading??''],['description',source.description??'']])if(terms.some(t=>value.toLowerCase().includes(t)))fields.push(field);return fields}
