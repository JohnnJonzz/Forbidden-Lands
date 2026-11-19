import type { GameMaster, Session } from './types';
export const initialSession: Session = {
 campaign: {description:'An original expedition into the mist-shrouded northern woodlands.',settings:{tone:'Grim',houseRules:''},name:'The Ravenland Chronicles',date:'12th of Stillfall, 1165',quarter:'Evening',hex:'H14',location:'The Hollow Watch',terrain:'Misty woodland',weather:'Cold rain · Wind from the north',objective:'Find the missing caravan before its trail disappears.'},
 characters:[
 {id:'ilva',name:'Ilva Ashborn',kin:'Human',profession:'Hunter',initials:'IA',color:'#a99c65',strength:3,agility:4,wits:3,empathy:2},
 {id:'brom',name:'Brom Stonehand',kin:'Dwarf',profession:'Fighter',initials:'BS',color:'#ab7964',strength:5,agility:2,wits:2,empathy:3},
 {id:'nerys',name:'Nerys Hollowleaf',kin:'Elf',profession:'Druid',initials:'NH',color:'#7c9a83',strength:2,agility:3,wits:4,empathy:3},
 {id:'pip',name:'Pip Underbough',kin:'Halfling',profession:'Rogue',initials:'PU',color:'#9287ac',strength:2,agility:5,wits:3,empathy:2}],
 messages:[
 {id:'scene',role:'gm',author:'The Game Master',text:'Rain threads through the black pines as the last light slips behind the hills. Ahead, a ruined watchtower leans above the road. No fire burns in its windows.\n\nAt the foot of the tower, a wagon lies on its side. One wheel is still turning. A trail of silver bells leads from the wreck into the trees. Somewhere beyond them, a bell answers.\n\nWhat do you do?'},
 {id:'player1',role:'player',author:'Ilva Ashborn',text:'I kneel beside the wagon and look for tracks. Did anyone leave on foot?'},
 {id:'gm2',role:'gm',author:'The Game Master',text:'Under the wagon’s broken axle you find three sets of bootprints. Two head north into the wood. The third circles the wagon and stops abruptly.\n\nA strip of blue cloth is caught on a splinter. It is dry, despite the rain. Brom notices a faint scratching from inside the overturned wagon.'}],
 journal:[{id:'j1',title:'A road gone quiet',text:'Three wagons vanished along the northern road. A merchant offered supplies for news of the drivers.'},{id:'j2',title:'The silver bells',text:'Small silver bells lead from the wreck toward the northern trees. One rang in reply.'}]
};
export const mockGameMaster: GameMaster = { respond(action, character) {
 const text=action.toLowerCase();
 if(/wagon|scratch|inside/.test(text)) return `${character} approaches the wagon. The scratching stops. A small wooden box shifts beneath a torn canvas, and someone whispers, “Please don’t ring the bells.” A rusted latch holds it closed.\n\nWill you open the box, speak to the voice, or investigate the wagon further?`;
 if(/track|forest|wood|north|bell/.test(text)) return `Beyond the first line of trees, ${character} finds a bootprint filled with clear water. A second trail leads toward a low stone arch. The silver bells grow quiet as you approach.\n\nYou can follow the trail or return to the others. What do you choose?`;
 return `${character} takes a moment to act while the others keep watch. A gust lifts the blue cloth, revealing a carved raven beneath it. From the tower comes a single knock.\n\nThe road, the wagon, and the tower each offer a different lead. How does the party proceed?`;
}};
