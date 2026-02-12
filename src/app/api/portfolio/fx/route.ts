import { NextResponse } from 'next/server';
import { readDb } from '../db-store';

export async function GET() {
  try {
    const db = readDb();
    return NextResponse.json({ data: db.fxRates });
  } catch {
    return NextResponse.json({ error: 'Failed to read FX rates' }, { status: 500 });
  }
}
