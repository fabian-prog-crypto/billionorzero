/**
 * Shared data layer for the Portfolio REST API.
 * Reads/writes data/db.json (Zustand persist format).
 */

import fs from 'fs';
import path from 'path';
import type { Position, Account, PriceData, NetWorthSnapshot, Transaction } from '@/types';
import type { CustomPrice } from '@/store/portfolioStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortfolioData {
  positions: Position[];
  accounts: Account[];
  prices: Record<string, PriceData>;
  customPrices: Record<string, CustomPrice>;
  fxRates: Record<string, number>;
  transactions: Transaction[];
  snapshots: NetWorthSnapshot[];
  lastRefresh: string | null;
  hideBalances: boolean;
  hideDust: boolean;
  riskFreeRate: number;
}

interface ZustandPersistWrapper {
  state: PortfolioData;
  version: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const STORE_VERSION = 13;

const EMPTY_DATA: PortfolioData = {
  positions: [],
  accounts: [],
  prices: {},
  customPrices: {},
  fxRates: {},
  transactions: [],
  snapshots: [],
  lastRefresh: null,
  hideBalances: false,
  hideDust: false,
  riskFreeRate: 0.05,
};

// ─── File lock ────────────────────────────────────────────────────────────────

let writeLock: Promise<void> = Promise.resolve();

function acquireLock(): { release: () => void; ready: Promise<void> } {
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = writeLock;
  writeLock = writeLock.then(() => next);
  return { release: release!, ready };
}

// ─── Core functions ───────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Read and parse db.json. Returns typed PortfolioData.
 * Returns empty defaults if file is missing or empty.
 */
export function readDb(): PortfolioData {
  ensureDataDir();

  if (!fs.existsSync(DB_PATH)) {
    return { ...EMPTY_DATA };
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8').trim();
    if (!raw || raw === '{}') {
      return { ...EMPTY_DATA };
    }

    const parsed = JSON.parse(raw);

    // Zustand persist format: { state: {...}, version: N }
    if (parsed.state && typeof parsed.state === 'object') {
      const state = parsed.state as Partial<PortfolioData>;
      return {
        positions: state.positions ?? [],
        accounts: state.accounts ?? [],
        prices: state.prices ?? {},
        customPrices: state.customPrices ?? {},
        fxRates: state.fxRates ?? {},
        transactions: state.transactions ?? [],
        snapshots: state.snapshots ?? [],
        lastRefresh: state.lastRefresh ?? null,
        hideBalances: state.hideBalances ?? false,
        hideDust: state.hideDust ?? false,
        riskFreeRate: state.riskFreeRate ?? 0.05,
      };
    }

    // Flat format (backup file seeded in): wrap it
    if (parsed.positions || parsed.accounts) {
      return {
        positions: parsed.positions ?? [],
        accounts: parsed.accounts ?? [],
        prices: parsed.prices ?? {},
        customPrices: parsed.customPrices ?? {},
        fxRates: parsed.fxRates ?? {},
        transactions: parsed.transactions ?? [],
        snapshots: parsed.snapshots ?? [],
        lastRefresh: parsed.lastRefresh ?? null,
        hideBalances: parsed.hideBalances ?? false,
        hideDust: parsed.hideDust ?? false,
        riskFreeRate: parsed.riskFreeRate ?? 0.05,
      };
    }

    return { ...EMPTY_DATA };
  } catch {
    return { ...EMPTY_DATA };
  }
}

/**
 * Write PortfolioData to db.json with atomic rename.
 */
export function writeDb(data: PortfolioData): void {
  ensureDataDir();

  const wrapper: ZustandPersistWrapper = {
    state: data,
    version: STORE_VERSION,
  };

  const json = JSON.stringify(wrapper);
  const tmpPath = DB_PATH + '.tmp';

  fs.writeFileSync(tmpPath, json, 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

/**
 * Read-modify-write with file locking to prevent concurrent writes.
 * The fn receives current data and returns { data: newData, result: T }.
 */
export async function withDb<T>(
  fn: (data: PortfolioData) => { data: PortfolioData; result: T }
): Promise<T> {
  const lock = acquireLock();
  await lock.ready;

  try {
    const current = readDb();
    const { data: updated, result } = fn(current);
    writeDb(updated);
    return result;
  } finally {
    lock.release();
  }
}
