app.addInjuryRecord=function(){
 this.injuries??=[];if(this.injuries.length>=100)return;
 this.injuries.push({id:crypto.randomUUID(),name:'',sustainedDate:'',sustainedQuarter:'',duration:'',unit:'review',permanent:false,status:'active',source:'',treatment:'',recordedAt:new Date().toISOString()});
 this.renderInjuries();this.saveState();
 document.querySelector('#injury-records article:last-child input')?.focus();
};
app.renderInjuryProgress=function(){
 for(const injury of this.injuries??[]){
  const card=document.getElementById('injury-'+injury.id);if(!card)continue;
  card.querySelector('summary').textContent=injury.name||'Unnamed injury';
  for(const input of card.querySelectorAll('input,select'))if(['Sustained date','Sustained quarter','Established healing duration','Healing unit'].includes(input.getAttribute('aria-label')))input.disabled=!!this.injuryClock?.unified;
  const progress=injuryProgress(injury,this.injuryClock);
  const date=injury.sustainedDate?'Sustained '+displayDate(injury.sustainedDate,this.injuryClock?.calendar)+' '+(injury.sustainedQuarter||'quarter unknown')+' · ':progress==='Date unknown'?'':'Date unknown · ';
  card.querySelector('.injury-progress').textContent=date+progress;
 }
 let hint=document.getElementById('injury-calendar-note');if(!hint){hint=document.createElement('p');hint.id='injury-calendar-note';hint.className='save-note';document.getElementById('injury-records').before(hint)}hint.textContent=this.injuryClock?.unified?'Dates and durations follow the unified calendar. The Table GM can correct them in Journey Settings → Correct Current Campaign State → Injury timeline metadata.':'';
 document.getElementById('injury-legacy-status').textContent=document.getElementById('critical-injuries').value.trim()?'Existing notes retained · Date unknown unless recorded below.':'';
};
app.renderInjuries=function(){
 const list=document.getElementById('injury-records');list.replaceChildren();
 for(const injury of this.injuries??[]){
  const card=document.createElement('article');card.className='injury-record';card.id='injury-'+injury.id;
  const details=document.createElement('details');details.open=!injury.name;details.append(document.createElement('summary'));card.append(details);const progress=document.createElement('p');progress.className='injury-progress';progress.setAttribute('role','status');card.append(progress);
  const field=(key,label,options)=>{
   const wrapper=document.createElement('label');wrapper.textContent=label;
   const input=document.createElement(options?'select':key==='source'||key==='treatment'?'textarea':'input');
   input.setAttribute('aria-label',label);if(app.injuryClock?.unified&&['sustainedDate','sustainedQuarter','duration','unit'].includes(key)){input.disabled=true;input.title='Use Journey Settings → Correct Current Campaign State → Injury timeline metadata for a reviewed correction.';}if(options)for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option)}
   if(key==='permanent'){input.type='checkbox';input.checked=injury[key]}else input.value=injury[key];
   if(key==='duration'){input.inputMode='decimal';input.placeholder='Unknown until established'}
   if(key==='sustainedDate')input.placeholder='e.g. 13th Springrise, 1165';
   if(!options&&key!=='permanent')input.maxLength=key==='name'?300:key==='sustainedDate'?160:key==='duration'?30:1600;
   input.onchange=()=>{if(key==='status'&&input.value==='healed'&&!confirm('Confirm this injury has healed? This records your ruling without changing attributes, effects or lethal deadlines.')){input.value=injury.status;return}injury[key]=key==='permanent'?input.checked:input.value;app.renderInjuryProgress();app.saveState()};
   wrapper.append(input);details.append(wrapper);
  };
  field('name','Injury name / reference');field('sustainedDate','Sustained date');
  field('sustainedQuarter','Sustained quarter',[['','Unknown'],...['Morning','Day','Evening','Night'].map(q=>[q,q])]);
  field('duration','Established healing duration');field('unit','Healing unit',[['review','Requires review'],['days','Days'],['hours','Hours'],['quarter_days','Quarter-days']]);
  field('permanent','Permanent injury');field('status','Recovery status',[['active','Active — effects remain'],['healed','Healing confirmed manually']]);
  field('source','Rule / roll / ruling reference');field('treatment','Treatment / correction notes');
  const receipt=document.createElement('p');receipt.className='save-note';receipt.textContent='Record created '+injury.recordedAt+' (real time; not the injury date).';details.append(receipt);list.append(card);
 }
 this.renderInjuryProgress();
};
document.getElementById('critical-injuries').addEventListener('input',()=>app.renderInjuryProgress());
