import type {RulePassage} from '../../lib/sourcebooks/schema';
import type {MechanicalTopic} from '../../lib/rules/topics';
import {anchoredTopics,passageTopics} from './selection';
export function coversSubject(p:RulePassage,subject:MechanicalTopic){return anchoredTopics(p).includes(subject)}
export function supportsSubject(p:RulePassage,subject:MechanicalTopic){return passageTopics(p).includes(subject)}
export function sourceTier(p:RulePassage){return 'sourceType'in p?(p.sourceType==='house-rule'&&p.overrideApplicable?0:p.sourceType==='curated'?1:2):3}
export function passageTokens(p:RulePassage){const metadata='sourceType'in p?[p.primaryTopic,p.tags?.join(' '),p.description].filter(Boolean).join(' '):'';return Math.ceil(Buffer.byteLength(p.text+' '+p.title+' '+('headingPath'in p?p.headingPath?.join(' ')??'':'')+(metadata?' '+metadata:''))/3)+80}
