import { NextResponse } from 'next/server';
import { readDb } from '../db-store';

export async function GET() {
  try {
    const db = readDb();
    return NextResponse.json({
      data: {
        prices: db.prices,
        customPrices: db.customPrices,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read prices' }, { status: 500 });
  }
}
