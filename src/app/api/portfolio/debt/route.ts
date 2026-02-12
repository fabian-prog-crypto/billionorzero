import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculateAllPositionsWithPrices } from '@/services/domain/portfolio-calculator';

export async function GET() {
  try {
    const db = readDb();
    const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
    const debtPositions = assets.filter(a => a.isDebt || a.value < 0);
    const totalDebt = debtPositions.reduce((sum, a) => sum + Math.abs(a.value), 0);
    return NextResponse.json({ data: { positions: debtPositions, totalDebt } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate debt positions', detail: String(error) },
      { status: 500 }
    );
  }
}
