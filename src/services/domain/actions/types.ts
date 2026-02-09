import { ParsedPositionAction, PositionActionType } from '@/types';

/**
 * Context about a position passed to menu generation.
 * Re-exported from prompt-builder for backward compat.
 */
export interface PositionContext {
  id: string;
  symbol: string;
  name: string;
  type: string;
  amount: number;
  costBasis?: number;
  purchaseDate?: string;
  accountName?: string;
  walletAddress?: string;
}

/** A field the LLM needs to extract for this menu item. */
export interface ActionField {
  name: string;
  required: boolean;
  type: 'number' | 'string';
}

/** One option the LLM can choose from. */
export interface MenuItem {
  id: string;
  label: string;
  description: string;
  fields: ActionField[];
  /** Internal: which handler resolves this item. */
  _handler: string;
  /** Internal: pre-resolved data (positionId, currency, etc.). */
  _context: Record<string, unknown>;
}

/** What the LLM returns after picking from the menu. */
export interface LLMMenuResponse {
  menuId: string;
  values: Record<string, string>;
  confidence: number;
}

/** Interface every action handler must implement. */
export interface ActionHandler {
  id: string;
  actionType: PositionActionType;
  generateMenuItems(positions: PositionContext[]): MenuItem[];
  resolve(
    item: MenuItem,
    values: Record<string, string>,
    positions: PositionContext[],
  ): ParsedPositionAction;
}
