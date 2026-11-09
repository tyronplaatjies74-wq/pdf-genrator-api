import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

let _db;

export function db() {
  if (_db) return _db;
  if (env.DATABASE_PATH !== ':memory:') {
    fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });
  }
  _db = new Database(env.DATABASE_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_keys_customer ON api_keys(stripe_customer_id);
    CREATE TABLE IF NOT EXISTS usage (
      key_id TEXT NOT NULL,
      period TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key_id, period)
    );
  `);
  return _db;
}

export function closeDb() {
  if (_db) _db.close();
  _db = undefined;
}