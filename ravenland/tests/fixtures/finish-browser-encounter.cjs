const path=require('node:path'),{pathToFileURL}=require('node:url');
// Boundary-test cleanup must complete saved mandatory rolls before an explicit
// scene interruption. Never make End discard a pending defense/attack/critical.
exports.finishBrowserEncounter=async(root,filename,campaignId,characterId)=>{
 const {SqliteCampaignRepository}=await import(pathToFileURL(path.join(root,'src/server/sqlite.ts')).href);
 const {finishCombatFixture}=await import(pathToFileURL(path.join(root,'tests/fixtures/finish-combat.ts')).href);
 const repo=new SqliteCampaignRepository(filename);
 try{await finishCombatFixture(repo,{r:{id:campaignId},ch:{id:characterId},principal:{playerId:'browser-fixture',grants:[{campaignId,characterIds:repo.get(campaignId).session.characters.map(c=>c.id)}]}})}finally{repo.close()}
};
