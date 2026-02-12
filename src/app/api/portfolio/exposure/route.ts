import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculateAllPositionsWithPrices, calculateExposureData } from '@/services/domain/portfolio-calculator';

export async function GET() {
  try {
    const db = readDb();
    const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
    const exposure = calculateExposureData(assets);
    return NextResponse.json({ data: exposure });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate exposure data', detail: String(error) },
      { status: 500 }
    );
  }
}
