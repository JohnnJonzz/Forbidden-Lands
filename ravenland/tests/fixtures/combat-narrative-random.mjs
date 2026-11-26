// Test-only controlled server dice. Never imported by production code.
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
if(process.env.RAVENLAND_NARRATIVE_DICE_FILE){
 let token='',index=0;
 crypto.randomInt=function(min,max,callback){const config=JSON.parse(readFileSync(process.env.RAVENLAND_NARRATIVE_DICE_FILE,'utf8'));if(token!==config.token){token=config.token;index=0}const lower=typeof max==='number'?min:0,upper=typeof max==='number'?max:min;const value=config.faces?.[index++]??config.value??2;if(value<lower||value>=upper)throw Error('Invalid controlled fixture die '+value+' / '+upper);const cb=typeof max==='function'?max:callback;if(cb){queueMicrotask(()=>cb(null,value));return}return value};syncBuiltinESMExports();
}
