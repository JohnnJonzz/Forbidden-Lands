import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
const dir=process.env.RAVENLAND_REAL_SOURCEBOOK_DIR;
const book=(name:string)=>{assert.ok(dir,'Set RAVENLAND_REAL_SOURCEBOOK_DIR to the original private PDFs.');const path=join(dir,name);assert.ok(existsSync(path),'Original private PDF required: '+name);return execFileSync('pdftotext',['-raw',path,'-'],{maxBuffer:12*1024*1024}).toString().replace(/[‐‑­-]\s*\n\s*/g,'').replace(/\s+/g,' ')};
test('original fifth-printing Guide verifies eight phases, reviewed 45/46-day festivals and AS year numbering',()=>{
 const text=book('Forbidden_Lands_Gamemasters_Guide_5th_printing.r.pdf');
 assert.ok(/year is divided into eight phases, split up by eight festivals/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/Every phase is 45 or 46 days long/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/During the Midwinter celebration[\s\S]{0,250}decree when the different festivals will be celebrated/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/AS \(After the Shift\)/.test(text),'Original PDF rule check failed (source text intentionally omitted).');assert.ok(/1165 AS NOW/.test(text),'Original PDF rule check failed (source text intentionally omitted).');
});
test('original Handbook keeps seasonal Foraging and critical healing rules separate from campaign weather',()=>{
 const text=book('Forbidden_Lands_Players_Handbook_5th_printing.pdf');
 assert.ok(/Spring[\s\S]{0,120}Summer[\s\S]{0,120}Autumn[\s\S]{0,120}Winter/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/remaining healing time is reduced by half/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/earlier roll to save your life does not count/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
 assert.ok(/measured in days/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');assert.ok(/recover all your lost attribute points, but still suffer the effects of a critical injury/i.test(text),'Original PDF rule check failed (source text intentionally omitted).');
});
