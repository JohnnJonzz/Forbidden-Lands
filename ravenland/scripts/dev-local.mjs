import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

if(process.env.NODE_ENV==='production')throw Error('Trusted local play is development-only. Use npm start for hosted production.');
const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--port'||!/^\d+$/.test(args[1])))throw Error('Trusted local play accepts --port only; its loopback binding cannot be changed.');
const port=Number(process.argv[2]==='--port'?process.argv[3]:process.env.PORT??3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Choose a valid local port.');
process.env.NODE_ENV='development';
const key=randomBytes(32).toString('hex');process.env.RAVENLAND_LOCAL_RUNTIME_KEY=key;
const {default:next}=await import('next');
let handle;
function allowed(req){
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
 if(Object.keys(req.headers).some(name=>name==='forwarded'||name.startsWith('x-forwarded-')))return false;
 try{const host=new URL('http://'+req.headers.host);return ['localhost','127.0.0.1'].includes(host.hostname)&&Number(host.port||80)===port&&(!req.headers.origin||new URL(req.headers.origin).origin===host.origin)&&!(req.url?.startsWith('/api/')&&req.headers['sec-fetch-site']==='cross-site')}catch{return false}
}
function stamp(req){delete req.headers['x-ravenland-local-runtime'];req.headers['x-ravenland-local-runtime']=key}
const server=createServer((req,res)=>{if(!allowed(req)){res.writeHead(403);res.end('Trusted local play requires a direct same-origin loopback connection.');return}stamp(req);handle(req,res)});
const app=next({dev:true,hostname:'127.0.0.1',port,httpServer:server});
handle=app.getRequestHandler();
// Next installs its HMR upgrade handler on first request. Guard it first,
// rather than registering a second Next handler for the same socket.
server.prependListener('upgrade',(req,socket)=>{if(!allowed(req)){socket.destroy();return}stamp(req)});
await app.prepare();
server.listen(port,'127.0.0.1',()=>console.log(`Trusted local Ravenland play: http://127.0.0.1:${port} · ACTING AS supplies character context; no player token required.`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close();void app.close().finally(()=>process.exit(0))});
