import { NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { calculatePerformanceMetrics } from '@/services/domain/performance-metrics';

export async function GET() {
  try {
    const db = readDb();
    if (db.snapshots.length < 2) {
      return NextResponse.json({ data: null, message: 'Insufficient snapshot data' });
    }
    const metrics = calculatePerformanceMetrics(db.snapshots, db.riskFreeRate);
    return NextResponse.json({ data: metrics });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate performance metrics', detail: String(error) },
      { status: 500 }
    );
  }
}
