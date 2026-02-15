import type { Account, Position } from '@/types';
import { resolveAccountByName, type AccountResolutionResult } from '../command-account-resolver';
import { findPositionBySymbol } from '../action-mapper';
import type { CommandFrame, CommandTarget, ResolutionResult, ResolutionStatus } from './contracts';

export interface CommandResolverData {
  accounts: Account[];
  positions: Position[];
}

function shouldRequireExistingPosition(commandId: string): boolean {
  return commandId === 'sell_partial'
    || commandId === 'sell_all'
    || commandId === 'remove_position'
    || commandId === 'update_position';
}

function resolveAccount(
  frame: CommandFrame,
  data: CommandResolverData,
): { resolution: AccountResolutionResult; target: CommandTarget } {
  const accountName = frame.target?.accountName;
  if (!accountName) {
    return { resolution: { status: 'missing' }, target: { ...frame.target } };
  }

  const manualOnly = frame.commandId === 'add_cash' || frame.commandId === 'update_cash';
  const resolution = resolveAccountByName(data.accounts, accountName, { manualOnly });
  const target: CommandTarget = { ...frame.target };
  if (resolution.status === 'matched' && resolution.account) {
    target.accountId = resolution.account.id;
    target.accountName = resolution.account.name;
  }

  return { resolution, target };
}

function resolvePosition(
  frame: CommandFrame,
  data: CommandResolverData,
): { position?: Position } {
  const symbol = frame.target?.symbol;
  if (!symbol) return {};
  return { position: findPositionBySymbol(data.positions, symbol) };
}

export function resolveCommandTarget(frame: CommandFrame, data: CommandResolverData): ResolutionResult {
  let status: ResolutionStatus = 'matched';
  const warnings: string[] = [];

  const { resolution: accountResolution, target } = resolveAccount(frame, data);
  if (accountResolution.status === 'ambiguous') {
    status = 'ambiguous';
    warnings.push('Account match is ambiguous.');
  }
  if (accountResolution.status === 'unmatched') {
    status = 'unresolved';
    warnings.push('Account match not found.');
  }

  const { position } = resolvePosition(frame, data);
  if (position) {
    target.positionId = position.id;
    target.symbol = position.symbol.toUpperCase();
    if (position.accountId) target.accountId = position.accountId;
  } else if (shouldRequireExistingPosition(frame.commandId) && frame.target?.symbol) {
    status = status === 'ambiguous' ? 'ambiguous' : 'unresolved';
    warnings.push('Position match not found.');
  }

  return {
    status,
    target,
    warnings: warnings.length ? warnings : undefined,
  };
}
