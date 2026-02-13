import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '../../../db-store';
import type { Transaction } from '@/types';
import { executePartialSell } from '@/services/domain/position-operations';
import type { PortfolioData } from '../../../db-store';

type SellError = { error: string; status: number };
type SellSuccess = { sold: number; remaining: number; transaction: Transaction };
type SellResult = SellError | SellSuccess;

function isSellError(r: SellResult): r is SellError {
  return 'error' in r;
}

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

function getStoredPrice(data: PortfolioData, symbol: string): number | null {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  const value =
    data.customPrices[lower]?.price
    ?? data.prices[lower]?.price
    ?? data.customPrices[upper]?.price
    ?? data.prices[upper]?.price;
  return typeof value === 'number' && value > 0 ? value : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { amount: sellAmount, percent, price: sellPrice, date: sellDate } = body;

    const result = await withDb<SellResult>(data => {
      const position = data.positions.find(p => p.id === id);
      if (!position) return { data, result: { error: 'Position not found', status: 404 } };

      let actualSellAmount = sellAmount ? Number(sellAmount) : 0;
      if (!actualSellAmount && percent) {
        actualSellAmount = position.amount * (Number(percent) / 100);
      }

      if (!actualSellAmount || actualSellAmount <= 0) {
        return { data, result: { error: 'No sell amount or percent provided', status: 400 } };
      }
      if (actualSellAmount > position.amount) {
        return { data, result: { error: 'Insufficient amount', status: 400 } };
      }

      const explicitPrice = sellPrice ? Number(sellPrice) : 0;
      const effectivePrice = explicitPrice > 0 ? explicitPrice : getStoredPrice(data, position.symbol) || 0;
      if (effectivePrice <= 0) {
        return { data, result: { error: 'No sell price provided and no stored price available', status: 400 } };
      }

      const date = toDateOnlyString(sellDate);
      const operation = executePartialSell(position, actualSellAmount, effectivePrice, date);

      const tx: Transaction = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...operation.transaction,
      };

      const remaining = operation.removedPositionId ? 0 : (operation.updatedPosition?.amount ?? 0);
      const nowIso = new Date().toISOString();
      let newPositions: typeof data.positions;
      if (operation.removedPositionId) {
        newPositions = data.positions.filter(p => p.id !== operation.removedPositionId);
      } else {
        newPositions = data.positions.map(p =>
          p.id === id ? { ...p, ...operation.updatedPosition, updatedAt: nowIso } : p
        );
      }

      return {
        data: { ...data, positions: newPositions, transactions: [...data.transactions, tx] },
        result: { sold: actualSellAmount, remaining, transaction: tx },
      };
    });

    if (isSellError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: `Failed to sell: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
