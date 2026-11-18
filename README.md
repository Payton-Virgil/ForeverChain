# ForeverChain — preservation-first Cloudflare prototype

A deployable **prototype**, not a production blockchain or cryptocurrency.

**Includes:** Cloudflare Worker API, static responsive frontend, D1 account/session/archive/credit database, R2 media storage, client-side AES-256-GCM private uploads, SHA-256 file fingerprints, public explorer, cryptographically linked ledger, and an independent chain-verification script.

## Reality check

- **Not a decentralized blockchain:** the linked ledger is written to a single Cloudflare D1 database. Cloudflare/the database administrator can change it. A genuine blockchain requires independent validators, consensus, peer-to-peer replication, governance, and audits.
- **Not a cryptocurrency:** 100 demo preservation credits are issued to each anonymous session. They cannot be traded, transferred, mined, sold, or redeemed. The code does not launch a token.
- **Not permanent storage:** Cloudflare R2 is conventional object storage. File availability is subject to account, billing, service, and operational risks. Replicate to independently operated archival networks before marketing durable preservation.
- **Not production-ready:** anonymous sessions, no account recovery, no content moderation, no abuse detection, no upload streaming, no malware screening, no lifecycle policies, no key recovery, no privacy-law compliance workflow, no production observability, no legal review. Never entrust irreplaceable media to this MVP.

## Deploy to Cloudflare

Prerequisites: GitHub account, Cloudflare account with Workers, D1 and R2 access, Node.js 20+, npm.

1. Put this entire folder in a **private GitHub repository** initially. Never commit API tokens, wallet seeds, or recovery keys.
2. In your local terminal:
   ```bash
   npm install
   npx wrangler login
   npx wrangler d1 create foreverchain-db
   npx wrangler r2 bucket create foreverchain-media
   ```
3. Copy the `database_id` from the D1 creation output into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`.
4. Apply the schema and deploy:
   ```bash
   npm run db:remote
   npm run deploy
   ```
5. Open the `https://...workers.dev` URL printed by Wrangler. Workers static assets serve the frontend and `/api/*` serves the backend.
6. For GitHub automatic deployments, open **Cloudflare dashboard → Workers & Pages → your Worker → Settings → Builds → Connect Git repository** (dashboard labels may change). Configure build command `npm run deploy` if requested, and set any required Cloudflare build credentials securely in Cloudflare rather than GitHub source. If direct Git integration is unavailable, use GitHub Actions with a Cloudflare API token stored in GitHub Actions secrets.
7. After schema changes, run `npm run db:remote` before deploying changed code.

**Local development:**
```bash
npm run db:local
npm run dev
```
Wrangler uses local D1/R2 bindings in development. Some R2 features require enabling R2 in your Cloudflare account.

## Architecture

```
Browser (HTML/CSS/JS, Web Crypto AES-GCM)
  |
  +-- POST /api/archive --> Worker --> D1: metadata, demo credit debit, ledger
  |                              \--> R2: public bytes or encrypted private bytes
  +-- GET /api/explorer --> public records only
  +-- GET /api/mine --> cookie-authenticated own records
  +-- GET /api/media/:id --> public bytes or authenticated private ciphertext
  +-- GET /api/chain --> hash-linked record list
```

For private uploads, AES-256-GCM encrypts the file **in the browser** with a randomly generated key and IV. The user receives a recovery text file containing the key and IV. The server does not store the key. The **title, file size, SHA-256 of ciphertext, and ledger entry are not encrypted**; private records are hidden from public explorer/API but a database administrator can see metadata. **Private media is NOT invisible to the storage provider:** ciphertext is stored in R2. Avoid sensitive titles.

Browser sessions are anonymous and held in HttpOnly cookies; clearing cookies can permanently sever access to private ciphertext. The recovery key alone cannot restore server authorization. For a real service, add passkeys/account recovery and carefully designed encrypted key backup.

## API

| Route | Method | Description |
|---|---|---|
| `/api/session` | POST | Create anonymous demo account with 100 credits |
| `/api/me` | GET | Current account and credit balance |
| `/api/logout` | POST | Revoke current session |
| `/api/archive` | POST | Multipart `file,title,visibility,sha256` |
| `/api/explorer` | GET | Latest 50 public anchored archives |
| `/api/mine` | GET | Latest 100 owned archives |
| `/api/record/:id` | GET | Public or authorized private metadata |
| `/api/media/:id` | GET | Download public media or owned ciphertext |
| `/api/chain` | GET | First 1000 linked ledger entries |

Verify an online chain:
```bash
node scripts/verify-chain.mjs https://YOUR-WORKER.workers.dev
```
A verified chain only proves internal hash consistency, not decentralization or censorship resistance.

## Roadmap to an actual preservation blockchain and native preservation token

**Stage A: trustworthy application.** Add durable identities (passkeys), explicit consent, abuse reporting and moderation, user content removal at the presentation/storage layers, rights policies, backup, multi-region/independent replication, continuous retrieval audits, audit logs, rate limiting, antivirus scanning, privacy review, cost monitoring, and account recovery.

**Stage B: independent evidence.** Periodically anchor a Merkle root of archive records to an existing public blockchain. Publish independent verifier software and public proofs. Use an independently operated storage protocol with repair guarantees and funded redundancy. Do not expose unencrypted personal data or irreversible harmful content on public ledgers.

**Stage C: own network (only if justified).** Use an established audited chain SDK (e.g. Cosmos SDK or Substrate/Polkadot SDK) to build a separate validator-operated network. Run multiple independent nodes, Byzantine fault tolerant consensus, signed preservation commitments, network upgrades, chain explorers, slashing/penalties, audited token accounting, and disaster recovery. **A blockchain node cannot be deployed as a long-running peer-to-peer consensus validator on ordinary Cloudflare Workers.** Host validators on separate always-on servers and use Cloudflare for the website/API/gateway.

**Preservation token design (proposed):** non-speculative *utility unit* measuring paid preservation commitments, with transparent supply/reward policy and storage-provider incentives. A real transferable cryptoasset would need a separate economic model, legal review, smart-contract/security audits, anti-manipulation controls, and sustainable long-term storage reserves. Do not issue or sell tokens on the basis of this prototype.

## Known engineering limitations

- Uploads are capped at 10 MiB and buffered in Worker memory; implement multipart direct-to-R2 uploads with signed URLs for large videos.
- Concurrent ledger appends use optimistic retries; heavy write load requires a single sequencer (e.g. Durable Object) or transactional architecture. Failed ledger append can leave a stored archive marked `pending`.
- Credits and archive creation are not a single atomic transaction across D1 and R2; failures can create inconsistent state. Use a durable workflow/outbox, reconciliation jobs, and idempotency keys before production.
- `/api/chain` returns only the first 1000 blocks. Add cursor pagination.
- Client-side recovery key is displayed/downloaded only at upload time. Losing it makes decryption impossible.
- Public content is downloadable; no moderation, abuse controls, or copyright dispute process is implemented.
- No production tests of authentication, encryption, R2 availability, concurrency, or disaster recovery are included.
- Cloudflare free-tier quotas and pricing change. Check official pricing before launch.

## License

MIT for this prototype source. No warranty of fitness, preservation, security, or financial returns.arranty of fitness, preservation, security, or financial returns.
