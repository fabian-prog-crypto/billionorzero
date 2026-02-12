import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculatePortfolioSummary } from '@/services/domain/portfolio-calculator';

export async function GET() {
  try {
    const db = readDb();
    const summary = calculatePortfolioSummary(db.positions, db.prices, db.customPrices, db.fxRates);
    return NextResponse.json({ data: summary });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate portfolio summary', detail: String(error) },
      { status: 500 }
    );
  }
}
