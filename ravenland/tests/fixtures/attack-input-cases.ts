export const playerInputReproduction="A character fires a Longbow and rolls three successes on their Marksmanship attack. How much damage does the attack inflict before armor, assuming all additional successes are spent increasing damage and no other modifiers apply?";
export const playerInputCases=[
 ...[0,1,2,3,4].map(n=>({name:n+' successes',question:'A character fires a Longbow and rolls '+n+' successes. How much damage before armor?',attack:n,damageSuccesses:Math.max(0,n-1),damage:n})),
 {name:'exact reported question',question:playerInputReproduction,attack:3,damageSuccesses:2,damage:3},
 ...['I rolled three successes.','I rolled 3 successes.','I rolled three sixes.'].map(phrase=>({name:phrase,question:'For a Longbow attack: '+phrase+' How much damage before armor?',attack:3,damageSuccesses:2,damage:3})),
 {name:'legacy partial allocation does not change SHOOT',question:'For a Longbow attack: Three successes, but I spend only one extra success increasing damage. How much damage before armor?',attack:3,damageSuccesses:2,damage:3},
 {name:'legacy zero allocation does not change SHOOT',question:'For a Longbow attack: I rolled three successes but spend zero additional successes on damage. How much damage before armor?',attack:3,damageSuccesses:2,damage:3},
 {name:'threshold precedes roll',question:'An ordinary ranged attack requires one success to hit. A character fires a Longbow and rolls three successes. How much damage before armor?',attack:3,damageSuccesses:2,damage:3},
];
