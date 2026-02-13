/**
 * POST /api/portfolio/sync — Sync Zustand state to db.json
 *
 * Receives the client-side Zustand store state and writes it to db.json
 * so CMD-K (which reads from db.json) stays in sync with the frontend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readDb, writeDb, type PortfolioData } from '../db-store';
import { runSyncGuards } from '../sync-guards';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract portfolio data from the request
    const state: PortfolioData = {
      positions: body.positions ?? [],
      accounts: body.accounts ?? [],
      prices: body.prices ?? {},
      customPrices: body.customPrices ?? {},
      fxRates: body.fxRates ?? {},
      transactions: body.transactions ?? [],
      snapshots: body.snapshots ?? [],
      lastRefresh: body.lastRefresh ?? null,
      hideBalances: body.hideBalances ?? false,
      hideDust: body.hideDust ?? false,
      riskFreeRate: body.riskFreeRate ?? 0.05,
    };

    // Run all data-loss guards before writing
    const existing = readDb();
    const guard = runSyncGuards(existing, state);
    if (!guard.allowed) {
      return NextResponse.json(
        { error: guard.reason },
        { status: 409 }
      );
    }

    writeDb(state);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
