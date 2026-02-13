import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

function cloneRealDbToTemp(): string {
  const src = path.join(process.cwd(), 'data', 'db.json');
  const tmpPath = path.join(os.tmpdir(), `db.sell-real-qa.${Date.now()}.${Math.random().toString(36).slice(2)}.json`);
  fs.copyFileSync(src, tmpPath);
  return tmpPath;
}

describe('BZ-019 real-db QA (temp clone, no prod writes)', () => {
  let tempDbPath = '';
  const originalDbEnv = process.env.PORTFOLIO_DB_PATH;

  beforeEach(() => {
    tempDbPath = cloneRealDbToTemp();
    process.env.PORTFOLIO_DB_PATH = tempDbPath;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalDbEnv) {
      process.env.PORTFOLIO_DB_PATH = originalDbEnv;
    } else {
      delete process.env.PORTFOLIO_DB_PATH;
    }
    try {
      fs.unlinkSync(tempDbPath);
    } catch {
      // ignore
    }
  });

  it('partial sell updates amount and cost basis proportionally (domain parity)', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const { POST } = await import('@/app/api/portfolio/positions/[id]/sell/route');

    const before = readDb();
    const candidate = before.positions.find(
      (p) =>
        typeof p.costBasis === 'number' &&
        p.costBasis > 0 &&
        p.amount > 1
    );

    expect(candidate).toBeDefined();
    if (!candidate) return;

    const sellAmount = Number((candidate.amount * 0.4).toFixed(8));
    const req = new NextRequest(`http://localhost/api/portfolio/positions/${candidate.id}/sell`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: sellAmount, price: 123.45 }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: candidate.id }) });
    expect(res.status).toBe(200);

    const after = readDb();
    const updated = after.positions.find((p) => p.id === candidate.id);
    expect(updated).toBeDefined();
    if (!updated) return;

    const expectedRemainingAmount = candidate.amount - sellAmount;
    const expectedRemainingCostBasis =
      (candidate.costBasis ?? 0) * (expectedRemainingAmount / candidate.amount);

    expect(Math.abs(updated.amount - expectedRemainingAmount)).toBeLessThanOrEqual(1e-8);
    expect(Math.abs((updated.costBasis ?? 0) - expectedRemainingCostBasis)).toBeLessThanOrEqual(1e-6);
  });
});
