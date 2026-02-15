import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

function resolveSeedDbPath(): string {
  const primary = path.join(process.cwd(), 'data', 'db.json');
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(process.cwd(), 'portfolio-backup-11022026.json');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error('Missing seed db.json and portfolio-backup-11022026.json for real-db QA tests.');
}

function cloneRealDbToTemp(): string {
  const src = resolveSeedDbPath();
  const tmpPath = path.join(
    os.tmpdir(),
    `db.positions-id-real-qa.${Date.now()}.${Math.random().toString(36).slice(2)}.json`
  );
  fs.copyFileSync(src, tmpPath);
  return tmpPath;
}

describe('positions/[id] real-db QA (temp clone, no prod writes)', () => {
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

  it('BZ-010: updating/deleting one cash position id does not fan out to same-currency siblings', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const { extractCurrencyCode } = await import('@/services/domain/portfolio-calculator');
    const { PUT, DELETE } = await import('@/app/api/portfolio/positions/[id]/route');

    const before = readDb();
    const eurCash = before.positions.filter(
      (p) => p.type === 'cash' && extractCurrencyCode(p.symbol) === 'EUR'
    );

    expect(eurCash.length).toBeGreaterThan(1);
    const target = eurCash[0];
    const sibling = eurCash.find((p) => p.id !== target.id);
    expect(sibling).toBeDefined();
    if (!sibling) return;

    const newAmount = Number((target.amount + 123.45).toFixed(8));
    const putReq = new NextRequest(`http://localhost/api/portfolio/positions/${target.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: newAmount }),
    });
    const putRes = await PUT(putReq, { params: Promise.resolve({ id: target.id }) });
    expect(putRes.status).toBe(200);

    const afterPut = readDb();
    const updatedTarget = afterPut.positions.find((p) => p.id === target.id);
    const unchangedSiblingAfterPut = afterPut.positions.find((p) => p.id === sibling.id);
    expect(updatedTarget).toBeDefined();
    expect(unchangedSiblingAfterPut).toBeDefined();
    if (!updatedTarget || !unchangedSiblingAfterPut) return;

    expect(updatedTarget.amount).toBe(newAmount);
    expect(unchangedSiblingAfterPut.amount).toBe(sibling.amount);

    const deleteReq = new NextRequest(`http://localhost/api/portfolio/positions/${target.id}`, {
      method: 'DELETE',
    });
    const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id: target.id }) });
    expect(deleteRes.status).toBe(200);

    const afterDelete = readDb();
    expect(afterDelete.positions.find((p) => p.id === target.id)).toBeUndefined();
    const siblingAfterDelete = afterDelete.positions.find((p) => p.id === sibling.id);
    expect(siblingAfterDelete).toBeDefined();
    expect(siblingAfterDelete?.amount).toBe(sibling.amount);
  });
});
