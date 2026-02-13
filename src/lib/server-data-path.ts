import fs from 'fs';
import path from 'path';

function resolveRepoRoot(cwd: string): string {
  const gitEntry = path.join(cwd, '.git');

  try {
    if (!fs.existsSync(gitEntry)) return cwd;

    const stat = fs.statSync(gitEntry);
    if (stat.isDirectory()) return cwd;
    if (!stat.isFile()) return cwd;

    const raw = fs.readFileSync(gitEntry, 'utf-8').trim();
    const match = raw.match(/^gitdir:\s*(.+)\s*$/i);
    if (!match) return cwd;

    const gitDirPath = path.resolve(cwd, match[1]);
    const worktreeMarker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
    if (!gitDirPath.includes(worktreeMarker)) return cwd;

    const rootCandidate = path.resolve(gitDirPath, '..', '..', '..');
    if (fs.existsSync(path.join(rootCandidate, '.git'))) {
      return rootCandidate;
    }
  } catch {
    // Fall back to current working directory.
  }

  return cwd;
}

const REPO_ROOT = resolveRepoRoot(process.cwd());
const DATA_DIR_OVERRIDE = process.env.PORTFOLIO_DATA_DIR;
const DB_PATH_OVERRIDE = process.env.PORTFOLIO_DB_PATH;

export function getDataDir(): string {
  if (DATA_DIR_OVERRIDE) return path.resolve(DATA_DIR_OVERRIDE);
  if (DB_PATH_OVERRIDE) return path.dirname(path.resolve(DB_PATH_OVERRIDE));
  return path.join(REPO_ROOT, 'data');
}

export function getDbPath(): string {
  if (DB_PATH_OVERRIDE) return path.resolve(DB_PATH_OVERRIDE);
  return path.join(getDataDir(), 'db.json');
}

export function getBackupDir(): string {
  return path.join(getDataDir(), 'backups');
}

