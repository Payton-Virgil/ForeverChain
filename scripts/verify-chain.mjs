const url=process.argv[2];
if(!url){console.error('Usage: node scripts/verify-chain.mjs https://YOUR-WORKER.workers.dev');process.exit(1)}
const r=await fetch(url.replace(/\/$/,'')+'/api/chain');if(!r.ok)throw Error('Unable to fetch chain');
const {blocks}=await r.json();let prev='0'.repeat(64),height=1;
for(const b of blocks){
 const data=JSON.stringify([b.height,b.previous_hash,b.archive_id,b.file_hash,b.created_at]);
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),x=>x.toString(16).padStart(2,'0')).join('');
 if(b.height!==height||b.previous_hash!==prev||actual!==b.block_hash)throw Error('Chain mismatch at height '+b.height);
 prev=b.block_hash;height++;
}
console.log(`Verified ${blocks.length} linked records. Note: this does NOT establish decentralized consensus or independently attest media availability.`);
