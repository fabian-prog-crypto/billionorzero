import type { Account } from '@/types';

const ACCOUNT_ARG_KEYS = [
  'account',
  'accountName',
  'account_name',
  'accountLabel',
  'account_label',
  'bankAccount',
  'bank_account',
  'destinationAccount',
  'destination_account',
  'destination',
  'to',
] as const;

export interface ResolveAccountOptions {
  manualOnly?: boolean;
}

export type AccountResolutionStatus = 'missing' | 'matched' | 'unmatched' | 'ambiguous';

export interface AccountResolutionResult {
  status: AccountResolutionStatus;
  input?: string;
  account?: Account;
}

function normalizeAccountLookupName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '');
}

function getAccountPool(accounts: Account[], options?: ResolveAccountOptions): Account[] {
  if (options?.manualOnly) {
    return accounts.filter((account) => account.connection.dataSource === 'manual');
  }
  return accounts;
}

function resolveAccountByInput(
  accounts: Account[],
  accountInput: string,
  options?: ResolveAccountOptions,
): AccountResolutionResult {
  const input = accountInput.trim();
  if (!input) return { status: 'missing' };

  const normalizedInput = normalizeAccountLookupName(input);
  if (!normalizedInput) return { status: 'missing' };

  const pool = getAccountPool(accounts, options);
  const normalizedPool = pool.map((account) => ({
    account,
    normalized: normalizeAccountLookupName(account.name),
  }));

  const exactMatches = normalizedPool.filter((entry) => entry.normalized === normalizedInput);
  if (exactMatches.length === 1) {
    return { status: 'matched', input, account: exactMatches[0].account };
  }
  if (exactMatches.length > 1) {
    return { status: 'ambiguous', input };
  }

  const partialMatches = normalizedPool.filter((entry) => (
    !!entry.normalized &&
    (entry.normalized.includes(normalizedInput) || normalizedInput.includes(entry.normalized))
  ));
  if (partialMatches.length === 1) {
    return { status: 'matched', input, account: partialMatches[0].account };
  }
  if (partialMatches.length > 1) {
    return { status: 'ambiguous', input };
  }

  return { status: 'unmatched', input };
}

export function extractAccountInput(args: Record<string, unknown>): string | undefined {
  for (const key of ACCOUNT_ARG_KEYS) {
    const value = args[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function resolveAccountFromArgs(
  accounts: Account[],
  args: Record<string, unknown>,
  options?: ResolveAccountOptions,
): AccountResolutionResult {
  const input = extractAccountInput(args);
  if (!input) return { status: 'missing' };
  return resolveAccountByInput(accounts, input, options);
}

export function resolveAccountByName(
  accounts: Account[],
  accountInput: string,
  options?: ResolveAccountOptions,
): AccountResolutionResult {
  return resolveAccountByInput(accounts, accountInput, options);
}
