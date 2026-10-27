(() => {
 if(window.parent===window) return;
 let characterId=null, loading=false;
 const notify=(type,data={})=>window.parent.postMessage({type,...data},location.origin);
 app.saveRoster=function(){
  this.updateRosterSelect();
  if(!loading&&characterId&&this.activeCharId)notify('ravenland:sheet-change',{characterId,sheet:this.roster[this.activeCharId]});
 };
 app.loadRoster=function(){};
 app.createNewCharacter=function(){};
 app.deleteCharacter=function(){};
 app.switchCharacter=function(){};
 // Embedded pushes are server-authoritative. The standalone root HTML keeps its original engine.
 app.pushRoll=function(){alert('Push this pending roll from the campaign chat. Push consequences are saved once on the server.')};
 const originalAttack=app.rollWeaponAttack.bind(app);
 app.rollWeaponAttack=function(btn){originalAttack(btn);this.stagedRoll.weaponIndex=[...document.querySelectorAll('#weapons-table tbody tr')].indexOf(btn.closest('tr'))};
 const originalRender=app.renderRollResults.bind(app);
 app.renderRollResults=function(){
  originalRender();const roll=this.currentRoll;if(!roll||!characterId)return;
  document.getElementById('btn-push').style.display='none';
  const dice=roll.dice,successes=Math.max(0,dice.reduce((n,d)=>n+(d.value>=6?(d.type==='negative-skill'?-1:d.type==='artifact'?Math.floor((d.value-6)/2)+1:1):0),0));
  const event={id:roll.ravenlandRollId??(roll.ravenlandRollId=crypto.randomUUID()),characterId,skill:roll.label,attribute:dice.filter(d=>d.type==='base').map(d=>d.value),skillDice:dice.filter(d=>['skill','negative-skill'].includes(d.type)).map(d=>d.value),negativeSkill:dice.some(d=>d.type==='negative-skill'),gear:dice.filter(d=>d.type==='gear').map(d=>d.value),artifacts:dice.filter(d=>d.type==='artifact').map(d=>({sides:d.sides,value:d.value})),successes,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null};
  notify('ravenland:roll',{characterId,roll:event,metadata:{attribute:roll.attribute||null,isArmor:!!roll.isArmor,weaponIndex:roll.weaponIndex>=0?roll.weaponIndex:null,weaponDamage:roll.weaponDamage??null}});
  document.getElementById('dice-summary').append(document.createTextNode(' · Pending result sent to campaign chat. Push or submit there.'));
 };
 function utilityEvent(label,utility){notify('ravenland:roll',{characterId,roll:{id:crypto.randomUUID(),characterId,skill:label,attribute:[],skillDice:[],negativeSkill:false,gear:[],artifacts:[],successes:0,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null},metadata:{attribute:null,isArmor:false,weaponIndex:null,weaponDamage:null,utility}})}
 const originalD66=app.rollD66.bind(app);app.rollD66=function(){originalD66();utilityEvent('D66',{kind:'D66',faces:[...document.querySelectorAll('#dice-results .die')].map(d=>Number(d.textContent))})};
 app.rollConsumable=function(resource){const input=document.getElementById('res-'+resource);if(input.value==='None'){document.getElementById('dice-summary').textContent='No resource die remaining.';return}const sides=Number(input.value.slice(1)),value=Math.floor(Math.random()*sides)+1;this.currentRoll=null;document.getElementById('btn-push').style.display='none';document.getElementById('dice-results').textContent=value;document.getElementById('dice-summary').textContent=resource+': D'+sides+' rolled '+value+' · Pending in chat; depletion saved once on the server.';utilityEvent(resource,{kind:'Resource',resource,sides,value})};
 document.addEventListener('input',event=>{if(event.target.matches('input,textarea,select'))notify('ravenland:sheet-editing',{editing:true})});
 document.addEventListener('focusout',()=>{setTimeout(()=>notify('ravenland:sheet-editing',{editing:false}),0)});
 const originalSave=app.saveState.bind(app);
 app.saveState=function(){if(!loading&&characterId)originalSave()};
 app.importJSON=function(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>1_000_000){alert('Character file is too large.');return}const reader=new FileReader();reader.onload=()=>{try{notify('ravenland:sheet-import',{characterId,sheet:JSON.parse(reader.result)})}catch{alert('Invalid character JSON')}};reader.readAsText(file)};
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||!['ravenland:sheet-init','ravenland:sheet-sync','ravenland:sheet-export'].includes(event.data?.type))return;
  if(event.data.type==='ravenland:sheet-export'){app.exportJSON();return}
  const preserve=event.data.type==='ravenland:sheet-sync'?{staged:app.stagedRoll,roll:app.currentRoll,artifacts:app.artifactDice,pool:Object.fromEntries(['base','skill','gear','modifier'].map(k=>[k,document.getElementById('pool-'+k).value])),results:document.getElementById('dice-results').innerHTML,summary:document.getElementById('dice-summary').innerHTML,label:document.getElementById('staged-label').textContent}:null;
  loading=true;characterId=event.data.characterId;
  document.body.dataset.embedMode=event.data.mode;
  app.renderSkills();app.roster={[characterId]:event.data.sheet};app.activeCharId=characterId;app.loadCharacter(characterId);app.updateRosterSelect();
  document.getElementById('character-select').parentElement.style.display='none';
  if(preserve){app.stagedRoll=preserve.staged;app.currentRoll=preserve.roll;app.artifactDice=preserve.artifacts;for(const [k,v] of Object.entries(preserve.pool))document.getElementById('pool-'+k).value=v;document.getElementById('dice-results').innerHTML=preserve.results;document.getElementById('dice-summary').innerHTML=preserve.summary;document.getElementById('staged-label').textContent=preserve.label;document.getElementById('btn-roll-pool').disabled=!preserve.staged;app.updatePoolPreview()}
  loading=false;notify('ravenland:sheet-loaded',{characterId});
 });
})();
