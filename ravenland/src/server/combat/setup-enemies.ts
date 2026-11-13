// Parse enemy quantities once per type, not once per mention. No statistics or
// templates are inferred here; the existing source-backed lookup still owns them.
const quantities:Record<string,number>={a:1,an:1,lone:1,single:1,no:0,zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const quantityWords=Object.keys(quantities).join('|');
const prefix=new RegExp('(?:^|\\s)('+quantityWords+'|[+-]?\\d+(?:\\.\\d+)?)(?:\\s+(?:lone|single))?\\s*$','i');
export function encounterEnemies(text:string):{mentioned:boolean;explicit:boolean;enemies:string;question?:string}{
 const groups=new Map<string,{name:string;counts:Set<number>;singular:boolean}>();let question:string|undefined,explicit=false;
 for(const match of text.matchAll(/\b(bandits?|soldiers?|riders?|thieves|thief|gray bears?|minotaurs?|nightwargs?|drakewyrms?|wolves|wolf)\b/gi)){
  const raw=match[1],key=raw.toLowerCase().replace(/thieves/,'thief').replace(/wolves/,'wolf').replace(/s$/,''),name=key==='thief'?'Thief':key==='wolf'?'Wolf':raw.replace(/s$/i,'');
  const before=text.slice(Math.max(0,match.index!-90),match.index),after=text.slice(match.index!+raw.length),q=before.match(prefix),suffix=after.match(/^\s*[x×]\s*([^\s,;!?]+)/i);
  // "the bandit" and "no other bandits" refer to an existing group.
  if(/\bno other\s*$/i.test(before))continue;
  const group=groups.get(key)??{name,counts:new Set<number>(),singular:!/(?:s|thieves|wolves)$/i.test(raw)};groups.set(key,group);
  const vaguePrefix=/\b(?:several|many|some|few|dozen|couple(?: of)?|another|additional|other)\s*$/i.test(before);
  const uncertain=q&&/\b(?:or|between|at least|at most|up to|about|around|roughly|more than|less than|not)\s*$/i.test(before.slice(0,q.index));
  const ranged=q&&/\b(?:[0-9]+|one|two|three|four|five|six)\s+and\s*$/i.test(before.slice(0,q.index));
  if(vaguePrefix||uncertain||ranged)question='Give an exact enemy count for each type; repeated references and uncertain quantities are not additional enemies.';
  if(suffix||q)explicit=true;
  const token=suffix?.[1]??q?.[1],count=token===undefined?null:quantities[token.toLowerCase()]??Number(token);
  if(count!==null){
   if(!Number.isInteger(count)||count<0||count>6)question='Specify one to six enemies of each type. That quantity cannot be represented safely by this setup.';
   else if(suffix||q&&!/^(?:a|an)$/i.test(q[1]))group.counts.add(count);
   else group.singular=true;
  }
 }
 const rows:string[]=[];
 for(const g of groups.values()){
  if(g.counts.size>1){question='The request gives conflicting counts for the same enemy type. What is the final count?';continue}
  const count=[...g.counts][0]??(g.singular?1:null);
  if(count===null){question='How many enemies of each type are involved?';continue}
  if(count>0)rows.push(g.name+' x'+count);
 }
 return {mentioned:groups.size>0,explicit,enemies:rows.join('; '),...(question?{question}:{})};
}
