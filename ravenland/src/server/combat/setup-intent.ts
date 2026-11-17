// Bounded intent recognition only; none of these phrases can move a party.
export const setupCancelled=(text:string)=>/^(?:(?:please|no|actually)[,.]?\s+)*(?:cancel(?:\s+(?:it|that|this|the|my|pending|combat|encounter|setup|proposal|request|plan))*|abort(?: the)?(?: encounter| setup| request)?|never mind|nevermind|forget (?:it|that|the encounter)|do not start(?: combat| the encounter)?|don't start(?: combat| the encounter)?)[.!]?$/i.test(text.trim());
export const setupNegative=(text:string)=>/^(?:no\b|nope\b|not quite\b|that.s not right\b)/i.test(text.trim());
// Remove only explicit denials of travel, never an entire sentence containing
// a denial: "not a journey; travel to W24" still requests travel.
export const withoutTravelDenials=(text:string)=>text.replace(/\b(?:not|neither) (?:a |an )?(?:journey|location change|hex change|travel)(?:\s*(?:or|nor)\s*(?:a )?(?:journey|location change|hex change|travel))?\b/gi,'').replace(/\bno (?:journey|travel|location change|hex change)\b/gi,'').replace(/\b(?:do not|don't|never)\s+(?:move us|move the party|travel to|relocate|change (?:our|the|campaign) hex|advance (?:the )?time)\b/gi,'');
export const setupTravel=(text:string)=>/\b(?:move us|move the party|travel to|relocate|change (?:our|the) hex|advance (?:the )?time|(?:proceed|continue|go) to|different hex|far from)\b/i.test(withoutTravelDenials(text));
export function setupAffirmed(text:string){return !setupTravel(text)&&/^(?:yes|yep|yeah|sure|correct|confirmed|affirmative)\b/i.test(text.trim())&&!/\b(?:but not|not yet|don.t start|do not start|wait|cancel)\b/i.test(text)}
// Continuation of a scene is not confirmation of an encounter plan. Keep bare
// confirmations for the currently pending question and explicit plan references.
export function setupContinue(text:string){return !setupTravel(text)&&(/^(?:proceed|go ahead|continue|let[’']s begin)[.! ]*$/i.test(text.trim())||/^(?:proceed|go ahead|continue|resume|run|start|begin)\s+(?:(?:with|using|from)\s+)?(?:(?:the|this|that|same|original|held|pending|previous)\s+)*(?:encounter|setup|proposal|plan)\b[^.!?\n]*[.!]?$/i.test(text.trim()))}
// With no pending question, a generic “yes” is not a request to reuse an old plan.
export const setupResumeRequested=(text:string)=>setupContinue(text)&&/\b(?:encounter|setup|proposal|plan)\b/i.test(text)||/^(?:yes|yep|yeah|sure|correct|confirmed|affirmative)[, ]+(?:(?:please|proceed|go ahead|continue)[, ]*)+[.!]?$/i.test(text.trim())||/^(?:please\s+)?(?:resume|proceed with|start|begin|run|use)\s+(?:(?:the|same|original|held|pending|previous|that)\s+)*(?:encounter|setup|proposal|plan)\b/i.test(text);

export const setupUseCurrent=(text:string)=>/^(?:(?:no|actually|instead)[,.]?\s+)?(?:use|keep) (?:the )?(?:current|existing|saved) (?:campaign )?location[.!]?$/i.test(text.trim());
// Questions about people or rules are not edits just because they mention a
// participant or enemy from the held proposal.
export const setupInquiry=(text:string)=>/^(?:please\s+)?(?:what|which|who|why|where|when|how|tell me|explain|describe)\b/i.test(text.trim());
