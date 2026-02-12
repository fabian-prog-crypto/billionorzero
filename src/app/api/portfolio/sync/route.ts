/**
 * POST /api/portfolio/sync — Sync Zustand state to db.json
 *
 * Receives the client-side Zustand store state and writes it to db.json
 * so CMD-K (which reads from db.json) stays in sync with the frontend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readDb, writeDb, type PortfolioData } from '../db-store';

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

    // Guard: refuse to overwrite a populated db with empty data
    const existing = readDb();
    if (
      existing.positions.length > 0 &&
      state.positions.length === 0 &&
      state.accounts.length === 0
    ) {
      return NextResponse.json(
        { error: 'Refusing to wipe database: incoming state has no positions or accounts but existing db has data. This is likely a bug.' },
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
