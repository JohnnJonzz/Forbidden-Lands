// Source preferences and page references are data, never authority to change state.
export function sourceRequest(action:string){
 const positive=action.replace(/\b(?:do not|don't)\s+use\s+(?:the\s+)?(?:official\s+|original\s+)?[\p{L}'’ -]{0,90}\bPDF\b/giu,'').replace(/\b(?:do not|don't)\s+use\s+[^.!?\n;]{0,150}?(?:handbook|rulebook|manual|guide)\b/giu,'');
 const pdfOnly=/\b(?:do not|don't|without)\s+(?:use|using)\s+(?:any\s+)?curated\b/i.test(action)||/\b(?:use|using|from)\b[^.!?\n]{0,150}\b(?:original|official)\b[^.!?\n]{0,100}\bPDF\b|\bPDF\s+(?:only|alone)\b/i.test(positive);
 const book=positive.match(/\b(?:according to|using|use|from|in)\s+(?:the\s+)?(?:official\s+|original\s+)?([^.!?\n]{2,100}?(?:handbook|rulebook|manual|guide))\b/i)?.[1]?.trim();
 const raw=positive.match(/\b(?:using|use|from|in)\s+(?:the\s+)?(?:official\s+|original\s+)?([^.!?\n]{2,120}?)\s+PDF\b/i)?.[1]?.trim()??book;
 const sourceTitle=raw&&raw.replace(/\b(?:the|an?|official|original)\b/gi,'').trim()?raw:undefined;
 const page=action.match(/\b(printed|physical(?:\s+PDF)?|PDF)\s+page\s+(\d{1,4})\b/i),value=page?Number(page[2]):0;
 return {pdfOnly:pdfOnly||!!book,sourceTitle,pageReference:page&&value>0?{kind:page[1].toLowerCase()==='printed'?'printed' as const:'physical' as const,value}:undefined};
}
export function sourceNameMatches(title:string,filename:string,requested:string){const normalize=(s:string)=>s.replace(/^Forbidden Lands\s+/i,'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(w=>w.length>1&&!['the','an','official','original'].includes(w)).map(w=>w.replace(/s$/,'')),known=new Set(normalize(title+' '+filename)),wanted=normalize(requested);return wanted.length>0&&wanted.every(w=>known.has(w))}
