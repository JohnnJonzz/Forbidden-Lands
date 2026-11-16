// Controlled SDK responses for named regression scenarios only. This module is
// imported exclusively by the test transport, never by application code.
export function controlledActionInterpretation(c){
 const text=c.playerDeclaration.trim().toLowerCase(),foes=c.combatants.filter(a=>a.side==='enemy'&&!a.broken&&!a.withdrawn),target=foes.find(a=>text.includes(a.name.toLowerCase()))??(foes.length===1?foes[0]:null);
 const base={encounterId:c.encounterId,actorId:c.actorId,disposition:'actions',actions:[],message:null};
 const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const weapon=c.weapons.find(w=>norm(text).includes(norm(w.name)))??c.weapons.find(w=>text.includes('sword')&&norm(w.name).includes('sword'));
 const attack=(type=null)=>({type:'prepare_attack',targetId:target?.id??foes[0]?.id,weaponRef:weapon?.ref??c.attackChoice?.weaponRef??c.weapons[0]?.ref,attackType:type});
 const move=to=>({type:'move',targetId:target?.id??foes[0]?.id,to});
 const ask=message=>({...base,disposition:'clarification',message});
 if(['i end my turn.','i end my turn','end my turn.','end my turn','finish my turn.'].includes(text))base.actions=[{type:'end_turn'}];
 else if(['stand.','stand up.','i stand up.','stand','i stand up'].includes(text))base.actions=[{type:'stand'}];
 else if(['no defense.','i do not defend.','i choose no defense.','no defense','i declare none before the attack roll.'].includes(text))base.actions=[{type:'declare_defense',defense:'none'}];
 else if(['i dodge his attack.','i try to dodge his attack!','i dodge.'].includes(text))base.actions=[{type:'declare_defense',defense:'dodge'}];
 else if(['i parry.','i declare parry.'].includes(text))base.actions=[{type:'declare_defense',defense:'parry'}];
 else if(['i back away.','i retreat.'].includes(text))base.actions=[move(c.positions.range==='Arm'?'Near':'Short')];
 else if(['i approach the bandit.','edrus approaches slowly, sword drawn.','edrus closes the distance.','move closer to the bandit.','i move into melee range.',"edrus closes from near to arm's length.","edrus uses his movement action to close from near to arm's length with bandit 1. record the movement in combat state.",'i use my movement action to approach bandit 1.'].includes(text))base.actions=[move(c.positions.range==='Short'?'Near':'Arm')];
 else if(["move to arm's length and attack bandit 1 with my shortsword.","move to arm's length and attack with my shortsword.","move to arm's length and attack with shortsword."].includes(text))base.actions=[move('Arm'),attack()];
 else if(['draw my sword and approach.','draw my shortsword and approach.'].includes(text))base.actions=[{type:'draw_weapon',weaponRef:weapon?.ref??c.weapons[0]?.ref},move(c.positions.range==='Short'?'Near':'Arm')];
 else if(text==='ready my longbow and shoot.')base.actions=[{type:'ready_weapon',weaponRef:weapon.ref},attack('shoot')];
 else if(text==='load my heavy crossbow and shoot.')base.actions=[{type:'load_weapon',weaponRef:weapon.ref},attack('shoot')];
 else if(text.startsWith('i draw my ')&&weapon)base.actions=[{type:'draw_weapon',weaponRef:weapon.ref}];
 else if(text.startsWith('i ready my ')&&weapon)base.actions=[{type:'ready_weapon',weaponRef:weapon.ref}];
 else if(text.startsWith('i load my ')&&weapon)base.actions=[{type:'load_weapon',weaponRef:weapon.ref}];
 else if(/^(?:i )?(?:attack|slash|stab|shoot)\b/.test(text))base.actions=[attack(/\bslash\b/.test(text)?'slash':/\bstab\b/.test(text)?'stab':/\bshoot\b/.test(text)?'shoot':null)];
 else if(['i try to shove him down the stairs.','i drop my sword.'].includes(text))return {...base,disposition:'unsupported',message:'That maneuver requires adjudication; no actions or dice were spent.'};
 else if(text==='i hit for 3 damage.')return ask('That reported outcome has not been verified. Attach the original saved roll for the recorded action.');
 else return {...base,disposition:'conversation'};
 return base;
}
