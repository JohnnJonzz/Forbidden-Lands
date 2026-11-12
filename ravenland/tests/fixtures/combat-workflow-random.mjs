// Isolated browser-test preload only. Production never imports this module.
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
if(process.env.RAVENLAND_COMBAT_WORKFLOW_TEST==='1'){
 crypto.randomInt=function(min,max,callback){const upper=typeof max==='number'?max:min,value=upper-1,cb=typeof max==='function'?max:callback;if(cb){queueMicrotask(()=>cb(null,value));return}return value};
 syncBuiltinESMExports();
}
