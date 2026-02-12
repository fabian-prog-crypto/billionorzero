import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../db-store';
import { calculatePortfolioSummary } from '@/services/domain/portfolio-calculator';
import type { NetWorthSnapshot } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const db = readDb();
    const url = request.nextUrl;

    let snapshots = db.snapshots;

    const from = url.searchParams.get('from');
    if (from) {
      snapshots = snapshots.filter((s) => s.date >= from);
    }

    const to = url.searchParams.get('to');
    if (to) {
      snapshots = snapshots.filter((s) => s.date <= to);
    }

    const limitParam = url.searchParams.get('limit');
    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        snapshots = snapshots.slice(-limit);
      }
    }

    return NextResponse.json({ data: snapshots });
  } catch {
    return NextResponse.json({ error: 'Failed to read snapshots' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const snapshot = await withDb((db) => {
      const summary = calculatePortfolioSummary(
        db.positions,
        db.prices,
        db.customPrices,
        db.fxRates
      );

      const newSnapshot: NetWorthSnapshot = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        totalValue: summary.totalValue,
        cryptoValue: summary.cryptoValue,
        equityValue: summary.equityValue,
        cashValue: summary.cashValue,
        otherValue: summary.otherValue,
      };

      db.snapshots.push(newSnapshot);
      return { data: db, result: newSnapshot };
    });

    return NextResponse.json({ data: snapshot }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
  }
}
