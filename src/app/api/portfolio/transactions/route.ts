import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../db-store';
import type { Transaction, AssetType } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const db = readDb();
    const url = request.nextUrl;

    let transactions = db.transactions;

    const symbol = url.searchParams.get('symbol');
    if (symbol) {
      transactions = transactions.filter(
        (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
      );
    }

    const positionId = url.searchParams.get('positionId');
    if (positionId) {
      transactions = transactions.filter((t) => t.positionId === positionId);
    }

    const from = url.searchParams.get('from');
    if (from) {
      transactions = transactions.filter((t) => t.date >= from);
    }

    const to = url.searchParams.get('to');
    if (to) {
      transactions = transactions.filter((t) => t.date <= to);
    }

    return NextResponse.json({ data: transactions });
  } catch {
    return NextResponse.json({ error: 'Failed to read transactions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { type, symbol, name, assetType, amount, pricePerUnit, totalValue } = body;
    if (!type || !symbol || !name || !assetType || amount == null || pricePerUnit == null || totalValue == null) {
      return NextResponse.json(
        { error: 'Missing required fields: type, symbol, name, assetType, amount, pricePerUnit, totalValue' },
        { status: 400 }
      );
    }

    if (!['buy', 'sell', 'transfer'].includes(type)) {
      return NextResponse.json({ error: 'type must be buy, sell, or transfer' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      type: type as 'buy' | 'sell' | 'transfer',
      symbol: symbol as string,
      name: name as string,
      assetType: assetType as AssetType,
      amount: amount as number,
      pricePerUnit: pricePerUnit as number,
      totalValue: totalValue as number,
      positionId: (body.positionId as string) ?? '',
      date: (body.date as string) ?? now.split('T')[0],
      notes: (body.notes as string) ?? undefined,
      createdAt: now,
    };

    const result = await withDb((db) => {
      db.transactions.push(transaction);
      return { data: db, result: transaction };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
