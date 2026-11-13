'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function RuleMarkdown({body}:{body:string}){return <div className="rule-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{img:()=>null,a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,table:({children})=><div className="rule-table"><table>{children}</table></div>}}>{body}</Markdown></div>}
