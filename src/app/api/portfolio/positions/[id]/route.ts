import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../../db-store';
import { calculatePositionValue } from '@/services/domain/portfolio-calculator';
import type { Transaction } from '@/types';

function toDateOnlyString(input: unknown): string {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'today') return new Date().toISOString().split('T')[0];
    if (normalized === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    if (normalized === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

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

      const current = data.positions[idx];
      const updates: Record<string, unknown> = {};

      if (body.amount !== undefined) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { data, result: { error: 'Amount must be greater than 0' } };
        }
        updates.amount = amount;
        if (current.type === 'cash' && body.costBasis === undefined) {
          updates.costBasis = amount;
        }
      }

      if (body.costBasis !== undefined) {
        const costBasis = Number(body.costBasis);
        if (!Number.isFinite(costBasis) || costBasis < 0) {
          return { data, result: { error: 'Cost basis must be >= 0' } };
        }
        updates.costBasis = costBasis;
      }

      const dateInput = body.purchaseDate ?? body.date;
      if (dateInput !== undefined && String(dateInput).trim() !== '') {
        updates.purchaseDate = toDateOnlyString(dateInput);
      }

      if (body.accountId !== undefined) {
        const accountId = String(body.accountId || '').trim();
        if (accountId) {
          const account = data.accounts.find((a) => a.id === accountId);
          if (!account) {
            return { data, result: { error: `Unknown accountId: ${accountId}` } };
          }
          updates.accountId = accountId;
        } else {
          updates.accountId = undefined;
        }
      }

      if (Object.keys(updates).length === 0) {
        return { data, result: { error: 'No supported update fields provided' } };
      }

      const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
      const positions = [...data.positions];
      positions[idx] = updated;
      return { data: { ...data, positions }, result: updated };
    });

    if (!result) return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
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
