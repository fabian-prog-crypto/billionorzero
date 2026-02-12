import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../../db-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const key = symbol.toUpperCase();
    const db = readDb();

    const price = db.prices[key] ?? null;
    const customPrice = db.customPrices[key] ?? null;

    if (!price && !customPrice) {
      return NextResponse.json({ error: `Price not found for ${key}` }, { status: 404 });
    }

    return NextResponse.json({
      data: { symbol: key, price, customPrice },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read price' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const key = symbol.toUpperCase();
    const body = await request.json();

    if (typeof body.price !== 'number' || body.price < 0) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
    }

    const customPrice = await withDb((db) => {
      const entry = {
        price: body.price as number,
        note: (body.note as string | undefined) ?? undefined,
        setAt: new Date().toISOString(),
      };
      db.customPrices[key] = entry;
      return { data: db, result: entry };
    });

    return NextResponse.json({ data: { symbol: key, customPrice } });
  } catch {
    return NextResponse.json({ error: 'Failed to set custom price' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const key = symbol.toUpperCase();

    const deleted = await withDb((db) => {
      const existed = key in db.customPrices;
      delete db.customPrices[key];
      return { data: db, result: existed };
    });

    if (!deleted) {
      return NextResponse.json({ error: `No custom price for ${key}` }, { status: 404 });
    }

    return NextResponse.json({ data: { symbol: key, removed: true } });
  } catch {
    return NextResponse.json({ error: 'Failed to remove custom price' }, { status: 500 });
  }
}
