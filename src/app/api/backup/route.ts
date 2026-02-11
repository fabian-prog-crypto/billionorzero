import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const MAX_DAILY_BACKUPS = 30;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * POST /api/backup — Write current.json + daily backup (max 30)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    ensureBackupDir();

    const payload = JSON.stringify(body, null, 2);

    // Always overwrite current.json
    fs.writeFileSync(path.join(BACKUP_DIR, 'current.json'), payload, 'utf-8');

    // Write daily backup if one doesn't exist for today
    const today = new Date().toISOString().split('T')[0];
    const dailyFile = `backup-${today}.json`;
    const dailyPath = path.join(BACKUP_DIR, dailyFile);
    if (!fs.existsSync(dailyPath)) {
      fs.writeFileSync(dailyPath, payload, 'utf-8');

      // Prune old daily backups beyond MAX_DAILY_BACKUPS
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .sort()
        .reverse();

      files.slice(MAX_DAILY_BACKUPS).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      });
    }

    return NextResponse.json({ ok: true, file: dailyFile });
  } catch (error) {
    return NextResponse.json(
      { error: `Backup failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/backup — List backups or return a specific file
 *   ?file=current.json  → return file contents
 *   (no params)         → return list of available backups
 */
export async function GET(request: NextRequest) {
  try {
    ensureBackupDir();

    const file = request.nextUrl.searchParams.get('file');

    if (file) {
      // Prevent directory traversal
      const safeName = path.basename(file);
      const filePath = path.join(BACKUP_DIR, safeName);

      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const contents = fs.readFileSync(filePath, 'utf-8');
      return NextResponse.json(JSON.parse(contents));
    }

    // List all backups with metadata
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    return NextResponse.json({ backups: files });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list backups: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
