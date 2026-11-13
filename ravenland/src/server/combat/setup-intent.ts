// Bounded intent recognition only; none of these phrases can move a party.
export const setupCancelled=(text:string)=>/^(?:(?:please|no|actually)[,.]?\s+)*(?:cancel(?:\s+(?:it|that|this|the|my|pending|combat|encounter|setup|proposal|request|plan))*|abort(?: the)?(?: encounter| setup| request)?|never mind|nevermind|forget (?:it|that|the encounter)|do not start(?: combat| the encounter)?|don't start(?: combat| the encounter)?)[.!]?$/i.test(text.trim());
export const setupNegative=(text:string)=>/^(?:no\b|nope\b|not quite\b|that.s not right\b)/i.test(text.trim());
export const setupTravel=(text:string)=>/\b(?:move us|move the party|travel to|relocate|change (?:our|the) hex|advance (?:the )?time|(?:proceed|continue|go) to|different hex|far from)\b/i.test(text);
export function setupAffirmed(text:string){return !setupTravel(text)&&/^(?:yes|yep|yeah|sure|correct|confirmed|affirmative)\b/i.test(text.trim())&&!/\b(?:but not|not yet|don.t start|do not start|wait|cancel)\b/i.test(text)}
export function setupContinue(text:string){return !setupTravel(text)&&(/^(?:proceed|go ahead|continue|let.s begin)(?:[,.! ]|$)/i.test(text.trim())||/^(?:run|start|begin)\b.*\b(?:as described|as planned|same (?:encounter|proposal)|original (?:encounter|proposal))\b/i.test(text.trim()))}
export const setupUseCurrent=(text:string)=>/^(?:(?:no|actually|instead)[,.]?\s+)?(?:use|keep) (?:the )?(?:current|existing|saved) (?:campaign )?location[.!]?$/i.test(text.trim());
// Questions about people or rules are not edits just because they mention a
// participant or enemy from the held proposal.
export const setupInquiry=(text:string)=>/^(?:please\s+)?(?:what|which|who|why|where|when|how|tell me|explain|describe)\b/i.test(text.trim());
