(() => {
 if(window.parent===window) return;
 let characterId=null, loading=false, savedRoll=null, pushInFlight=false, allowRestore=true;
 const notify=(type,data={})=>window.parent.postMessage({type,...data},location.origin);
 const portraitFrame=document.querySelector('.portrait-frame'),placeholder=portraitFrame.innerHTML;
 portraitFrame.setAttribute('role','button');portraitFrame.tabIndex=0;portraitFrame.setAttribute('aria-label','Choose character portrait');
 const openPortrait=()=>notify('ravenland:portrait-open',{characterId});portraitFrame.addEventListener('click',openPortrait);portraitFrame.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPortrait()}});
 function showPortrait(url){portraitFrame.replaceChildren();if(url){const img=document.createElement('img');img.src=url;img.alt='Character portrait';img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';portraitFrame.append(img);portraitFrame.setAttribute('aria-label','View or change character portrait')}else{portraitFrame.innerHTML=placeholder;portraitFrame.setAttribute('aria-label','Choose character portrait')}portraitFrame.style.position='relative';portraitFrame.style.cursor='pointer';portraitFrame.style.overflow='hidden';}
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='ravenland:portrait-sync')showPortrait(event.data.portraitUrl)});
 app.saveRoster=function(){
  this.updateRosterSelect();
  if(!loading&&characterId&&this.activeCharId)notify('ravenland:sheet-change',{characterId,sheet:this.roster[this.activeCharId]});
 };
 app.loadRoster=function(){};
 app.createNewCharacter=function(){};
 app.deleteCharacter=function(){};
 app.switchCharacter=function(){};
 // Embedded pushes are server-authoritative. The standalone root HTML keeps its original engine.
 app.pushRoll=function(){
  const roll=this.currentRoll;if(!roll||pushInFlight||!savedRoll?.canPush||savedRoll.card.id!==roll.ravenlandRollId)return;
  if(savedRoll.card.result.successes>0&&!confirm('Has the GM approved that additional successes can improve this successful roll?'))return;
  pushInFlight=true;document.getElementById('btn-push').disabled=true;
  notify('ravenland:push-roll',{characterId,rollId:roll.ravenlandRollId,additionalEffectConfirmed:savedRoll.card.result.successes>0,actionId:roll.ravenlandPushId??(roll.ravenlandPushId=crypto.randomUUID())});
 };
 const originalStage=app.stagePool.bind(app);app.stagePool=function(...args){allowRestore=false;originalStage(...args)};
 const originalAttack=app.rollWeaponAttack.bind(app);
 app.rollWeaponAttack=function(btn){originalAttack(btn);this.stagedRoll.weaponIndex=[...document.querySelectorAll('#weapons-table tbody tr')].indexOf(btn.closest('tr'))};
 const originalRender=app.renderRollResults.bind(app);
 app.renderRollResults=function(){
  originalRender();const roll=this.currentRoll;if(!roll||!characterId)return;allowRestore=false;savedRoll=null;pushInFlight=false;
  document.getElementById('btn-push').style.display='none';
  const dice=roll.dice,successes=Math.max(0,dice.reduce((n,d)=>n+(d.value>=6?(d.type==='negative-skill'?-1:d.type==='artifact'?Math.floor((d.value-6)/2)+1:1):0),0));
  const event={id:roll.ravenlandRollId??(roll.ravenlandRollId=crypto.randomUUID()),characterId,skill:roll.label,attribute:dice.filter(d=>d.type==='base').map(d=>d.value),skillDice:dice.filter(d=>['skill','negative-skill'].includes(d.type)).map(d=>d.value),negativeSkill:dice.some(d=>d.type==='negative-skill'),gear:dice.filter(d=>d.type==='gear').map(d=>d.value),artifacts:dice.filter(d=>d.type==='artifact').map(d=>({sides:d.sides,value:d.value})),successes,pushed:false,attributeDamage:0,gearDamage:0,willpower:0,quarterDayId:null,requestId:null};
  notify('ravenland:roll',{characterId,roll:event,metadata:{attribute:roll.attribute||null,isArmor:!!roll.isArmor,weaponIndex:roll.weaponIndex>=0?roll.weaponIndex:null,weaponDamage:roll.weaponDamage??null}});
  appendBanes(event);document.getElementById('dice-summary').append(document.createTextNode(' · Saving roll… Push will be available here when saved.'));
 };
 function appendBanes(r){
  const ones=values=>values.filter(v=>v===1).length,a=ones(r.attribute),k=ones(r.skillDice),g=ones(r.gear);
  const line=document.createElement('div');line.textContent=`Banes / ones: ${a+k+g} (Attribute ${a} · Skill ${k} · Gear ${g}). Skill ones do not cause push damage.`;document.getElementById('dice-summary').append(line);
 }
 function showSaved(entry){
  const card=entry.card,r=card.result,prior=app.currentRoll; savedRoll=entry;
  if(r.pushed||card.status!=='Pending')pushInFlight=false;
  app.currentRoll={label:r.skill,attribute:card.metadata.attribute,isArmor:card.metadata.isArmor,isPushed:r.pushed,ravenlandRollId:card.id,ravenlandPushId:prior?.ravenlandRollId===card.id?prior.ravenlandPushId:undefined,weaponDamage:card.metadata.weaponDamage??undefined,dice:[...r.attribute.map(value=>({type:'base',value})),...r.skillDice.map(value=>({type:r.negativeSkill?'negative-skill':'skill',value})),...r.gear.map(value=>({type:'gear',value})),...r.artifacts.map(d=>({type:'artifact',value:d.value,sides:d.sides}))]};
  originalRender();
  const summary=document.getElementById('dice-summary'),utility=card.metadata.utility;
  if(utility){document.getElementById('dice-results').textContent=utility.kind==='D66'?utility.faces.join(' · '):utility.value;summary.textContent=utility.kind==='D66'?`D66: ${utility.faces.join('')}`:`${r.skill}: D${utility.sides} rolled ${utility.value} · Resource change saved.`}
  else{summary.replaceChildren();const title=document.createElement('strong');title.textContent=`${r.skill}: ${r.successes} successes · ${r.pushed?'Pushed once':'Not pushed'}`;summary.append(title);appendBanes(r);const effects=document.createElement('div');effects.textContent=`Attribute damage: ${r.attributeDamage} · Gear damage: ${r.gearDamage} · Willpower gained: ${r.willpower}${!card.metadata.attribute&&r.attributeDamage?' · Apply '+r.attributeDamage+' attribute damage manually (unbound attribute).':''}${card.gearDamageManual?' · Apply '+card.gearDamageManual+' gear damage manually (unbound gear).':''}`;summary.append(effects);if(card.metadata.weaponDamage!==null){const damage=document.createElement('div');damage.textContent=`Total damage: ${r.successes?card.metadata.weaponDamage+r.successes-1:0} (before armor or defense)`;summary.append(damage)}}
  const button=document.getElementById('btn-push');button.style.display=entry.canPush?'inline-block':'none';button.disabled=pushInFlight;button.textContent='Push Roll';
 }
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='ravenland:roll-sync'&&event.data.characterId===characterId){const entries=event.data.cards??[];const entry=app.currentRoll?.ravenlandRollId?entries.find(e=>e.card.id===app.currentRoll.ravenlandRollId):allowRestore?entries.at(-1):null;if(entry){allowRestore=false;showSaved(entry)}}
  if(event.data?.type==='ravenland:roll-error'&&event.data.rollId===app.currentRoll?.ravenlandRollId){pushInFlight=false;document.getElementById('btn-push').disabled=false;const line=document.createElement('div');line.textContent=event.data.error+' · Retry Push Roll to check the saved result.';document.getElementById('dice-summary').append(line)}
 });
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
  if('portraitUrl' in event.data)showPortrait(event.data.portraitUrl);
  loading=true;characterId=event.data.characterId;
  document.body.dataset.embedMode=event.data.mode;
  app.renderSkills();app.roster={[characterId]:event.data.sheet};app.activeCharId=characterId;app.loadCharacter(characterId);app.updateRosterSelect();
  document.getElementById('character-select').parentElement.style.display='none';
  if(preserve){app.stagedRoll=preserve.staged;app.currentRoll=preserve.roll;app.artifactDice=preserve.artifacts;for(const [k,v] of Object.entries(preserve.pool))document.getElementById('pool-'+k).value=v;document.getElementById('dice-results').innerHTML=preserve.results;document.getElementById('dice-summary').innerHTML=preserve.summary;document.getElementById('staged-label').textContent=preserve.label;document.getElementById('btn-roll-pool').disabled=!preserve.staged;app.updatePoolPreview()}
  loading=false;notify('ravenland:sheet-loaded',{characterId});
 });
})();
