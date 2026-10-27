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
 const originalRender=app.renderRollResults.bind(app);
 app.renderRollResults=function(baseBanes=0,gearBanes=0){
  originalRender(baseBanes,gearBanes);
  const roll=this.currentRoll;if(!roll||!characterId)return;
  const dice=roll.dice,successes=Math.max(0,dice.reduce((n,d)=>n+(d.value>=6?(d.type==='negative-skill'?-1:d.type==='artifact'?Math.floor((d.value-6)/2)+1:1):0),0));
  const event={id:crypto.randomUUID(),characterId,skill:roll.label,attribute:dice.filter(d=>d.type==='base').map(d=>d.value),skillDice:dice.filter(d=>['skill','negative-skill'].includes(d.type)).map(d=>d.value),negativeSkill:dice.some(d=>d.type==='negative-skill'),gear:dice.filter(d=>d.type==='gear').map(d=>d.value),artifacts:dice.filter(d=>d.type==='artifact').map(d=>({sides:d.sides,value:d.value})),successes,pushed:!!roll.isPushed,attributeDamage:roll.attribute?baseBanes:0,gearDamage:gearBanes,willpower:baseBanes,quarterDayId:null,requestId:null};
  notify('ravenland:roll',{characterId,roll:event});
 };
 const originalSave=app.saveState.bind(app);
 app.saveState=function(){if(!loading&&characterId)originalSave()};
 app.importJSON=function(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>1_000_000){alert('Character file is too large.');return}const reader=new FileReader();reader.onload=()=>{try{notify('ravenland:sheet-import',{characterId,sheet:JSON.parse(reader.result)})}catch{alert('Invalid character JSON')}};reader.readAsText(file)};
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='ravenland:sheet-init')return;
  loading=true;characterId=event.data.characterId;
  document.body.dataset.embedMode=event.data.mode;
  app.renderSkills();app.roster={[characterId]:event.data.sheet};app.activeCharId=characterId;app.loadCharacter(characterId);app.updateRosterSelect();
  document.getElementById('character-select').parentElement.style.display='none';
  loading=false;notify('ravenland:sheet-loaded',{characterId});
 });
})();
