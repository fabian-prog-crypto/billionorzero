/**
 * @vitest-environment jsdom
 */

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
    `db.chat-real-qa.${Date.now()}.${Math.random().toString(36).slice(2)}.json`
  );
  fs.copyFileSync(src, tmpPath);
  return tmpPath;
}

function makeOllamaResponse(message: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockOllamaSequence(messages: Array<Record<string, unknown>>) {
  let idx = 0;
  const terminalMessage =
    messages[messages.length - 1] || { role: 'assistant', content: 'done' };
  const fetchMock = vi.fn(async () => {
    const message = idx < messages.length ? messages[idx] : terminalMessage;
    idx += 1;
    return makeOllamaResponse(message);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function invokeChat(text: string): Promise<Response> {
  const { POST } = await import('@/app/api/chat/route');
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2:latest',
    }),
  });
  return POST(req);
}

describe('chat route real-db QA (temp clone, no prod writes)', () => {
  let tempDbPath = '';
  const originalDbEnv = process.env.PORTFOLIO_DB_PATH;

  beforeEach(() => {
    tempDbPath = cloneRealDbToTemp();
    process.env.PORTFOLIO_DB_PATH = tempDbPath;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('BZ-013: buy_position totalCost-only flow derives a positive amount for confirmation', async () => {
    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'buy_position',
              arguments: {
                symbol: 'AMZN',
                assetType: 'stock',
                totalCost: 1000,
                price: 200,
              },
            },
          },
        ],
      },
    ]);

    const res = await invokeChat('buy $1000 worth of AMZN');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.pendingAction).toBeDefined();
    expect(json.pendingAction.action).toBe('buy');
    expect(json.pendingAction.totalCost).toBe(1000);
    expect(json.pendingAction.amount).toBeGreaterThan(0);
  });

  it('BZ-014/BZ-020: add_cash resolves canonical account and links existing same account+currency position', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const { extractCurrencyCode } = await import('@/services/domain/portfolio-calculator');
    const db = readDb();
    const broker = db.accounts.find(
      (a) => a.connection.dataSource === 'manual' && a.name.toLowerCase() === 'revolut broker'
    );
    expect(broker).toBeDefined();
    if (!broker) return;

    const existingUsd = db.positions.find(
      (p) => p.type === 'cash' && p.accountId === broker.id && extractCurrencyCode(p.symbol) === 'USD'
    );
    expect(existingUsd).toBeDefined();
    if (!existingUsd) return;

    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'add_cash',
              arguments: {
                currency: 'USD',
                amount: 500,
                account: 'revolut broker',
              },
            },
          },
        ],
      },
    ]);

    const res = await invokeChat('add 500 USD to revolut broker');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.pendingAction).toBeDefined();
    expect(json.pendingAction.action).toBe('add_cash');
    expect(json.pendingAction.matchedAccountId).toBe(broker.id);
    expect(json.pendingAction.accountName).toBe(broker.name);
    expect(json.pendingAction.matchedPositionId).toBe(existingUsd.id);
  });

  it('BZ-014.1: add_cash resolves accountName alias in tool args', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const { extractCurrencyCode } = await import('@/services/domain/portfolio-calculator');
    const db = readDb();
    const broker = db.accounts.find(
      (a) => a.connection.dataSource === 'manual' && a.name.toLowerCase() === 'revolut broker'
    );
    expect(broker).toBeDefined();
    if (!broker) return;

    const existingUsd = db.positions.find(
      (p) => p.type === 'cash' && p.accountId === broker.id && extractCurrencyCode(p.symbol) === 'USD'
    );
    expect(existingUsd).toBeDefined();
    if (!existingUsd) return;

    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'add_cash',
              arguments: {
                currency: 'USD',
                amount: 500,
                accountName: 'revolut broker',
              },
            },
          },
        ],
      },
    ]);

    const res = await invokeChat('add 500 USD to revolut broker');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.pendingAction).toBeDefined();
    expect(json.pendingAction.action).toBe('add_cash');
    expect(json.pendingAction.matchedAccountId).toBe(broker.id);
    expect(json.pendingAction.accountName).toBe(broker.name);
    expect(json.pendingAction.matchedPositionId).toBe(existingUsd.id);
  });

  it('BZ-015: update_cash keeps ambiguous account names unresolved (no fuzzy auto-targeting)', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const db = readDb();
    const revolutLikeAccounts = db.accounts.filter(
      (a) => a.connection.dataSource === 'manual' && a.name.toLowerCase().includes('revolut')
    );
    expect(revolutLikeAccounts.length).toBeGreaterThanOrEqual(2);

    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'update_cash',
              arguments: {
                currency: 'EUR',
                amount: 1000,
                account: 'revol',
              },
            },
          },
        ],
      },
    ]);

    const res = await invokeChat('set revolut EUR cash to 1000');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.pendingAction).toBeDefined();
    expect(json.pendingAction.action).toBe('update_position');
    expect(json.pendingAction.assetType).toBe('cash');
    expect(json.pendingAction.matchedAccountId).toBeUndefined();
    expect(json.pendingAction.matchedPositionId).toBeUndefined();
  });

  it('BZ-016: query_positions_by_type uses canonical asset-class filters for cash and crypto', async () => {
    const { readDb } = await import('@/app/api/portfolio/db-store');
    const { calculateAllPositionsWithPrices } = await import('@/services/domain/portfolio-calculator');
    const { isPositionInAssetClass } = await import('@/services/domain/account-role-service');
    const db = readDb();
    const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
    const expectedCashCount = assets.filter((asset) => isPositionInAssetClass(asset, 'cash')).length;
    const expectedCryptoCount = assets.filter((asset) => isPositionInAssetClass(asset, 'crypto')).length;

    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'query_positions_by_type',
              arguments: { assetType: 'cash' },
            },
          },
        ],
      },
      { role: 'assistant', content: 'done' },
    ]);
    const cashRes = await invokeChat('show cash positions');
    if (cashRes.status !== 200) {
      const err = await cashRes.json();
      throw new Error(`cash query failed (${cashRes.status}): ${JSON.stringify(err)}`);
    }
    const cashJson = await cashRes.json();
    const cashRows = cashJson.toolCalls[0].result as Array<{ symbol: string }>;
    expect(cashRows.length).toBe(expectedCashCount);
    expect(cashRows.every((row) => row.symbol.toUpperCase().startsWith('CASH_'))).toBe(true);

    vi.unstubAllGlobals();
    mockOllamaSequence([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'query_positions_by_type',
              arguments: { assetType: 'crypto' },
            },
          },
        ],
      },
      { role: 'assistant', content: 'done' },
    ]);
    const cryptoRes = await invokeChat('show crypto positions');
    if (cryptoRes.status !== 200) {
      const err = await cryptoRes.json();
      throw new Error(`crypto query failed (${cryptoRes.status}): ${JSON.stringify(err)}`);
    }
    const cryptoJson = await cryptoRes.json();
    const cryptoRows = cryptoJson.toolCalls[0].result as Array<{ symbol: string }>;
    expect(cryptoRows.length).toBe(expectedCryptoCount);
    expect(cryptoRows.every((row) => !row.symbol.toUpperCase().startsWith('CASH_'))).toBe(true);
  });
});
