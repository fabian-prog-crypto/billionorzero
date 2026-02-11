/**
 * Command System Types
 *
 * Type definitions for the tool-use cmd-k architecture.
 * Tools are divided into: queries (read store), mutations (modify store), navigation.
 */

// ─── Tool Types ──────────────────────────────────────────────────────────────

export type ToolType = 'query' | 'mutation' | 'navigation';

/** What the LLM returns after parsing user text. */
export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  confidence: number;
}

/** Schema field definition for a tool argument. */
export interface ToolField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  enum?: string[];
}

/** Full tool definition in the registry. */
export interface ToolDefinition {
  id: string;
  type: ToolType;
  description: string;
  fields: ToolField[];
  examples: string[];
}

// ─── Query Results ───────────────────────────────────────────────────────────

export type QueryResultFormat = 'metric' | 'table' | 'list';

export interface QueryResult {
  format: QueryResultFormat;
  title: string;
  /** Single value display (metric format). */
  value?: string;
  /** Helper text below the value. */
  subtitle?: string;
  /** Table/list rows. */
  rows?: QueryRow[];
  /** Column headers for table format. */
  columns?: string[];
}

export interface QueryRow {
  label: string;
  values: string[];
  /** Optional color hint for the row. */
  color?: 'positive' | 'negative' | 'muted';
}

// ─── Mutation Results ────────────────────────────────────────────────────────

export interface MutationPreview {
  tool: string;
  summary: string;
  /** Changes to display for confirmation. */
  changes: MutationChange[];
  /** The resolved args to pass to executeMutation on confirm. */
  resolvedArgs: Record<string, unknown>;
}

export interface MutationChange {
  label: string;
  before?: string;
  after: string;
}

export interface MutationResult {
  success: boolean;
  summary: string;
  error?: string;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export interface NavigationResult {
  route: string;
}

// ─── Command Result Union ────────────────────────────────────────────────────

export type CommandResult =
  | { type: 'query'; data: QueryResult }
  | { type: 'mutation'; data: MutationPreview }
  | { type: 'navigation'; data: NavigationResult }
  | { type: 'error'; message: string };
