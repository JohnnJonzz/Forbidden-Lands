const assert=require('node:assert/strict');
// Exercise the real deterministic control endpoint. This spends the official
// Draw action; it never edits an encounter fixture to grant a free held weapon.
exports.drawRecordedWeapon=async function(page,url,campaignId,characterId,index=0){
 const response=await page.request.get(url+'/api/combat?'+new URLSearchParams({campaignId,characterId}));
 assert.equal(response.ok(),true);const {actions}=await response.json();
 const weapon=actions.weapons.find(w=>w.index===index);assert.ok(weapon,'Recorded weapon for Draw');
 if(weapon.held)return;
 const reply=await page.request.post(url+'/api/gm',{data:{campaignId,characterId,requestId:crypto.randomUUID(),kind:'chat',action:'Draw '+weapon.name,combatIntent:{encounterId:actions.encounterId,actorId:characterId,disposition:'actions',message:null,actions:[{type:'draw_weapon',weaponRef:weapon.ref}]}}});
 const body=await reply.text();assert.equal(reply.ok(),true,body);assert.match(body,/"type":"done"/,body);
 const check=await page.request.get(url+'/api/combat?'+new URLSearchParams({campaignId,characterId}));assert.equal((await check.json()).actions.weapons.find(w=>w.index===index).held,true,'Draw must actually complete with its action cost');
};
