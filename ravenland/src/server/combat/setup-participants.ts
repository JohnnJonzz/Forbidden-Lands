import type {Character,Session} from '../../lib/types';
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function namedParticipants(text:string,characters:Character[]){
 const full=characters.filter(c=>new RegExp('\\b'+escape(c.name)+'\\b','i').test(text)),ids=new Set(full.map(c=>c.id));let ambiguous=false;
 for(const c of characters){const alias=c.name.split(/\s+/)[0];if(!new RegExp('\\b'+escape(alias)+'\\b','i').test(text))continue;const matches=characters.filter(c=>c.name.split(/\s+/)[0].toLowerCase()===alias.toLowerCase());if(matches.length===1)ids.add(c.id);else if(!matches.some(m=>ids.has(m.id)))ambiguous=true}
 return {ids:[...ids],ambiguous};
}
export function encounterParticipants(text:string,s:Session,actorId:string,prior?:{participants:string[];participantsKnown:boolean;excludedParticipants?:string[];absentCharacters?:string[]}){
 const words=s.characters.flatMap(c=>[c.name,c.name.split(/\s+/)[0]]).sort((a,b)=>b.length-a.length).map(escape),name='(?:'+words.join('|')+')',list=name+'(?:(?:\\s*,\\s*|\\s+and\\s+|\\s*&\\s*)'+name+')*';
 const names=namedParticipants(text,s.characters),excluded=new Set(prior?.excludedParticipants??[]),absent=new Set(prior?.absentCharacters??[]);
 for(const m of text.matchAll(new RegExp('\\b('+list+')\\s+(?:(?:is|are|will be|has|have)\\s+)?(?:not (?:present|here|participating|involved|joining|fighting)|absent|stayed behind|stays? behind|remains? at|elsewhere|left the party|will not (?:join|fight)|does not participate)\\b','gi'))){for(const id of namedParticipants(m[1],s.characters).ids){excluded.add(id);if(/not (?:present|here)|absent|behind|remains? at|elsewhere|left the party/i.test(m[0]))absent.add(id)}}
 for(const m of text.matchAll(/\b(?:without|except(?: for)?|excluding|exclude|do not include|don't include|not including)\s+([^.!?\n]+)/gi))for(const id of namedParticipants(m[1].split(/\b(?:but|while|however)\b/i)[0],s.characters).ids)excluded.add(id);
 const exclusive=[...text.matchAll(new RegExp('\\b(?:only|just)\\s+('+list+')','gi'))].filter(m=>!/\bnot\s*$/i.test(text.slice(0,m.index))).map(m=>namedParticipants(m[1],s.characters));
 const alone=[...text.matchAll(new RegExp('\\b('+name+')\\s+(?:(?:is|was)\\s+)?(?:(?:travel(?:s|ing)?|walk(?:s|ing)?|rid(?:es?|ing)|fight(?:s|ing)?)\\s+)?alone\\b','gi'))].flatMap(m=>namedParticipants(m[1],s.characters).ids);
 if(/\bI (?:am |travel |am traveling )?alone\b/i.test(text))alone.push(actorId);
 const solo=[...new Set(alone)];if(solo.length===1)exclusive.push({ids:solo,ambiguous:false});
 let participants=exclusive.at(-1)?.ids??(names.ids.filter(id=>!excluded.has(id)).length?names.ids:prior?.participants??[]),known=names.ids.some(id=>!excluded.has(id))&&!names.ambiguous||prior?.participantsKnown===true;
 if(exclusive.length){known=exclusive.every(p=>!p.ambiguous&&[...p.ids].sort().join()===([...exclusive[0].ids].sort().join()));}
 else if(/\b(?:entire party|whole party|all (?:the )?party|full party|everyone|all of us|all (?:[0-9]+|one|two|three|four|five|six)\b)\b/i.test(text)){
  const recent=s.messages.filter(m=>m.role==='gm'&&!m.quarterDayFormId).slice(-3).map(m=>m.text).join(' '),present=recent.split(/[.!?]/).filter(line=>/\b(?:present:|are (?:present|here|together)|is here)\b/i.test(line)).join(' '),scene=namedParticipants(present,s.characters),totals=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
  const all=new RegExp('\\ball (?:'+s.characters.length+'|'+totals[s.characters.length]+')\\b|everyone in the (?:campaign |party )?roster','i').test(text);
  participants=names.ids.some(id=>!excluded.has(id))?names.ids:all?s.characters.map(c=>c.id):scene.ids;
  participants=participants.filter(id=>{const c=s.characters.find(c=>c.id===id)!;return !new RegExp('\\b'+escape(c.name.split(/\s+/)[0])+'\\b[^.!?]{0,60}\\b(?:absent|stayed behind|remains at|is elsewhere|left the party)\\b','i').test(recent)});known=participants.length>0&&!scene.ambiguous;
 }else if(!participants.length&&/\b(?:I|me|my|one[- ]on[- ]one)\b/i.test(text)){participants=[actorId];known=true}
 participants=participants.filter(id=>!excluded.has(id));
 if(/\b(?:no other party members?|no companions?) (?:is|are) present\b/i.test(text)||solo.length===1){for(const c of s.characters)if(!participants.includes(c.id)){excluded.add(c.id);absent.add(c.id)}}
 return {participants,participantsKnown:known&&participants.length>0&&!names.ambiguous,excludedParticipants:[...excluded],absentCharacters:[...absent],recognized:!!names.ids.length||!!exclusive.length||!!solo.length||/\b(?:party|all of us|all (?:[0-9]+|one|two|three|four|five|six))\b/i.test(text)};
}
