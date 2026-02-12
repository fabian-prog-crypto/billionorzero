import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../../db-store';
import { calculatePositionValue } from '@/services/domain/portfolio-calculator';
import type { Transaction } from '@/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = readDb();
  const position = db.positions.find(p => p.id === id);
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 });

  const withPrice = calculatePositionValue(position, db.prices, db.customPrices, db.fxRates);
  return NextResponse.json({ data: { ...position, currentPrice: withPrice.currentPrice, value: withPrice.value, change24h: withPrice.change24h, changePercent24h: withPrice.changePercent24h } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const result = await withDb(data => {
      const idx = data.positions.findIndex(p => p.id === id);
      if (idx === -1) return { data, result: null };

      const updated = { ...data.positions[idx], ...body, updatedAt: new Date().toISOString() };
      const positions = [...data.positions];
      positions[idx] = updated;
      return { data: { ...data, positions }, result: updated };
    });

    if (!result) return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: `Failed to update position: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sell = request.nextUrl.searchParams.get('sell') === 'true';
  const sellPrice = request.nextUrl.searchParams.get('price');

  try {
    const result = await withDb(data => {
      const position = data.positions.find(p => p.id === id);
      if (!position) return { data, result: null };

      const newPositions = data.positions.filter(p => p.id !== id);
      let newTransactions = data.transactions;

      if (sell && sellPrice) {
        const tx: Transaction = {
          id: crypto.randomUUID(),
          type: 'sell',
          symbol: position.symbol,
          name: position.name,
          assetType: position.type,
          amount: position.amount,
          pricePerUnit: Number(sellPrice),
          totalValue: position.amount * Number(sellPrice),
          costBasisAtExecution: position.costBasis,
          positionId: position.id,
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        };
        newTransactions = [...data.transactions, tx];
      }

      return { data: { ...data, positions: newPositions, transactions: newTransactions }, result: { deleted: true } };
    });

    if (!result) return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: `Failed to delete position: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
