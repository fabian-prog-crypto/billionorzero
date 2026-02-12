import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '../../db-store';
import { assetClassFromType, typeFromAssetClass } from '@/types';
import type { Position } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { positions: inputPositions } = body;

    if (!Array.isArray(inputPositions) || inputPositions.length === 0) {
      return NextResponse.json({ error: 'positions array is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newPositions: Position[] = inputPositions.map((p: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      symbol: (String(p.symbol || '')).toUpperCase(),
      name: String(p.name || p.symbol || ''),
      amount: Number(p.amount || 0),
      assetClass: (p.assetClass as Position['assetClass']) || (p.type ? assetClassFromType(p.type as Position['type']) : 'crypto'),
      type: (p.type as Position['type']) || typeFromAssetClass((p.assetClass as Position['assetClass']) || 'crypto'),
      costBasis: p.costBasis ? Number(p.costBasis) : undefined,
      accountId: p.accountId as string | undefined,
      isDebt: Boolean(p.isDebt),
      chain: p.chain as string | undefined,
      protocol: p.protocol as string | undefined,
      addedAt: now,
      updatedAt: now,
    }));

    const result = await withDb(data => ({
      data: { ...data, positions: [...data.positions, ...newPositions] },
      result: newPositions,
    }));

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Failed to create positions: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
