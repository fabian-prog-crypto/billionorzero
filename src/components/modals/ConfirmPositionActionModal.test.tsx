/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Position, AssetWithPrice, ParsedPositionAction } from '@/types';

// ---------- mocks ----------

vi.mock('@/services/domain/position-operations', () => ({
  executePartialSell: vi.fn().mockReturnValue({
    transaction: { id: 'tx-1', totalValue: 500 },
    updatedPosition: { amount: 5 },
  }),
  executeFullSell: vi.fn().mockReturnValue({
    transaction: { id: 'tx-2', totalValue: 1000 },
    removedPositionId: 'pos-btc',
  }),
  executeBuy: vi.fn().mockReturnValue({
    transaction: { id: 'tx-3', totalValue: 1000 },
    newPosition: {
      type: 'crypto',
      symbol: 'ETH',
      name: 'Ethereum',
      amount: 1,
      costBasis: 1000,
      assetClass: 'crypto',
    },
  }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: vi.fn((v: number) => `$${v.toLocaleString()}`),
  formatNumber: vi.fn((v: number) => v.toLocaleString()),
  formatPercent: vi.fn((v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`),
  getChangeColor: vi.fn(() => ''),
  cn: vi.fn((...args: unknown[]) => args.filter(Boolean).join(' ')),
}));

// ---------- store mock ----------

const mockUpdatePosition = vi.fn();
const mockRemovePosition = vi.fn();
const mockAddPosition = vi.fn();
const mockAddTransaction = vi.fn();
const mockUpdatePrice = vi.fn();
const mockSetCustomPrice = vi.fn();

let _accounts: Account[] = [];

const mockStoreState = {
  updatePosition: mockUpdatePosition,
  removePosition: mockRemovePosition,
  addPosition: mockAddPosition,
  addTransaction: mockAddTransaction,
  updatePrice: mockUpdatePrice,
  setCustomPrice: mockSetCustomPrice,
  accounts: _accounts,
  walletAccounts: () =>
    _accounts.filter(
      (a) =>
        a.connection.dataSource === 'debank' ||
        a.connection.dataSource === 'helius'
    ),
  cexAccounts: () =>
    _accounts.filter(
      (a) =>
        a.connection.dataSource === 'binance' ||
        a.connection.dataSource === 'coinbase' ||
        a.connection.dataSource === 'kraken' ||
        a.connection.dataSource === 'okx'
    ),
  brokerageAccounts: () =>
    _accounts.filter(
      (a) => a.connection.dataSource === 'manual' && !a.slug
    ),
  cashAccounts: () =>
    _accounts.filter(
      (a) => a.connection.dataSource === 'manual' && !!a.slug
    ),
  manualAccounts: () =>
    _accounts.filter((a) => a.connection.dataSource === 'manual'),
};

vi.mock('@/store/portfolioStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeFunction = (selector?: (state: any) => any) => {
    if (selector) return selector(mockStoreState);
    return mockStoreState;
  };
  storeFunction.getState = () => mockStoreState;
  storeFunction.setState = vi.fn();
  storeFunction.subscribe = vi.fn();
  return { usePortfolioStore: storeFunction };
});

import ConfirmPositionActionModal from './ConfirmPositionActionModal';

// ---------- test helpers ----------

function makeAccount(overrides: Partial<Account> & { id: string; name: string }): Account {
  return {
    isActive: true,
    addedAt: '2025-01-01',
    connection: { dataSource: 'manual' } as Account['connection'],
    ...overrides,
  };
}

function makePosition(overrides: Partial<Position> & { id: string; symbol: string }): Position {
  return {
    type: 'crypto',
    assetClass: 'crypto',
    name: overrides.symbol,
    amount: 10,
    costBasis: 1000,
    ...overrides,
  } as Position;
}

function makeAssetWithPrice(pos: Position, price = 100): AssetWithPrice {
  return {
    ...pos,
    currentPrice: price,
    value: pos.amount * price,
    change24h: 0,
    changePercent24h: 0,
    allocation: 0,
  };
}

function baseParsedAction(overrides: Partial<ParsedPositionAction>): ParsedPositionAction {
  return {
    action: 'buy',
    symbol: 'BTC',
    assetType: 'crypto',
    confidence: 1,
    summary: 'Test action',
    ...overrides,
  };
}

const noop = vi.fn();

// ---------- tests ----------

describe('ConfirmPositionActionModal — account relationship fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _accounts = [];
    mockStoreState.accounts = _accounts;
  });

  // ========== Change 1: relevantAccounts filtering ==========

  describe('relevantAccounts filtering', () => {
    it('shows wallet + CEX accounts for crypto buys, not cash accounts', () => {
      const walletAcct = makeAccount({
        id: 'w1',
        name: 'My Wallet',
        connection: { dataSource: 'debank', address: '0xabc' } as Account['connection'],
      });
      const cexAcct = makeAccount({
        id: 'c1',
        name: 'Binance',
        connection: { dataSource: 'binance', apiKey: 'k', apiSecret: 's' } as Account['connection'],
      });
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [walletAcct, cexAcct, cashAcct];
      mockStoreState.accounts = _accounts;

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({ action: 'buy', assetType: 'crypto', symbol: 'ETH' })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );

      // Wallet and CEX should appear as options
      expect(screen.getByText('My Wallet')).toBeInTheDocument();
      expect(screen.getByText('Binance')).toBeInTheDocument();
      // Cash account should NOT appear
      expect(screen.queryByText('Revolut')).not.toBeInTheDocument();
    });

    it('shows brokerage accounts for stock buys', () => {
      const brokerageAcct = makeAccount({
        id: 'b1',
        name: 'IBKR',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [brokerageAcct, cashAcct];
      mockStoreState.accounts = _accounts;

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({ action: 'buy', assetType: 'stock', symbol: 'AAPL' })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );

      expect(screen.getByText('IBKR')).toBeInTheDocument();
      expect(screen.queryByText('Revolut')).not.toBeInTheDocument();
    });

    it('shows manual accounts for update_cash action', () => {
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      const brokerageAcct = makeAccount({
        id: 'b1',
        name: 'IBKR',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct, brokerageAcct];
      mockStoreState.accounts = _accounts;

      const cashPos = makePosition({
        id: 'pos-chf',
        symbol: 'CASH_CHF_123',
        name: 'Revolut (CHF)',
        type: 'cash',
        assetClass: 'cash',
        amount: 5000,
        accountId: 'cash1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'update_cash',
            symbol: 'CASH_CHF_123',
            assetType: 'cash',
            amount: 6000,
            matchedPositionId: 'pos-chf',
          })}
          positions={[cashPos]}
          positionsWithPrices={[]}
        />
      );

      // Account dropdown should appear with "Account" label
      const accountLabels = screen.getAllByText('Account');
      expect(accountLabels.length).toBeGreaterThan(0);
      expect(screen.getByText('Revolut')).toBeInTheDocument();
      // Brokerage/manual accounts are selectable for cash movements
      expect(screen.getByText('IBKR')).toBeInTheDocument();
    });

    it('shows cash accounts for add_cash action', () => {
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'N26',
        slug: 'n26',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct];
      mockStoreState.accounts = _accounts;

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'add_cash',
            symbol: 'CASH_EUR',
            assetType: 'cash',
            amount: 1000,
            currency: 'EUR',
            accountName: 'N26',
          })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );

      // Modal should render add cash fields
      expect(screen.getByText(/Add Cash/)).toBeInTheDocument();
    });
  });

  // ========== Change 2: selectedAccountId initialization ==========

  describe('selectedAccountId initialization for update_cash', () => {
    it('pre-selects account from matched position for update_cash', () => {
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct];
      mockStoreState.accounts = _accounts;

      const cashPos = makePosition({
        id: 'pos-chf',
        symbol: 'CASH_CHF_123',
        name: 'Revolut (CHF)',
        type: 'cash',
        assetClass: 'cash',
        amount: 5000,
        accountId: 'cash1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'update_cash',
            symbol: 'CASH_CHF_123',
            assetType: 'cash',
            amount: 6000,
            matchedPositionId: 'pos-chf',
          })}
          positions={[cashPos]}
          positionsWithPrices={[]}
        />
      );

      // The account dropdown should have Revolut selected
      const selectElements = screen.getAllByRole('combobox');
      const accountSelect = selectElements.find((sel) => {
        const options = Array.from(sel.querySelectorAll('option'));
        return options.some((o) => o.textContent === 'Revolut');
      });
      expect(accountSelect).toBeDefined();
      expect((accountSelect as HTMLSelectElement).value).toBe('cash1');
    });
  });

  // ========== Change 4: add_cash sets accountId on new position ==========

  describe('add_cash sets accountId', () => {
    it('creates new cash position with accountId from selected dropdown', async () => {
      const user = userEvent.setup();
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct];
      mockStoreState.accounts = _accounts;

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'add_cash',
            symbol: 'CASH_EUR',
            assetType: 'cash',
            amount: 1000,
            currency: 'EUR',
            accountName: 'NewBank',
          })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );

      // Click confirm (amount and accountName are pre-filled)
      const confirmBtn = screen.getByRole('button', { name: /Add/i });
      await user.click(confirmBtn);

      expect(mockAddPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cash',
          assetClass: 'cash',
          amount: 1000,
          costBasis: 1000,
        })
      );
    });
  });

  // ========== Change 5: update_cash moves position between accounts ==========

  describe('update_cash account change', () => {
    it('updates accountId when user selects a different bank account', async () => {
      const user = userEvent.setup();
      const cashAcct1 = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      const cashAcct2 = makeAccount({
        id: 'cash2',
        name: 'N26',
        slug: 'n26',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct1, cashAcct2];
      mockStoreState.accounts = _accounts;

      const cashPos = makePosition({
        id: 'pos-chf',
        symbol: 'CASH_CHF_123',
        name: 'Revolut (CHF)',
        type: 'cash',
        assetClass: 'cash',
        amount: 5000,
        accountId: 'cash1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'update_cash',
            symbol: 'CASH_CHF_123',
            assetType: 'cash',
            amount: 6000,
            matchedPositionId: 'pos-chf',
          })}
          positions={[cashPos]}
          positionsWithPrices={[]}
        />
      );

      // Change the account dropdown to N26
      const selectElements = screen.getAllByRole('combobox');
      const accountSelect = selectElements.find((sel) => {
        const options = Array.from(sel.querySelectorAll('option'));
        return options.some((o) => o.textContent === 'N26');
      });
      expect(accountSelect).toBeDefined();
      await user.selectOptions(accountSelect!, 'cash2');

      // Click confirm
      const confirmBtn = screen.getByRole('button', { name: /Update/i });
      await user.click(confirmBtn);

      // Should update position with new accountId
      expect(mockUpdatePosition).toHaveBeenCalledWith('pos-chf', {
        amount: 6000,
        costBasis: 6000,
        accountId: 'cash2',
      });
    });

    it('does not set accountId when account selection unchanged', async () => {
      const user = userEvent.setup();
      const cashAcct1 = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct1];
      mockStoreState.accounts = _accounts;

      const cashPos = makePosition({
        id: 'pos-chf',
        symbol: 'CASH_CHF_123',
        name: 'Revolut (CHF)',
        type: 'cash',
        assetClass: 'cash',
        amount: 5000,
        accountId: 'cash1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'update_cash',
            symbol: 'CASH_CHF_123',
            assetType: 'cash',
            amount: 6000,
            matchedPositionId: 'pos-chf',
          })}
          positions={[cashPos]}
          positionsWithPrices={[]}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Update/i });
      await user.click(confirmBtn);

      // Should update amount/costBasis but NOT accountId
      expect(mockUpdatePosition).toHaveBeenCalledWith('pos-chf', {
        amount: 6000,
        costBasis: 6000,
      });
    });
  });

  // ========== Change 6: sell shows account context ==========

  describe('sell shows account context', () => {
    it('displays account name on sell when position has accountId', () => {
      const walletAcct = makeAccount({
        id: 'w1',
        name: 'Main Wallet',
        connection: { dataSource: 'debank', address: '0xabc' } as Account['connection'],
      });
      _accounts = [walletAcct];
      mockStoreState.accounts = _accounts;

      const btcPos = makePosition({
        id: 'pos-btc',
        symbol: 'BTC',
        amount: 10,
        accountId: 'w1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'sell_partial',
            symbol: 'BTC',
            assetType: 'crypto',
            sellAmount: 5,
            sellPrice: 50000,
            matchedPositionId: 'pos-btc',
          })}
          positions={[btcPos]}
          positionsWithPrices={[makeAssetWithPrice(btcPos, 50000)]}
        />
      );

      expect(screen.getByText(/Account: Main Wallet/)).toBeInTheDocument();
    });

    it('does not show account label when position has no accountId', () => {
      _accounts = [];
      mockStoreState.accounts = _accounts;

      const btcPos = makePosition({
        id: 'pos-btc',
        symbol: 'BTC',
        amount: 10,
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'sell_partial',
            symbol: 'BTC',
            assetType: 'crypto',
            sellAmount: 5,
            sellPrice: 50000,
            matchedPositionId: 'pos-btc',
          })}
          positions={[btcPos]}
          positionsWithPrices={[makeAssetWithPrice(btcPos, 50000)]}
        />
      );

      expect(screen.queryByText(/Account:/)).not.toBeInTheDocument();
    });
  });

  // ========== Change 7: set_price shows account on affected positions ==========

  describe('set_price shows account on affected positions', () => {
    it('displays account name next to affected positions', () => {
      const walletAcct = makeAccount({
        id: 'w1',
        name: 'DeFi Wallet',
        connection: { dataSource: 'debank', address: '0xabc' } as Account['connection'],
      });
      _accounts = [walletAcct];
      mockStoreState.accounts = _accounts;

      const btcPos = makePosition({
        id: 'pos-btc',
        symbol: 'BTC',
        amount: 0.5,
        accountId: 'w1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'set_price',
            symbol: 'BTC',
            assetType: 'crypto',
            newPrice: 60000,
          })}
          positions={[btcPos]}
          positionsWithPrices={[makeAssetWithPrice(btcPos, 50000)]}
        />
      );

      // Should show "· DeFi Wallet" next to the affected position
      expect(screen.getByText(/DeFi Wallet/)).toBeInTheDocument();
    });
  });

  // ========== Change 8: remove shows account context ==========

  describe('remove shows account context', () => {
    it('displays account name next to position in removal confirmation', () => {
      const cexAcct = makeAccount({
        id: 'c1',
        name: 'Binance',
        connection: { dataSource: 'binance', apiKey: 'k', apiSecret: 's' } as Account['connection'],
      });
      _accounts = [cexAcct];
      mockStoreState.accounts = _accounts;

      const ethPos = makePosition({
        id: 'pos-eth',
        symbol: 'ETH',
        amount: 5,
        accountId: 'c1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'remove',
            symbol: 'ETH',
            assetType: 'crypto',
            matchedPositionId: 'pos-eth',
          })}
          positions={[ethPos]}
          positionsWithPrices={[makeAssetWithPrice(ethPos, 2000)]}
        />
      );

      // Should show "· Binance" next to the position
      expect(screen.getByText(/Binance/)).toBeInTheDocument();
    });

    it('does not show account for positions without accountId', () => {
      _accounts = [];
      mockStoreState.accounts = _accounts;

      const ethPos = makePosition({
        id: 'pos-eth',
        symbol: 'ETH',
        amount: 5,
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'remove',
            symbol: 'ETH',
            assetType: 'crypto',
            matchedPositionId: 'pos-eth',
          })}
          positions={[ethPos]}
          positionsWithPrices={[makeAssetWithPrice(ethPos, 2000)]}
        />
      );

      // Only text that should appear is "ETH", "5 units" etc — no account name
      const removeSection = screen.getByText('ETH').closest('div');
      expect(removeSection?.textContent).not.toContain('·');
    });
  });

  // ========== Change 9: crypto buy accountId fallback ==========

  describe('crypto buy accountId fallback', () => {
    it('falls back to first wallet account for crypto buy when no selection', async () => {
      const user = userEvent.setup();
      const walletAcct = makeAccount({
        id: 'w1',
        name: 'Hot Wallet',
        connection: { dataSource: 'debank', address: '0xabc' } as Account['connection'],
      });
      _accounts = [walletAcct];
      mockStoreState.accounts = _accounts;

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'buy',
            symbol: 'ETH',
            assetType: 'crypto',
            amount: 1,
            pricePerUnit: 1000,
          })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Buy/i });
      await user.click(confirmBtn);

      // The new position should have the wallet's accountId
      expect(mockAddPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'w1',
        })
      );
    });
  });

  // ========== Change 3 + 10: update_cash preview shows bank name ==========

  describe('update_cash preview shows bank account name', () => {
    it('shows bank account name in balance change preview', () => {
      const cashAcct = makeAccount({
        id: 'cash1',
        name: 'Revolut',
        slug: 'revolut',
        connection: { dataSource: 'manual' } as Account['connection'],
      });
      _accounts = [cashAcct];
      mockStoreState.accounts = _accounts;

      const cashPos = makePosition({
        id: 'pos-chf',
        symbol: 'CASH_CHF_123',
        name: 'Revolut (CHF)',
        type: 'cash',
        assetClass: 'cash',
        amount: 5000,
        accountId: 'cash1',
      });

      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({
            action: 'update_cash',
            symbol: 'CASH_CHF_123',
            assetType: 'cash',
            amount: 6000,
            matchedPositionId: 'pos-chf',
          })}
          positions={[cashPos]}
          positionsWithPrices={[]}
        />
      );

      // Preview should show the bank account name
      expect(screen.getByText(/Balance Change/)).toBeInTheDocument();
      // Should include "· Revolut" in the preview text
      expect(screen.getByText(/Revolut \(CHF\).*Revolut/s)).toBeInTheDocument();
    });
  });

  // ========== Basic rendering tests ==========

  describe('basic rendering', () => {
    it('does not render when isOpen is false', () => {
      const { container } = render(
        <ConfirmPositionActionModal
          isOpen={false}
          onClose={noop}
          parsedAction={baseParsedAction({})}
          positions={[]}
          positionsWithPrices={[]}
        />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders modal with correct action label for buy', () => {
      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({ action: 'buy', symbol: 'BTC' })}
          positions={[]}
          positionsWithPrices={[]}
        />
      );
      expect(screen.getByText('Buy')).toBeInTheDocument();
      // BTC appears inside the header "Confirm: Buy BTC" — split across elements
      expect(screen.getByText(/Confirm/)).toHaveTextContent('BTC');
    });

    it('renders modal with correct action label for remove', () => {
      const pos = makePosition({ id: 'pos-1', symbol: 'DOGE', amount: 100 });
      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({ action: 'remove', symbol: 'DOGE', matchedPositionId: 'pos-1' })}
          positions={[pos]}
          positionsWithPrices={[makeAssetWithPrice(pos, 0.1)]}
        />
      );
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('closes when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmPositionActionModal
          isOpen={true}
          onClose={noop}
          parsedAction={baseParsedAction({})}
          positions={[]}
          positionsWithPrices={[]}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(noop).toHaveBeenCalled();
    });
  });
});
