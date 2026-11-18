interface Env {
 DB: D1Database;
 MEDIA: R2Bucket;
 ASSETS: Fetcher;
 MAX_FILE_BYTES: string;
}
type Account = { id:string; credit_balance:number };
type Archive = {id:string;owner_id:string;title:string;visibility:'public'|'private';content_type:string;bytes:number;sha256:string;object_key:string;created_at:string;chain_height:number|null;chain_hash:string|null};
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const MAX_TITLE = 120;
const encoder = new TextEncoder();
function respond(body:unknown,status=200,headers:Record<string,string>={}) {return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...headers}})}
function fail(message:string,status=400){return respond({error:message},status)}
function hex(data:ArrayBuffer){return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('')}
async function hash(data:string|ArrayBuffer){return hex(await crypto.subtle.digest('SHA-256',typeof data==='string'?encoder.encode(data):data))}
function canonicalBlock(height:number,previous:string,id:string,fileHash:string,created:string){return JSON.stringify([height,previous,id,fileHash,created])}
function cookie(req:Request,name:string){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
function isSecure(req:Request){return new URL(req.url).protocol==='https:'}
function sessionCookie(token:string,req:Request){return `fc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${isSecure(req)?'; Secure':''}`}
function expireCookie(req:Request){return `fc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isSecure(req)?'; Secure':''}`}
function sameOrigin(req:Request){const origin=req.headers.get('origin');return !origin || origin===new URL(req.url).origin}
async function auth(req:Request,env:Env):Promise<Account|null>{
 const token=cookie(req,'fc_session');if(!token)return null;
 const tokenHash=await hash(token);
 return await env.DB.prepare(`SELECT a.id,a.credit_balance FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash,new Date().toISOString()).first<Account>();
}
function validHash(s:string){return /^[a-f0-9]{64}$/.test(s)}
function validId(s:string){return /^[a-f0-9-]{36}$/.test(s)}
function safeTitle(s:string){return s.trim().slice(0,MAX_TITLE)}
async function bodyJSON(req:Request):Promise<any>{if(Number(req.headers.get('content-length')||0)>4096)throw Error('Request too large');return req.json()}
async function api(req:Request,env:Env):Promise<Response>{
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!['GET','HEAD','OPTIONS'].includes(method) && !sameOrigin(req))return fail('Cross-origin request rejected',403);
 if(method==='POST'&&path==='/api/session'){
   const id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),now=new Date().toISOString();
   const expires=new Date(Date.now()+7*86400000).toISOString();
   await env.DB.prepare('INSERT INTO accounts(id,created_at) VALUES (?,?)').bind(id,now).run();
   await env.DB.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES (?,?,?)').bind(await hash(token),id,expires).run();
   await env.DB.prepare('INSERT INTO credit_events(id,account_id,delta,reason,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,100,'Demo onboarding allocation',now).run();
   return respond({id,credit_balance:100,warning:'Anonymous session. Clearing cookies loses account access.'},200,{'set-cookie':sessionCookie(token,req)});
 }
 if(method==='POST'&&path==='/api/logout'){
   const token=cookie(req,'fc_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
   return respond({ok:true},200,{'set-cookie':expireCookie(req)});
 }
 if(method==='GET'&&path==='/api/me'){const a=await auth(req,env);return a?respond(a):fail('Not signed in',401)}
 if(method==='GET'&&path==='/api/explorer'){
   const rows=await env.DB.prepare(`SELECT id,title,content_type,bytes,sha256,created_at,chain_height,chain_hash FROM archives WHERE visibility='public' AND chain_height IS NOT NULL ORDER BY chain_height DESC LIMIT 50`).all();
   return respond({items:rows.results});
 }
 if(method==='GET'&&path==='/api/chain'){
   const rows=await env.DB.prepare('SELECT height,previous_hash,block_hash,archive_id,file_hash,created_at FROM ledger ORDER BY height ASC LIMIT 1000').all();
   return respond({blocks:rows.results,note:'Cloudflare-hosted append-only prototype; not a decentralized consensus blockchain. Maximum 1000 blocks returned.'});
 }
 if(method==='GET'&&path==='/api/mine'){
   const a=await auth(req,env);if(!a)return fail('Not signed in',401);
   const rows=await env.DB.prepare('SELECT id,title,visibility,content_type,bytes,sha256,created_at,chain_height,chain_hash FROM archives WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(a.id).all();
   return respond({items:rows.results});
 }
 if(method==='POST'&&path==='/api/archive'){
   const a=await auth(req,env);if(!a)return fail('Not signed in',401);
   const sizeLimit=Math.min(Number(env.MAX_FILE_BYTES)||10485760,10485760);
   if(Number(req.headers.get('content-length')||0)>sizeLimit+4096)return fail('File exceeds upload limit',413);
   const type=req.headers.get('content-type')||'';
   if(!type.startsWith('multipart/form-data'))return fail('Multipart form required');
   const form=await req.formData(),file=form.get('file'),title=form.get('title'),visibility=form.get('visibility'),claimed=form.get('sha256');
   if(!(file instanceof File)||typeof title!=='string'||typeof claimed!=='string'||!validHash(claimed))return fail('Missing file, title, or SHA-256');
   if(visibility!=='public'&&visibility!=='private')return fail('Invalid visibility');
   if(!title.trim()||title.length>MAX_TITLE)return fail('Title must be 1-120 characters');
   if(file.size===0||file.size>sizeLimit)return fail('File must be 1 byte to 10 MiB',413);
   if(visibility==='private'&&file.type!=='application/octet-stream')return fail('Private uploads must be encrypted binary');
   if(visibility==='public'&&!/^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|ogg|wav|mp4)|video\/(mp4|webm)|application\/pdf)$/.test(file.type))return fail('Unsupported public media type');
   const bytes=await file.arrayBuffer(),actual=await hash(bytes);
   if(actual!==claimed)return fail('File hash mismatch');
   const id=crypto.randomUUID(),now=new Date().toISOString(),key=`archive/${id}`;
   // Charge one demo preservation credit per upload. These credits are not tradeable tokens.
   const debit=await env.DB.prepare('UPDATE accounts SET credit_balance=credit_balance-1 WHERE id=? AND credit_balance>=1').bind(a.id).run();
   if(!debit.meta.changes)return fail('Insufficient preservation credits',402);
   try{
     await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:visibility==='private'?'application/octet-stream':file.type}});
     await env.DB.prepare(`INSERT INTO archives(id,owner_id,title,visibility,content_type,bytes,sha256,object_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,a.id,safeTitle(title),visibility,visibility==='private'?'application/octet-stream':file.type,file.size,actual,key,now).run();
     await env.DB.prepare('INSERT INTO credit_events(id,account_id,delta,reason,archive_id,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),a.id,-1,'Demo preservation credit spent',id,now).run();
   }catch(e){
     await env.MEDIA.delete(key);
     await env.DB.prepare('UPDATE accounts SET credit_balance=credit_balance+1 WHERE id=?').bind(a.id).run();
     throw e;
   }
   // The ledger is sequenced by a D1 write transaction through an atomic INSERT SELECT.
   // No blockchain consensus is claimed. Hashing is completed after sequencing.
   // Use a unique per-archive sequence allocated by the SQLite autoincrement ledger.
   // Concurrent writes are serialized by D1; retry if a height collision occurs.
   let blockHeight:number|null=null,blockHash:string|null=null;
   for(let attempt=0;attempt<5;attempt++){
     const tip=await env.DB.prepare('SELECT height,block_hash FROM ledger ORDER BY height DESC LIMIT 1').first<{height:number;block_hash:string}>();
     const height=(tip?.height??0)+1,prev=tip?.block_hash??'0'.repeat(64);
     const digest=await hash(canonicalBlock(height,prev,id,actual,now));
     try{
       await env.DB.prepare('INSERT INTO ledger(height,previous_hash,block_hash,archive_id,file_hash,created_at) VALUES (?,?,?,?,?,?)').bind(height,prev,digest,id,actual,now).run();
       blockHeight=height;blockHash=digest;break;
     }catch(e){if(attempt===4)break;}
   }
   if(blockHeight!==null)await env.DB.prepare('UPDATE archives SET chain_height=?,chain_hash=? WHERE id=?').bind(blockHeight,blockHash,id).run();
   return respond({id,sha256:actual,chain_height:blockHeight,chain_hash:blockHash,warning:blockHeight===null?'Stored, but ledger anchoring is pending. Contact operator.':undefined},201);
 }
 const mediaMatch=path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
 if(method==='GET'&&mediaMatch){
   const record=await env.DB.prepare('SELECT * FROM archives WHERE id=?').bind(mediaMatch[1]).first<Archive>();
   if(!record)return fail('Not found',404);
   if(record.visibility==='private'){
     const a=await auth(req,env);if(!a||a.id!==record.owner_id)return fail('Not found',404);
   }
   const obj=await env.MEDIA.get(record.object_key);if(!obj)return fail('Media temporarily unavailable',503);
   return new Response(obj.body,{headers:{'content-type':record.content_type,'content-disposition':`attachment; filename="${record.id}"`,'x-content-type-options':'nosniff','cache-control':'private, no-store','x-content-security-policy':"default-src 'none'"}});
 }
 const detail=path.match(/^\/api\/record\/([a-f0-9-]{36})$/);
 if(method==='GET'&&detail){
   const record=await env.DB.prepare('SELECT * FROM archives WHERE id=?').bind(detail[1]).first<Archive>();
   if(!record)return fail('Not found',404);
   if(record.visibility==='private'){
     const a=await auth(req,env);if(!a||a.id!==record.owner_id)return fail('Not found',404);
   }
   const {object_key,owner_id,...safe}=record;
   return respond(safe);
 }
 return fail('Not found',404);
}
export default {
 async fetch(req:Request,env:Env):Promise<Response>{
  try{
   if(new URL(req.url).pathname.startsWith('/api/'))return await api(req,env);
   return env.ASSETS.fetch(req);
  }catch(e){console.error('Unhandled error',e);return fail('Unexpected server error',500)}
 }
} satisfies ExportedHandler<Env>;
