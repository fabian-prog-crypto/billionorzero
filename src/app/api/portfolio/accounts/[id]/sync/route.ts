import { NextRequest, NextResponse } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';

/**
 * POST /api/portfolio/accounts/[id]/sync — Trigger account sync (stub).
 */
export async function POST(
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

    return NextResponse.json({
      data: {
        status: 'sync_triggered',
        message: `Sync initiated for account ${account.name}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to trigger sync: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
