import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDataDir, getDbPath, getBackupDir } from '@/lib/server-data-path';

const DATA_DIR = getDataDir();
const DB_PATH = getDbPath();
const BACKUP_DIR = getBackupDir();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Find the best backup to seed from: prefer the largest file
 * (current.json may be empty if the store was cleared before backup ran).
 */
function findBestBackup(): string | null {
  if (!fs.existsSync(BACKUP_DIR)) return null;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      size: fs.statSync(path.join(BACKUP_DIR, f)).size,
    }))
    .sort((a, b) => b.size - a.size); // Largest first

  return files.length > 0 && files[0].size > 100 ? files[0].path : null;
}

/**
 * GET /api/db — Read db.json (seed from best backup if missing)
 */
export async function GET() {
  try {
    ensureDataDir();

    // If db.json doesn't exist, seed from best backup
    if (!fs.existsSync(DB_PATH)) {
      const backupPath = findBestBackup();
      if (backupPath) {
        fs.copyFileSync(backupPath, DB_PATH);
      } else {
        return NextResponse.json({});
      }
    }

    const contents = fs.readFileSync(DB_PATH, 'utf-8');
    return new NextResponse(contents, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `DB read failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/db — Write to db.json
 */
export async function PUT(request: NextRequest) {
  try {
    ensureDataDir();

    const body = await request.text();

    // Guard 1: refuse to overwrite a populated db with empty/tiny data
    if (fs.existsSync(DB_PATH)) {
      const existingSize = fs.statSync(DB_PATH).size;
      if (existingSize > 1000 && body.length < 100) {
        return NextResponse.json(
          { error: 'Refusing to wipe database: incoming payload is suspiciously small compared to existing data. This is likely a bug.' },
          { status: 409 }
        );
      }

      // Guard 2: parse and check position counts to catch partial data loss
      try {
        const existingData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        const incomingData = JSON.parse(body);
        const existingPositions = existingData?.state?.positions ?? existingData?.positions ?? [];
        const incomingPositions = incomingData?.state?.positions ?? incomingData?.positions ?? [];

        if (
          existingPositions.length >= 10 &&
          incomingPositions.length / existingPositions.length < 0.5
        ) {
          return NextResponse.json(
            { error: `Refusing to overwrite database: position count would drop from ${existingPositions.length} to ${incomingPositions.length} (${Math.round(incomingPositions.length / existingPositions.length * 100)}%). This looks like a partial sync failure.` },
            { status: 409 }
          );
        }
      } catch {
        // If we can't parse either file, fall through and allow the write
      }
    }

    fs.writeFileSync(DB_PATH, body, 'utf-8');

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `DB write failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
