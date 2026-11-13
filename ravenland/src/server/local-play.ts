import {timingSafeEqual} from 'node:crypto';

// Only the loopback-only development launcher stamps this per-process proof.
// A client-selected character, NODE_ENV alone, Host or forwarded headers cannot.
export function isTrustedLocalRequest(request:Request){
 const key=process.env.RAVENLAND_LOCAL_RUNTIME_KEY,proof=request.headers.get('x-ravenland-local-runtime');
 if(process.env.NODE_ENV!=='development'||!key||!/^[a-f0-9]{64}$/.test(key)||!proof||proof.length!==key.length)return false;
 const host=new URL(request.url).hostname;
 return ['localhost','127.0.0.1','[::1]'].includes(host)&&timingSafeEqual(Buffer.from(key),Buffer.from(proof));
}
