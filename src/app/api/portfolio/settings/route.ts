import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../db-store';

export async function GET() {
  try {
    const db = readDb();
    return NextResponse.json({
      data: {
        hideBalances: db.hideBalances,
        hideDust: db.hideDust,
        riskFreeRate: db.riskFreeRate,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const settings = await withDb((db) => {
      if (typeof body.hideBalances === 'boolean') {
        db.hideBalances = body.hideBalances;
      }
      if (typeof body.hideDust === 'boolean') {
        db.hideDust = body.hideDust;
      }
      if (typeof body.riskFreeRate === 'number') {
        db.riskFreeRate = body.riskFreeRate;
      }

      return {
        data: db,
        result: {
          hideBalances: db.hideBalances,
          hideDust: db.hideDust,
          riskFreeRate: db.riskFreeRate,
        },
      };
    });

    return NextResponse.json({ data: settings });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
