import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------- SQLite storage for FundTrack app state --------
// The whole FundTrackState (same shape that was previously kept in localStorage)
// is persisted here as a JSON blob, keyed by a user/device id. This lets the
// desktop browser and the phone share the same data through this server.

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.FUNDTRACK_DB_PATH || path.join(DATA_DIR, 'fundtrack.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function loadState(id: string): { state: unknown; updatedAt: string } | null {
  const row = getDb()
    .prepare('SELECT state_json, updated_at FROM app_state WHERE id = ?')
    .get(id) as { state_json: string; updated_at: string } | undefined;
  if (!row) return null;
  try {
    return { state: JSON.parse(row.state_json), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

// Overwrite the stored state for this id (last-write-wins).
export function saveState(id: string, state: unknown): void {
  const json = JSON.stringify(state);
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO app_state (id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`
    )
    .run(id, json, updatedAt);
}

export function dbHealth(): { ok: boolean; path: string; sizeBytes: number } {
  try {
    const d = getDb();
    const size = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    return { ok: true, path: DB_PATH, sizeBytes: size };
  } catch {
    return { ok: false, path: DB_PATH, sizeBytes: 0 };
  }
}
