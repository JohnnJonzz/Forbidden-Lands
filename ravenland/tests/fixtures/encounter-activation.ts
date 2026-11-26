export const activationRequest=`Begin a new encounter on the muddy forest road immediately outside The Hollow Watch. This is a local scene in the current hex, not a journey or location change.

There are exactly two combatants: Edrus Braveheart and one bandit equipped with a broadsword only. The bandit has no sling, bow, or other ranged weapon.

They begin at NEAR range. The bandit acts first. Begin combat now and control the bandit's actions automatically, including movement into melee range when appropriate.`;
export const activationAnswer='Yes, the road is a local scene in the current hex; begin combat.';
export const unclearActivation=activationRequest.replace('immediately outside The Hollow Watch','near The Hollow Watch').replace(' This is a local scene in the current hex, not a journey or location change.','');
