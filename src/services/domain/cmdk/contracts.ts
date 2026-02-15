import type { ToolField, ToolType } from '../command-types';

export type CommandKind = ToolType;

export interface CommandDefinition {
  id: string;
  kind: CommandKind;
  description: string;
  args: ToolField[];
  examples: string[];
}

export type CommandMode = 'delta' | 'absolute';

export interface CommandTarget {
  symbol?: string;
  accountName?: string;
  accountId?: string;
  currency?: string;
  positionId?: string;
  assetTypeHint?: string;
  assetClassHint?: string;
}

export interface CommandQuantity {
  units?: number;
  notional?: number;
  percent?: number;
}

export interface CommandMetadata {
  confidence?: number;
  warnings?: string[];
  source?: 'tool_call' | 'legacy' | 'manual';
}

export interface CommandFrame {
  commandId: string;
  kind: CommandKind;
  mode?: CommandMode;
  target?: CommandTarget;
  quantity?: CommandQuantity;
  date?: string;
  args: Record<string, unknown>;
  metadata?: CommandMetadata;
}

export type ResolutionStatus = 'matched' | 'ambiguous' | 'unresolved';

export interface ResolutionResult {
  status: ResolutionStatus;
  target?: CommandTarget;
  warnings?: string[];
}

export type ExecutionStatus = 'ready' | 'needs_clarification' | 'blocked';

export interface ExecutionPlan {
  commandId: string;
  kind: CommandKind;
  status: ExecutionStatus;
  resolvedArgs: Record<string, unknown>;
  warnings?: string[];
}
