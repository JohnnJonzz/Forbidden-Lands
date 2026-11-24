import ts from 'typescript';
import {readFileSync,writeFileSync as writeRaw,renameSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
// Keep concurrent dev/test readers from seeing partially written generated modules.
function writeFileSync(path,content){try{if(readFileSync(path,'utf8')===content)return;}catch{}const temporary=path+'.'+process.pid+'.tmp';writeRaw(temporary,content);renameSync(temporary,path);}
const root=fileURLToPath(new URL('../',import.meta.url));
let html=readFileSync(root+'../index.html','utf8');
const carrying=ts.transpile(readFileSync(root+'src/lib/carrying.ts','utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}).replace(/^export /gm,'');html=html.replace(/\/\/ BEGIN GENERATED CARRYING[\s\S]*?\/\/ END GENERATED CARRYING/,'// BEGIN GENERATED CARRYING\n'+carrying+'\n// END GENERATED CARRYING');
const registry=JSON.parse(readFileSync(root+'../character-rules.json','utf8'));
const equipment=JSON.parse(readFileSync(root+'../equipment-catalog.json','utf8'));
for(const rows of [equipment.weapons,equipment.armor,equipment.shields]){
 const keys=new Map();for(const item of rows)for(const name of [item.id,item.name,...item.aliases]){const key=name.normalize('NFKC').replace(/\u00ad/g,'').trim().toLowerCase().replace(/[‐‑–]/g,'-').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ');if(keys.has(key)&&keys.get(key)!==item.id)throw Error('Ambiguous equipment catalog alias: '+name);keys.set(key,item.id)}
}
html=html.replace(/\/\/ BEGIN GENERATED EQUIPMENT[\s\S]*?\/\/ END GENERATED EQUIPMENT/,'// BEGIN GENERATED EQUIPMENT\n        this.equipmentCatalog = '+JSON.stringify(equipment)+';\n        // END GENERATED EQUIPMENT');
writeFileSync(root+'src/lib/equipment-catalog-data.ts','// Generated from equipment-catalog.json. Edit the root JSON, not this file.\nexport const equipmentCatalog = '+JSON.stringify(equipment,null,2)+' as const;\n');
if(registry.attributes.length!==4||registry.skills.length!==16||new Set(registry.skills.map(s=>s.id)).size!==16||registry.skills.some(s=>s.origin!=='official'||!registry.attributes.some(a=>a.id===s.attribute)))throw Error('Invalid canonical character registry');
const skillConfig=registry.skills.map(s=>({id:s.id,name:s.name,attr:s.attribute}));
html=html.replace(/this.skillsConfig = \[[\s\S]*?\];/, 'this.skillsConfig = '+JSON.stringify(skillConfig,null,12)+';');
const creatureCode=ts.transpile(readFileSync(root+'src/lib/creature-load.ts','utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}).replace(/^import.*$/gm,'').replace(/^export /gm,'')+'\n'+readFileSync(root+'scripts/sheet-creatures.js','utf8');
html=html.replace(/\/\* CREATURE SCRIPT \*\/|\/\/ BEGIN GENERATED CREATURES[\s\S]*?\/\/ END GENERATED CREATURES/,'// BEGIN GENERATED CREATURES\n'+creatureCode+'\n// END GENERATED CREATURES');
const injuryCode=['src/lib/calendar.ts','src/lib/injury-timeline.ts'].map(path=>ts.transpile(readFileSync(root+path,'utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}).replace(/^import.*$/gm,'').replace(/^export /gm,'')).join('\n')+'\n'+readFileSync(root+'scripts/sheet-injuries.js','utf8');
html=html.replace(/\/\* INJURY SCRIPT \*\/|\/\/ BEGIN GENERATED INJURIES[\s\S]*?\/\/ END GENERATED INJURIES/,'// BEGIN GENERATED INJURIES\n'+injuryCode+'\n// END GENERATED INJURIES');
writeFileSync(root+'../index.html',html);
writeFileSync(root+'src/lib/rules/character-registry-data.ts','// Generated from character-rules.json. Edit the root JSON, not this file.\nexport const characterRegistry = '+JSON.stringify(registry,null,2)+' as const;\n');
const fields=[...html.match(/this.fieldIds = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
const skills=registry.skills.map(skill=>'skill-'+skill.id);
writeFileSync(root+'src/lib/sheet-fields.ts','// Generated from the standalone sheet.\nexport const sheetFieldNames = '+JSON.stringify([...fields,...skills],null,2)+' as const;\n');
html=html.replace('    app.init();',"    if(window.parent===window) app.init(); else window.parent.postMessage({type:'ravenland:sheet-ready'},location.origin);");
const css=`<style>body[data-embed-mode="dice"] main>*:not(#dice-panel){display:none}body[data-embed-mode="dice"] #dice-panel{display:block}body[data-embed-mode="dice"] .sheet-layout{display:block;max-width:480px}body[data-embed-mode="dice"] #dice-panel{position:static;max-height:none}html,body{overflow:hidden}body{padding:10px}body[data-embed-mode="sheet"]{max-width:none;width:auto}body[data-embed-mode="sheet"] .sheet-layout{max-width:1600px;width:100%;min-width:0}body[data-embed-mode="sheet"] .container{width:100%;max-width:none;min-width:0;box-sizing:border-box}@media print{body{padding:0}}</style>`;
html=html.replace('</head>',css+'</head>').replace('</body>','<script>'+readFileSync(root+'scripts/sheet-bridge.js','utf8')+'</script></body>');
writeFileSync(root+'src/lib/sheet-version.ts','// Generated with the embedded sheet to invalidate stale cached assets.\nexport const sheetAssetVersion = '+JSON.stringify(createHash('sha256').update(html).digest('hex').slice(0,16))+';\n');
mkdirSync(root+'public',{recursive:true});const version=createHash('sha256').update(html).digest('hex').slice(0,16);writeFileSync(root+'public/character-sheet-'+version+'.html',html);writeFileSync(root+'public/character-sheet.html',html);
