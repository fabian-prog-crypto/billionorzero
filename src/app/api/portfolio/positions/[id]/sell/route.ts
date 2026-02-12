import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '../../../db-store';
import type { Transaction } from '@/types';

type SellError = { error: string; status: number };
type SellSuccess = { sold: number; remaining: number; transaction: Transaction };
type SellResult = SellError | SellSuccess;

function isSellError(r: SellResult): r is SellError {
  return 'error' in r;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { amount: sellAmount, percent, price: sellPrice } = body;

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

      const effectivePrice = sellPrice ? Number(sellPrice) : 0;
      const remaining = position.amount - actualSellAmount;

      const tx: Transaction = {
        id: crypto.randomUUID(),
        type: 'sell',
        symbol: position.symbol,
        name: position.name,
        assetType: position.type,
        amount: actualSellAmount,
        pricePerUnit: effectivePrice,
        totalValue: actualSellAmount * effectivePrice,
        costBasisAtExecution: position.costBasis,
        positionId: position.id,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };

      let newPositions: typeof data.positions;
      if (remaining <= 0) {
        newPositions = data.positions.filter(p => p.id !== id);
      } else {
        newPositions = data.positions.map(p =>
          p.id === id ? { ...p, amount: remaining, updatedAt: new Date().toISOString() } : p
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
