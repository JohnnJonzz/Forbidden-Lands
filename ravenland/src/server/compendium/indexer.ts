import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {indexedTopics} from '../../lib/rules/topics';
export interface IndexedRuleSection {text:string;heading:string|null;headingPath:string[];sectionOrder:number;chunkOrder:number;startOffset:number;endOffset:number}
// Keep source offsets, parent headings and fenced code. Only the derived index is changed.
export function headingSections(body:string):IndexedRuleSection[]{const groups:{start:number;end:number;path:string[]}[]=[];let start=0,offset=0,fence='',fenceLength=0,path:string[]=[],stack:{level:number;title:string}[]=[];
 for(const raw of body.match(/[^\n]*\n|[^\n]+$/g)??[]){const line=raw.replace(/\r?\n$/,''),marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];if(marker){if(!fence){fence=marker[0];fenceLength=marker.length}else if(marker[0]===fence&&marker.length>=fenceLength)fence=''}
  const heading=!fence?/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line):null;
  if(heading){if(offset>start)groups.push({start,end:offset,path:[...path]});const level=heading[1].length;while(stack.length&&stack.at(-1)!.level>=level)stack.pop();stack.push({level,title:heading[2]});path=stack.map(h=>h.title);start=offset}offset+=raw.length;
 }if(start<body.length)groups.push({start,end:body.length,path:[...path]});
 const result:IndexedRuleSection[]=[];let sectionOrder=0;
 for(const group of groups){const source=body.slice(group.start,group.end);if(!source.replace(/^ {0,3}#{1,6}\s+.*$/gm,'').trim())continue;const protectedRanges:{start:number;end:number}[]=[];let pos=0,blockStart=-1,kind='',code='';
  const lines=source.match(/[^\n]*\n|[^\n]+$/g)??[];
  for(let i=0;i<lines.length;i++){const line=lines[i],trim=line.trim(),f=/^\s*(`{3,}|~{3,})/.exec(line)?.[1],list=/^\s*(?:\d+[.)]|[-+*])\s+/.test(line),table=/\|/.test(line);if(f){if(!code){code=f[0];if(blockStart<0){blockStart=pos;kind='code'}}else if(f[0]===code){code='';protectedRanges.push({start:blockStart,end:pos+line.length});blockStart=-1;kind=''}}
   if(!code&&!f){if(blockStart<0&&(list||table)){blockStart=pos;kind=list?'list':'table'}else if(blockStart>=0){const next=lines.slice(i+1).find(l=>!!l.trim())??'';const continues=kind==='list'?(list||/^\s{2,}\S/.test(line)||!trim&&/^\s*(?:\d+[.)]|[-+*])\s+/.test(next)):kind==='table'&&table;if(!continues){protectedRanges.push({start:blockStart,end:pos});blockStart=-1;kind=''}}}pos+=line.length;
  }if(blockStart>=0)protectedRanges.push({start:blockStart,end:source.length});
  let chunkStart=0,chunkOrder=0;
  while(chunkStart<source.length){let end=Math.min(chunkStart+6000,source.length);if(end<source.length){let boundary=source.lastIndexOf('\n\n',end);if(boundary<chunkStart+1800)boundary=source.lastIndexOf('\n',end);if(boundary>chunkStart+1800)end=boundary;const block=protectedRanges.find(r=>r.start<end&&r.end>end&&r.end-r.start<=6000);if(block)end=block.start>chunkStart?block.start:Math.min(source.length,block.end)}if(end<=chunkStart)end=Math.min(chunkStart+6000,source.length);
   const text=source.slice(chunkStart,end);if(text.trim())result.push({text,heading:group.path.at(-1)??null,headingPath:group.path,sectionOrder,chunkOrder:chunkOrder++,startOffset:group.start+chunkStart,endOffset:group.start+end});if(end===source.length)break;
   let next=Math.max(chunkStart+1,end-260);const block=protectedRanges.find(r=>r.start<next&&r.end>=end);if(block)next=end;else{const line=source.indexOf('\n',next);if(line>next&&line<end)next=line+1}chunkStart=next;
  }sectionOrder++;
 }return result}
export function indexCuratedRule(db:DatabaseSync,row:Record<string,unknown>){db.prepare('DELETE FROM curated_rule_sections WHERE document_id=?').run(row.id as string);headingSections(row.body as string).forEach((s,i)=>db.prepare('INSERT INTO curated_rule_sections(id,document_id,sequence,title,topic,text,source_reference,heading,heading_path,section_order,chunk_order,start_offset,end_offset,mechanical_topics) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),row.id as string,i,row.title as string,row.topic as string,s.text,row.source_reference as string,s.heading,JSON.stringify(s.headingPath),s.sectionOrder,s.chunkOrder,s.startOffset,s.endOffset,JSON.stringify(indexedTopics(s.headingPath,s.text,row.title as string,row.topic as string))))}
export function reindexExistingCuratedRules(db:DatabaseSync){for(const row of db.prepare('SELECT * FROM curated_rules ORDER BY id').iterate())indexCuratedRule(db,row)}
