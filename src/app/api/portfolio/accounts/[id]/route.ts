import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb } from '@/app/api/portfolio/db-store';
import type { AccountConnection } from '@/types';

/**
 * GET /api/portfolio/accounts/[id] — Single account + its positions.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = readDb();

    const account = data.accounts.find((a) => a.id === id);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const positions = data.positions.filter((p) => p.accountId === id);

    return NextResponse.json({ data: { ...account, positions } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get account: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/portfolio/accounts/[id] — Update account fields.
 * Body: { name?, isActive?, connection? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, isActive, connection } = body as {
      name?: string;
      isActive?: boolean;
      connection?: AccountConnection;
    };

    const updated = await withDb((data) => {
      const idx = data.accounts.findIndex((a) => a.id === id);
      if (idx === -1) {
        return { data, result: null };
      }

      const account = { ...data.accounts[idx] };
      if (name !== undefined) account.name = name.trim();
      if (isActive !== undefined) account.isActive = isActive;
      if (connection !== undefined) account.connection = connection;

      const accounts = [...data.accounts];
      accounts[idx] = account;

      return { data: { ...data, accounts }, result: account };
    });

    if (!updated) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update account: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/accounts/[id] — Delete account + cascade delete positions.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await withDb((data) => {
      const account = data.accounts.find((a) => a.id === id);
      if (!account) {
        return { data, result: null };
      }

      const accounts = data.accounts.filter((a) => a.id !== id);
      const removedPositions = data.positions.filter((p) => p.accountId === id);
      const positions = data.positions.filter((p) => p.accountId !== id);

      return {
        data: { ...data, accounts, positions },
        result: { account, removedPositions: removedPositions.length },
      };
    });

    if (!result) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        deleted: result.account,
        removedPositions: result.removedPositions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to delete account: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
