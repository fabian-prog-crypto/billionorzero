/**
 * One-time script to restore missing positions from backup into db.json.
 *
 * Background: db.json lost 61% of positions (270 remain vs 688 in backup),
 * likely from a partial sync overwriting with incomplete API results.
 * All 7 debt positions are gone.
 *
 * Strategy:
 * - Keep db.json's v13 account structure (already correctly migrated)
 * - For positions that exist in both (by ID): keep db.json version (newer, has assetClass)
 * - For positions only in backup: migrate to v13 format and add
 * - Never touch portfolio-backup-11022026.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const DB_PATH = join(ROOT, 'data', 'db.json');
const BACKUP_PATH = join(ROOT, 'portfolio-backup-11022026.json');

// --- Read files ---

const db = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf-8'));

const dbState = db.state;
const backupState = backup.state;

console.log(`db.json:  ${dbState.positions.length} positions, ${dbState.accounts.length} accounts (v${db.version})`);
console.log(`backup:   ${backupState.positions.length} positions, ${backupState.accounts.length} accounts (v${backup.version})`);

// --- Build position map from db.json (keyed by ID) ---

const dbPositionMap = new Map();
for (const pos of dbState.positions) {
  dbPositionMap.set(pos.id, pos);
}

// --- Migrate a backup position to v13 format ---

function assetClassFromType(type) {
  switch (type) {
    case 'crypto': return 'crypto';
    case 'stock':
    case 'etf': return 'equity';
    case 'cash': return 'cash';
    case 'manual': return 'other';
    default: return 'other';
  }
}

function migratePosition(pos) {
  const migrated = { ...pos };

  // Add assetClass if missing
  if (!migrated.assetClass) {
    migrated.assetClass = assetClassFromType(migrated.type);
  }

  // Add equityType for stock/etf positions
  if ((migrated.type === 'stock' || migrated.type === 'etf') && !migrated.equityType) {
    migrated.equityType = migrated.type;
  }

  return migrated;
}

// --- Merge positions ---

let restoredCount = 0;
let keptCount = 0;
const mergedPositions = [...dbState.positions]; // Start with all db.json positions

for (const backupPos of backupState.positions) {
  if (dbPositionMap.has(backupPos.id)) {
    keptCount++;
  } else {
    // Position only in backup — migrate and add
    mergedPositions.push(migratePosition(backupPos));
    restoredCount++;
  }
}

// --- Verify debt positions ---

const debtPositions = mergedPositions.filter(p => p.isDebt);
console.log(`\nResults:`);
console.log(`  Kept from db.json:     ${keptCount} (already present)`);
console.log(`  Restored from backup:  ${restoredCount}`);
console.log(`  Total positions:       ${mergedPositions.length}`);
console.log(`  Debt positions:        ${debtPositions.length}`);

if (debtPositions.length > 0) {
  console.log(`\nDebt positions restored:`);
  for (const d of debtPositions) {
    console.log(`  - ${d.symbol} (${d.protocol}): ${d.amount}`);
  }
}

// --- Verify all positions have assetClass ---

const missingAssetClass = mergedPositions.filter(p => !p.assetClass);
if (missingAssetClass.length > 0) {
  console.error(`\nERROR: ${missingAssetClass.length} positions missing assetClass!`);
  process.exit(1);
}
console.log(`\nAll ${mergedPositions.length} positions have assetClass.`);

// --- Write back to db.json ---

const output = {
  state: {
    ...dbState,
    positions: mergedPositions,
  },
  version: 13,
};

writeFileSync(DB_PATH, JSON.stringify(output), 'utf-8');
console.log(`\nWritten to ${DB_PATH}`);
console.log('Done.');
