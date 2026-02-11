import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

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
    fs.writeFileSync(DB_PATH, body, 'utf-8');

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `DB write failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
