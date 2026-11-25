// Test-only preload. Production code has no dice override or fixture transport.
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {readFileSync,appendFileSync} from 'node:fs';
const original=crypto.randomInt;
crypto.randomInt=function(min,max,callback){if(process.env.RAVENLAND_TEST_DICE_FILE&&typeof max==='number'&&min===1&&[7,9,11,13,21,67].includes(max)&&!callback){const value=JSON.parse(readFileSync(process.env.RAVENLAND_TEST_DICE_FILE,'utf8')).value;if(value<min||value>=max)throw Error('Fixture face outside requested die');return value;}return original.apply(this,arguments)};
syncBuiltinESMExports();
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async function(url,...args){const href=typeof url==='string'?url:url instanceof URL?url.href:url.url;if(/api\.openai\.com/.test(href)){appendFileSync(process.env.RAVENLAND_TEST_MODEL_LOG,'unexpected model request\n');throw Error('No model calls allowed in Phase 7.0B dice acceptance.');}return fetchOriginal(url,...args)};
