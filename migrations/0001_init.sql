CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL,
 credit_balance INTEGER NOT NULL DEFAULT 100 CHECK(credit_balance >= 0)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archives (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES accounts(id),
 title TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
 content_type TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 chain_height INTEGER,
 chain_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_archives_owner ON archives(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archives_public ON archives(visibility, created_at DESC);
CREATE TABLE IF NOT EXISTS ledger (
 height INTEGER PRIMARY KEY,
 previous_hash TEXT NOT NULL,
 block_hash TEXT NOT NULL UNIQUE,
 archive_id TEXT NOT NULL UNIQUE REFERENCES archives(id),
 file_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_events (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 delta INTEGER NOT NULL,
 reason TEXT NOT NULL,
 archive_id TEXT,
 created_at TEXT NOT NULL
);
