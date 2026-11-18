const $=s=>document.querySelector(s);
const status=(msg,error=false)=>{const el=$('#uploadStatus');el.textContent=msg;el.className='status '+(error?'error':'success')};
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async b=>hex(await crypto.subtle.digest('SHA-256',b));
const api=async(path,options={})=>{const r=await fetch('/api'+path,{credentials:'same-origin',...options});let data;try{data=await r.json()}catch{throw Error('Invalid server response')}if(!r.ok)throw Error(data.error||'Request failed');return data};
const el=(tag,txt,cls)=>{const node=document.createElement(tag);if(txt!==undefined)node.textContent=String(txt);if(cls)node.className=cls;return node};
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function encrypt(data){
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);
 const raw=await crypto.subtle.exportKey('raw',key);
 return {bytes:encrypted,key:b64(raw),iv:b64(iv)};
}
async function decrypt(blob,keyText,ivText){
 const key=await crypto.subtle.importKey('raw',fromB64(keyText),{name:'AES-GCM'},false,['decrypt']);
 return crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(ivText)},key,await blob.arrayBuffer());
}
async function ensureSession(){
 try{return await api('/me')}catch{return await api('/session',{method:'POST'})}
}
async function refreshAccount(){try{const a=await api('/me');$('#balance').textContent=`${a.credit_balance} demo credits`;return a}catch{$('#balance').textContent='No vault session';return null}}
function makeCard(item,owned){
 const card=el('article',undefined,'item');card.append(el('div',item.visibility||'public','tag'),el('h3',item.title),el('p',new Date(item.created_at).toLocaleString()));
 card.append(el('p',`${item.bytes.toLocaleString()} bytes • ${item.content_type}`),el('code','SHA-256: '+item.sha256));
 card.append(el('p',item.chain_height?`Ledger block #${item.chain_height}`:'Ledger anchoring pending'));
 const dl=el('button',item.visibility==='private'?'Decrypt and download':'Download media','secondary');
 dl.addEventListener('click',async()=>{
  try{
   if(item.visibility==='private'){
    const key=prompt('Enter your saved AES-256 recovery key (base64):');if(!key)return;
    const iv=prompt('Enter your saved IV (base64):');if(!iv)return;
    const r=await fetch('/api/media/'+item.id);if(!r.ok)throw Error('Unable to fetch encrypted media');
    const plain=await decrypt(await r.blob(),key,iv);download(plain,item.title.replace(/[^a-z0-9_-]/gi,'_')+'.recovered');
   }else{
    const r=await fetch('/api/media/'+item.id);if(!r.ok)throw Error('Unable to fetch media');
    const blob=await r.blob();if(await digest(await blob.arrayBuffer())!==item.sha256)throw Error('Integrity verification failed');
    download(blob,item.title.replace(/[^a-z0-9_-]/gi,'_'));
   }
  }catch(e){alert('Download failed: '+e.message)}
 });
 card.append(dl);
 return card;
}
function download(blob,name){const u=URL.createObjectURL(blob instanceof Blob?blob:new Blob([blob]));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
async function refresh(){
 const pub=$('#publicItems'),mine=$('#myItems');pub.replaceChildren(el('p','Loading...','muted'));mine.replaceChildren(el('p','Loading...','muted'));
 try{const {items}=await api('/explorer');pub.replaceChildren(...(items.length?items.map(x=>makeCard({...x,visibility:'public'},false)):[el('p','No public memories yet.','muted')]))}catch(e){pub.textContent=e.message}
 try{const {items}=await api('/mine');mine.replaceChildren(...(items.length?items.map(x=>makeCard(x,true)):[el('p','No memories in this vault.','muted')]))}catch{mine.textContent='Create a demo vault to view your archives'}
 await refreshAccount();
}
$('#login').addEventListener('click',async()=>{try{const a=await ensureSession();await refresh();alert('Demo vault ready. Your browser session is your only account access; do not rely on this for irreplaceable memories.')}catch(e){alert(e.message)}});
$('#logout').addEventListener('click',async()=>{await api('/logout',{method:'POST'});await refresh()});
$('#refresh').addEventListener('click',refresh);
$('#uploadForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=$('#submit');button.disabled=true;
 try{
  await ensureSession();
  const original=$('#file').files[0],visibility=document.querySelector('input[name=visibility]:checked').value;
  if(!original)throw Error('Select a file');
  if(original.size>10*1024*1024)throw Error('File must be at most 10 MiB');
  let bytes=await original.arrayBuffer(),file=original;
  if(visibility==='private'){
   const encrypted=await encrypt(bytes);bytes=encrypted.bytes;
   file=new File([bytes],'encrypted.bin',{type:'application/octet-stream'});
   if(file.size>10*1024*1024)throw Error('Encrypted file exceeds 10 MiB');
   const recovery=`ForeverChain private archive recovery information\nTitle: ${$('#title').value}\nKey (base64): ${encrypted.key}\nIV (base64): ${encrypted.iv}\nOriginal filename: ${original.name}\nOriginal MIME type: ${original.type}\n\nKEEP THIS SECRET. Anyone with the key and IV who can access the ciphertext can decrypt it. Losing the key means losing access.`;
   download(new Blob([recovery],{type:'text/plain'}),'foreverchain-RECOVERY-KEY.txt');
   status('Recovery key file generated. Store it safely offline. Uploading encrypted file...');
  }else status('Hashing and uploading file...');
  const fd=new FormData();fd.set('file',file);fd.set('title',$('#title').value);fd.set('visibility',visibility);fd.set('sha256',await digest(bytes));
  const result=await api('/archive',{method:'POST',body:fd});
  status(`Preserved successfully!\nRecord ID: ${result.id}\nSHA-256: ${result.sha256}\nLedger block: ${result.chain_height??'pending'}\n${visibility==='private'?'Your recovery key was downloaded; keep it safe.':''}`);
  $('#uploadForm').reset();await refresh();
 }catch(err){status(err.message,true)}finally{button.disabled=false}
});
refresh();
