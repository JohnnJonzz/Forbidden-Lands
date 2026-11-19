import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
// Some valid OOXML producers prefix spreadsheet tags (x:workbook, x:worksheet).
// ExcelJS expects unprefixed tag names. Normalize ONLY spreadsheet tag names in memory;
// cell contents and the authoritative source file are never modified.
export async function openWorkbook(file:string){const zip=await JSZip.loadAsync(readFileSync(file));for(const [name,entry] of Object.entries(zip.files)){if(!entry.dir&&name.endsWith('.rels')){let rel=await entry.async('string');const base=posix.dirname(posix.dirname(name));rel=rel.replace(/Target="\/([^"]+)"/g,(_,target)=>`Target="${posix.relative(base==='.'?'':base,target)}"`);zip.file(name,rel);continue}if(entry.dir||!/^xl\/(workbook|styles|sharedStrings|worksheets\/[^/]+|tables\/[^/]+)\.xml$/.test(name))continue;let xml=await entry.async('string');const prefixes=[...xml.matchAll(/xmlns:([\w]+)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g)].map(m=>m[1]);for(const prefix of prefixes)xml=xml.replace(new RegExp(`(<\\/?)${prefix}:`,'g'),'$1');zip.file(name,xml)}const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await zip.generateAsync({type:'arraybuffer'}));return workbook}
