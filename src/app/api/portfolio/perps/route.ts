import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculateAllPositionsWithPrices, calculatePerpPageData } from '@/services/domain/portfolio-calculator';

export async function GET() {
  try {
    const db = readDb();
    const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
    const perpData = calculatePerpPageData(assets);
    return NextResponse.json({ data: perpData });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate perp data', detail: String(error) },
      { status: 500 }
    );
  }
}
