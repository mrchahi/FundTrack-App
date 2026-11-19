import fs from 'fs';
import { saveState } from './db';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: tsx import-backup.ts <path-to-backup.json>');
  process.exit(1);
}

const raw = fs.readFileSync(backupPath, 'utf8');
const parsed = JSON.parse(raw);

const state = parsed.state ?? parsed;
if (!state || typeof state !== 'object' || !Array.isArray(state.trades)) {
  console.error('ERROR: backup does not contain a valid FundTrackState (state.trades array missing).');
  process.exit(1);
}

saveState('default', state);
console.log('IMPORTED state into SQLite (userId=default)');
console.log('  trades:', state.trades.length);
console.log('  transactions:', (state.transactions || []).length);
console.log('  bankAccounts:', (state.bankAccounts || []).length);
console.log('  mt5Accounts:', (state.mt5Accounts || []).length);
console.log('  goals:', (state.goals || []).length);
