import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { readDb, withDb } from '@/app/api/portfolio/db-store';
import { toSlug } from '@/services/domain/cash-account-service';
import { buildManualAccountHoldings, isManualAccountInScope } from '@/services/domain/account-role-service';
import { type Account, type AccountConnection } from '@/types';

type AccountTypeFilter = 'wallet' | 'cex' | 'brokerage' | 'cash';

function matchesTypeFilter(
  account: Account,
  type: AccountTypeFilter,
  manualHoldings: ReturnType<typeof buildManualAccountHoldings>
): boolean {
  const ds = account.connection.dataSource;
  switch (type) {
    case 'wallet':
      return ds === 'debank' || ds === 'helius';
    case 'cex':
      return ds === 'binance' || ds === 'coinbase' || ds === 'kraken' || ds === 'okx';
    case 'brokerage':
      if (ds !== 'manual') return false;
      return isManualAccountInScope(manualHoldings.get(account.id), 'brokerage');
    case 'cash':
      if (ds !== 'manual') return false;
      return isManualAccountInScope(manualHoldings.get(account.id), 'cash');
    default:
      return false;
  }
}

/**
 * GET /api/portfolio/accounts — List all accounts with optional type filter.
 * Query: ?type=wallet|cex|brokerage|cash
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') as AccountTypeFilter | null;

    const data = readDb();
    let accounts = data.accounts;

    if (typeFilter) {
      const valid: AccountTypeFilter[] = ['wallet', 'cex', 'brokerage', 'cash'];
      if (!valid.includes(typeFilter)) {
        return NextResponse.json(
          { error: `Invalid type filter: ${typeFilter}. Must be one of: ${valid.join(', ')}` },
          { status: 400 }
        );
      }
      const manualHoldings = buildManualAccountHoldings(data.positions);
      accounts = accounts.filter((a) => matchesTypeFilter(a, typeFilter, manualHoldings));
    }

    const total = data.accounts.length;
    return NextResponse.json({ data: accounts, meta: { total, filtered: accounts.length } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list accounts: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio/accounts — Create a new account.
 * Body: { name, connection, slug?, isActive? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, connection, slug, isActive } = body as {
      name?: string;
      connection?: AccountConnection;
      slug?: string;
      isActive?: boolean;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!connection || !connection.dataSource) {
      return NextResponse.json({ error: 'connection with dataSource is required' }, { status: 400 });
    }

    const account = await withDb<{ duplicate: boolean; account: Account }>((data) => {
      // Dedup manual accounts by normalized name first.
      if (connection.dataSource === 'manual') {
        const normalizedName = name.trim().toLowerCase();
        const existingByName = data.accounts.find(
          (a) =>
            a.connection.dataSource === 'manual' &&
            a.name.trim().toLowerCase() === normalizedName
        );
        if (existingByName) {
          return { data, result: { duplicate: true as const, account: existingByName } };
        }

        // Legacy dedup by slug (for older clients still sending slug).
        if (slug) {
          const normalizedSlug = toSlug(slug);
          const existingBySlug = data.accounts.find((a) => a.slug === normalizedSlug);
          if (existingBySlug) {
            return { data, result: { duplicate: true as const, account: existingBySlug } };
          }
        }
      }

      const newAccount: Account = {
        id: uuidv4(),
        name: name.trim(),
        isActive: isActive ?? true,
        connection,
        ...(slug ? { slug: toSlug(slug) } : {}),
        addedAt: new Date().toISOString(),
      };

      return {
        data: { ...data, accounts: [...data.accounts, newAccount] },
        result: { duplicate: false as const, account: newAccount },
      };
    });

    if (account.duplicate) {
      return NextResponse.json({ data: account.account }, { status: 200 });
    }

    return NextResponse.json({ data: account.account }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create account: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
