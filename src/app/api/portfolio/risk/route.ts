import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculateAllPositionsWithPrices, calculateRiskProfile } from '@/services/domain/portfolio-calculator';

export async function GET() {
  try {
    const db = readDb();
    const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
    const risk = calculateRiskProfile(assets);
    return NextResponse.json({ data: risk });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate risk profile', detail: String(error) },
      { status: 500 }
    );
  }
}
