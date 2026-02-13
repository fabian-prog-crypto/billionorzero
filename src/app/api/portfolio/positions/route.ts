import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '../db-store';
import { calculateAllPositionsWithPrices } from '@/services/domain/portfolio-calculator';
import { assetClassFromType, typeFromAssetClass } from '@/types';
import type { Position, AssetClass } from '@/types';

// GET /api/portfolio/positions - List positions with prices
export async function GET(request: NextRequest) {
  const db = readDb();
  const url = request.nextUrl;
  const accountId = url.searchParams.get('accountId');
  const assetClass = url.searchParams.get('assetClass') as AssetClass | null;
  const type = url.searchParams.get('type');
  const top = url.searchParams.get('top');
  const search = url.searchParams.get('search');
  const sort = url.searchParams.get('sort');

  let positions = db.positions;
  const total = positions.length;

  // Filters
  if (accountId) positions = positions.filter(p => p.accountId === accountId);
  if (assetClass) positions = positions.filter(p => (p.assetClass ?? assetClassFromType(p.type)) === assetClass);
  if (type) positions = positions.filter(p => p.type === type);
  if (search) {
    const s = search.toLowerCase();
    positions = positions.filter(p =>
      p.symbol.toLowerCase().includes(s) ||
      p.name.toLowerCase().includes(s)
    );
  }

  // Enrich with prices and consistent allocation semantics for the filtered set.
  const pricedPositions = calculateAllPositionsWithPrices(positions, db.prices, db.customPrices, db.fxRates);
  const pricedById = new Map(pricedPositions.map((asset) => [asset.id, asset]));
  const enriched = positions.map((p) => {
    const withPrice = pricedById.get(p.id);
    if (!withPrice) {
      return { ...p, currentPrice: 0, value: 0, change24h: 0, changePercent24h: 0, allocation: 0 };
    }
    return {
      ...p,
      currentPrice: withPrice.currentPrice,
      value: withPrice.value,
      change24h: withPrice.change24h,
      changePercent24h: withPrice.changePercent24h,
      allocation: withPrice.allocation,
    };
  });

  // Sort
  if (sort === 'value') enriched.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Top N
  const result = top ? enriched.slice(0, parseInt(top)) : enriched;

  return NextResponse.json({ data: result, meta: { total, filtered: result.length } });
}

// POST /api/portfolio/positions - Create position
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, amount, assetClass, type, name, price, costBasis, accountId, isDebt, chain, protocol } = body;

    if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    if (amount === undefined || amount === null) return NextResponse.json({ error: 'amount is required' }, { status: 400 });

    const now = new Date().toISOString();
    const effectiveAssetClass = assetClass || (type ? assetClassFromType(type) : 'crypto');
    const effectiveType = type || typeFromAssetClass(effectiveAssetClass);

    const position: Position = {
      id: crypto.randomUUID(),
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      amount: Number(amount),
      assetClass: effectiveAssetClass,
      type: effectiveType,
      costBasis: costBasis ? Number(costBasis) : (price ? Number(price) * Number(amount) : undefined),
      accountId,
      isDebt: isDebt || false,
      chain,
      protocol,
      addedAt: now,
      updatedAt: now,
    };

    const result = await withDb(data => ({
      data: { ...data, positions: [...data.positions, position] },
      result: position,
    }));

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Failed to create position: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

// DELETE /api/portfolio/positions - Bulk delete
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids)) return NextResponse.json({ error: 'ids array is required' }, { status: 400 });

    const idSet = new Set(ids);
    const result = await withDb(data => ({
      data: { ...data, positions: data.positions.filter(p => !idSet.has(p.id)) },
      result: { deleted: ids.length },
    }));

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: `Failed to delete positions: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
